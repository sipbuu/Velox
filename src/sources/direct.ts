import { detectContainer } from "@/lib/container";
import { mediaUid, type LibrarySnapshot, type MediaItem, type PlaybackRequest } from "@/types/media";
import type { DirectConfig, MediaSource, SourceCapabilities, SourceFactory } from "./types";

export class DirectSource implements MediaSource<DirectConfig> {
  readonly capabilities: SourceCapabilities = {
    live: true,
    movies: true,
    series: false,
    epg: false,
    catchup: false,
    search: false,
    downloads: true,
  };

  constructor(readonly config: DirectConfig) {}

  async loadLibrary(): Promise<LibrarySnapshot> {
    const sid = this.config.id;
    const items: MediaItem[] = this.config.entries.map((e) =>
      e.isLive
        ? {
            uid: mediaUid(sid, "live", e.id),
            id: e.id,
            sourceId: sid,
            kind: "live",
            title: e.title,
            categoryIds: ["live:direct"],
            artwork: { logo: e.logo },
          }
        : {
            uid: mediaUid(sid, "movie", e.id),
            id: e.id,
            sourceId: sid,
            kind: "movie",
            title: e.title,
            categoryIds: ["movie:direct"],
            artwork: { poster: e.logo },
            container: detectContainer(e.url),
          },
    );
    return {
      categories: [
        { id: "live:direct", sourceId: sid, kind: "live", name: this.config.name },
        { id: "movie:direct", sourceId: sid, kind: "movie", name: this.config.name },
      ],
      items,
      fetchedAt: Date.now(),
    };
  }

  async resolvePlayback(item: MediaItem): Promise<PlaybackRequest> {
    const e = this.config.entries.find((x) => x.id === item.id);
    if (!e) throw new Error("Stream not found");
    return {
      url: e.url,
      container: detectContainer(e.url),
      isLive: e.isLive,
      title: e.title,
      artwork: item.artwork,
      item,
      headers: this.config.userAgent ? { "User-Agent": this.config.userAgent } : undefined,
    };
  }
}

export const directFactory: SourceFactory<DirectConfig> = {
  kind: "direct",
  label: "Direct Stream URLs",
  description: "Bookmark individual HLS, MPEG-TS, MP4 or MKV URLs.",
  secretFields: [],
  create: (config) => new DirectSource(config),
};
