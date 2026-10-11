import { fetchText } from "@/lib/http";
import { detectContainer } from "@/lib/container";
import { hashString } from "@/lib/fallbackArt";
import { invoke } from "@/lib/ipc";
import { isTauri } from "@/lib/platform";
import {
  mediaUid,
  type Category,
  type EpgProgramme,
  type LibrarySnapshot,
  type MediaItem,
  type PlaybackRequest,
} from "@/types/media";
import { parseM3U, type M3UEntry } from "./m3uParser";
import { buildCatchupUrl } from "@/lib/catchup";
import type { LoadContext, M3UConfig, MediaSource, SourceCapabilities, SourceFactory, SourceSecrets } from "./types";

const playlistTextCache = new Map<string, string>();

export function registerLocalPlaylist(sourceId: string, text: string) {
  playlistTextCache.set(sourceId, text);
}

export class M3USource implements MediaSource<M3UConfig> {
  readonly capabilities: SourceCapabilities = {
    live: true,
    movies: true,
    series: true,
    epg: true,
    catchup: true,
    search: true,
    downloads: true,
  };

  private entries = new Map<string, M3UEntry>();
  private items: MediaItem[] = [];
  private epg?: Promise<Map<string, EpgProgramme[]>>;

  constructor(readonly config: M3UConfig) {}

  async loadLibrary(ctx?: LoadContext): Promise<LibrarySnapshot> {
    ctx?.onProgress?.("Downloading playlist", 0.1);
    let text = playlistTextCache.get(this.config.id);
    if (!text) {
      if (!this.config.url) throw new Error("This playlist was imported from a file. Re-import it to refresh.");
      text = await fetchText(this.config.url, { signal: ctx?.signal, userAgent: this.config.userAgent, timeoutMs: 120_000 });
    }
    ctx?.onProgress?.("Parsing playlist", 0.6);
    const pl = parseM3U(text);
    if (!this.config.epgUrl && pl.epgUrls[0]) this.config.epgUrl = pl.epgUrls[0];

    const sid = this.config.id;
    const cats = new Map<string, Category>();
    const items: MediaItem[] = [];
    this.entries.clear();

    pl.entries.forEach((e, idx) => {
      const kind = e.kind;
      const group = e.group || "Uncategorized";
      const catId = `${kind}:${group}`;
      if (!cats.has(catId)) cats.set(catId, { id: catId, sourceId: sid, kind, name: group, itemCount: 0 });
      cats.get(catId)!.itemCount! += 1;

      let id = `${hashString(e.url).toString(36)}${hashString(e.tvgId ?? e.title).toString(36).slice(0, 4)}`;
      for (let n = 2; this.entries.has(id); n++) id = `${id.split("~")[0]}~${n}`;
      this.entries.set(id, e);
      const base = {
        uid: mediaUid(sid, kind, id),
        id,
        sourceId: sid,
        title: e.title,
        categoryIds: [catId],
        extra: { url: e.url, headers: e.headers, group: e.group },
      };
      if (kind === "live") {
        items.push({
          ...base,
          kind,
          artwork: { logo: e.logo },
          epgChannelId: e.tvgId,
          number: idx + 1,
          hasArchive: !!e.catchup,
          archiveDays: e.catchup?.days,
          extra: { ...base.extra, catchup: e.catchup },
        });
      } else if (kind === "movie") {
        items.push({
          ...base,
          kind,
          artwork: { poster: e.logo },
          durationSec: e.duration > 0 ? e.duration : undefined,
          container: detectContainer(e.url),
        });
      } else {
        items.push({ ...base, kind: "series", artwork: { poster: e.logo } });
      }
    });

    this.items = items;
    return { categories: [...cats.values()], items, fetchedAt: Date.now() };
  }

  async getEpg(channel: MediaItem): Promise<EpgProgramme[]> {
    if (channel.kind !== "live" || !channel.epgChannelId || !this.config.epgUrl || !isTauri()) return [];
    this.epg ??= invoke<EpgProgramme[]>("epg_fetch_xmltv", { url: this.config.epgUrl, channelIds: null })
      .then((list) => {
        const map = new Map<string, EpgProgramme[]>();
        for (const p of list) {
          const arr = map.get(p.channelId) ?? [];
          arr.push(p);
          map.set(p.channelId, arr);
        }
        map.forEach((arr) => arr.sort((a, b) => a.start - b.start));
        return map;
      })
      .catch((e) => {
        this.epg = undefined;
        throw e;
      });
    return (await this.epg).get(channel.epgChannelId) ?? [];
  }

  async search(query: string): Promise<MediaItem[]> {
    const q = query.toLowerCase();
    return this.items.filter((i) => i.title.toLowerCase().includes(q)).slice(0, 200);
  }

  async resolvePlayback(item: MediaItem, opts?: { catchupStart?: number; catchupDurationMin?: number }): Promise<PlaybackRequest> {
    const e =
      this.entries.get(item.id) ??
      (typeof item.extra?.url === "string"
        ? { url: item.extra.url, headers: (item.extra.headers as Record<string, string>) ?? {}, group: item.extra.group as string | undefined }
        : undefined);
    if (!e) throw new Error("Stream no longer exists in this playlist. Try refreshing.");
    const headers = { ...(this.config.userAgent ? { "User-Agent": this.config.userAgent } : {}), ...e.headers };
    const catchup = (this.entries.get(item.id)?.catchup ?? item.extra?.catchup) as M3UEntry["catchup"];
    const archiveUrl =
      opts?.catchupStart && catchup ? buildCatchupUrl(e.url, catchup, opts.catchupStart, opts.catchupDurationMin ?? 120) : null;
    if (opts?.catchupStart && !archiveUrl) throw new Error("This channel doesn't provide catch-up.");
    const url = archiveUrl ?? e.url;
    const container = detectContainer(url);
    return {
      url,
      container,
      isLive: item.kind === "live" && !archiveUrl,
      headers: Object.keys(headers).length ? headers : undefined,
      title: item.title,
      subtitle: e.group,
      artwork: item.artwork,
      item,
    };
  }
}

export const m3uFactory: SourceFactory<M3UConfig> = {
  kind: "m3u",
  label: "M3U / M3U8 Playlist",
  description: "A playlist URL or an imported .m3u file. EPG is read from url-tvg when present.",
  secretFields: [],
  create: (config: M3UConfig, _secrets: SourceSecrets) => new M3USource(config),
};
