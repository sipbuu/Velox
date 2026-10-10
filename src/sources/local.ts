import { invoke, toPlayableFileUrl } from "@/lib/ipc";
import { isTauri } from "@/lib/platform";
import { detectContainer } from "@/lib/container";
import { subtitleFormatFromName } from "@/lib/subtitles";
import { hashString } from "@/lib/fallbackArt";
import {
  mediaUid,
  type Category,
  type LibrarySnapshot,
  type MediaItem,
  type PlaybackRequest,
  type SubtitleTrackRef,
} from "@/types/media";
import type { LocalConfig, LoadContext, MediaSource, SourceCapabilities, SourceFactory } from "./types";

export interface LocalFileEntry {
  path: string;
  name: string;
  size: number;
  modified: number;
  folder: string;
  subtitles: string[];
}

const webFiles = new Map<string, { file: File; subtitles: File[] }>();

export function registerWebFiles(sourceId: string, files: File[]): number {
  const media = files.filter((f) => /\.(mp4|m4v|mov|mkv|webm|ts|m2ts|mp3|m4a|aac|flac)$/i.test(f.name));
  const subs = files.filter((f) => subtitleFormatFromName(f.name));
  for (const f of media) {
    const stem = f.name.replace(/\.[^.]+$/, "");
    webFiles.set(`${sourceId}|${f.webkitRelativePath || f.name}`, {
      file: f,
      subtitles: subs.filter((s) => s.name.startsWith(stem)),
    });
  }
  return media.length;
}

const prettyTitle = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[._]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const EPISODE_RE = /s(\d{1,2})\s*e(\d{1,3})/i;

export class LocalSource implements MediaSource<LocalConfig> {
  readonly capabilities: SourceCapabilities = {
    live: false,
    movies: true,
    series: false,
    epg: false,
    catchup: false,
    search: true,
    downloads: false,
  };

  private files = new Map<string, LocalFileEntry>();

  constructor(readonly config: LocalConfig) {}

  private async scan(): Promise<LocalFileEntry[]> {
    if (isTauri()) return invoke<LocalFileEntry[]>("local_scan", { folders: this.config.folders });
    const prefix = `${this.config.id}|`;
    return [...webFiles.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => ({
        path: k,
        name: v.file.name,
        size: v.file.size,
        modified: v.file.lastModified,
        folder: v.file.webkitRelativePath.split("/").slice(0, -1).join("/") || "Imported",
        subtitles: v.subtitles.map((s) => s.name),
      }));
  }

  async loadLibrary(ctx?: LoadContext): Promise<LibrarySnapshot> {
    ctx?.onProgress?.("Scanning folders", 0.2);
    const entries = await this.scan();
    const sid = this.config.id;
    const cats = new Map<string, Category>();
    const items: MediaItem[] = [];
    this.files.clear();

    for (const f of entries) {
      const folderName = f.folder.split(/[\\/]/).filter(Boolean).pop() ?? "Local";
      const catId = `movie:${f.folder}`;
      if (!cats.has(catId)) cats.set(catId, { id: catId, sourceId: sid, kind: "movie", name: folderName, itemCount: 0 });
      cats.get(catId)!.itemCount! += 1;
      const id = hashString(f.path).toString(36);
      this.files.set(id, f);
      const ep = EPISODE_RE.exec(f.name);
      items.push({
        uid: mediaUid(sid, "movie", id),
        id,
        sourceId: sid,
        kind: "movie",
        title: prettyTitle(f.name),
        categoryIds: [catId],
        artwork: {},
        addedAt: f.modified,
        container: detectContainer(f.name),
        extra: { size: f.size, path: f.path, ...(ep ? { season: +ep[1], episode: +ep[2] } : {}) },
      });
    }
    return { categories: [...cats.values()], items, fetchedAt: Date.now() };
  }

  async search(query: string): Promise<MediaItem[]> {
    const q = query.toLowerCase();
    const snap = [...this.files.entries()].filter(([, f]) => f.name.toLowerCase().includes(q));
    return snap.map(([id, f]) => ({
      uid: mediaUid(this.config.id, "movie", id),
      id,
      sourceId: this.config.id,
      kind: "movie",
      title: prettyTitle(f.name),
      categoryIds: [],
      artwork: {},
    }));
  }

  async resolvePlayback(item: MediaItem): Promise<PlaybackRequest> {
    const f = this.files.get(item.id);
    if (!f) throw new Error("File not found. It may have been moved or deleted.");

    let url: string;
    let subtitles: SubtitleTrackRef[] = [];
    if (isTauri()) {
      url = await toPlayableFileUrl(f.path);
      const dir = f.path.slice(0, Math.max(f.path.lastIndexOf("/"), f.path.lastIndexOf("\\")) + 1);
      subtitles = await Promise.all(
        f.subtitles.map(async (name, i) => ({
          id: `local-${i}`,
          label: name.replace(/\.[^.]+$/, ""),
          language: /\.([a-z]{2,3})\.[^.]+$/i.exec(name)?.[1],
          url: await toPlayableFileUrl(dir + name),
          format: subtitleFormatFromName(name) ?? "vtt",
        })),
      );
    } else {
      const entry = webFiles.get(f.path);
      if (!entry) throw new Error("Re-select the folder to play files in the web build.");
      url = URL.createObjectURL(entry.file);
      subtitles = entry.subtitles.map((s, i) => ({
        id: `web-${i}`,
        label: s.name.replace(/\.[^.]+$/, ""),
        url: URL.createObjectURL(s),
        format: subtitleFormatFromName(s.name) ?? "vtt",
      }));
    }

    return {
      url,
      container: detectContainer(f.name),
      isLive: false,
      title: item.title,
      subtitle: f.folder,
      artwork: item.artwork,
      item,
      subtitles,
    };
  }
}

export const localFactory: SourceFactory<LocalConfig> = {
  kind: "local",
  label: "Local Files",
  description: "Play MP4, MKV, WebM, TS and HLS files from folders on this device, including sidecar subtitles.",
  secretFields: [],
  create: (config) => new LocalSource(config),
};
