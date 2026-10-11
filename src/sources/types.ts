import type {
  Category,
  EpgProgramme,
  LibrarySnapshot,
  MediaItem,
  MediaKind,
  PlaybackRequest,
  SeriesDetail,
  SourceKind,
} from "@/types/media";
import type { SourceDetail } from "@/lib/metadata";

export interface SourceCapabilities {
  live: boolean;
  movies: boolean;
  series: boolean;
  epg: boolean;
  catchup: boolean;
  search: boolean;
  downloads: boolean;
}

export interface SourceConfigBase {
  id: string;
  kind: SourceKind;
  name: string;
  enabled: boolean;
  createdAt: number;
  userAgent?: string;
  epgUrl?: string;
}

export interface XtreamConfig extends SourceConfigBase {
  kind: "xtream";
  server: string;
  username: string;
  preferredLiveFormat: "m3u8" | "ts";
}

export interface M3UConfig extends SourceConfigBase {
  kind: "m3u";
  url?: string;
  fileName?: string;
}

export interface LocalConfig extends SourceConfigBase {
  kind: "local";
  folders: string[];
}

export interface DirectConfig extends SourceConfigBase {
  kind: "direct";
  entries: { id: string; title: string; url: string; isLive: boolean; logo?: string }[];
}

export type KnownSourceConfig = XtreamConfig | M3UConfig | LocalConfig | DirectConfig;
export type SourceConfig = KnownSourceConfig | (SourceConfigBase & Record<string, unknown>);

export interface SourceSecrets {
  password?: string;
  token?: string;
  [key: string]: string | undefined;
}

export interface LoadContext {
  signal?: AbortSignal;
  onProgress?: (message: string, fraction?: number) => void;
}

export interface MediaSource<C extends SourceConfigBase = SourceConfigBase> {
  readonly config: C;
  readonly capabilities: SourceCapabilities;

  authenticate?(ctx?: LoadContext): Promise<{ ok: boolean; message?: string; expiresAt?: number }>;

  loadLibrary(ctx?: LoadContext): Promise<LibrarySnapshot>;

  loadCategoryItems?(category: Category, ctx?: LoadContext): Promise<MediaItem[]>;

  getSeriesDetail?(seriesId: string, ctx?: LoadContext): Promise<SeriesDetail>;

  getItemDetail?(item: MediaItem, ctx?: LoadContext): Promise<SourceDetail>;

  getEpg?(channel: MediaItem, ctx?: LoadContext): Promise<EpgProgramme[]>;

  search?(query: string, kinds?: MediaKind[], ctx?: LoadContext): Promise<MediaItem[]>;

  resolvePlayback(item: MediaItem, opts?: { catchupStart?: number; catchupDurationMin?: number }): Promise<PlaybackRequest>;

  dispose?(): void;
}

export interface SourceFactory<C extends SourceConfigBase = SourceConfigBase> {
  kind: SourceKind;
  label: string;
  description: string;
  secretFields: (keyof SourceSecrets)[];
  create(config: C, secrets: SourceSecrets): MediaSource<C>;
}
