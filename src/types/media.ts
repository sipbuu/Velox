export type SourceKind = "xtream" | "m3u" | "local" | "direct" | (string & {});

export type MediaKind = "live" | "movie" | "series" | "episode";

export type StreamContainer = "hls" | "mpegts" | "mp4" | "mkv" | "webm" | "dash" | "unknown";

export interface Artwork {
  logo?: string;
  poster?: string;
  backdrop?: string;
}

export interface Category {
  id: string;
  sourceId: string;
  kind: Exclude<MediaKind, "episode">;
  name: string;
  parentId?: string;
  itemCount?: number;
}

export interface SubtitleTrackRef {
  id: string;
  label: string;
  language?: string;
  url: string;
  format: "vtt" | "srt" | "ass";
  isDefault?: boolean;
}

export interface MediaItemBase {
  uid: string;
  id: string;
  sourceId: string;
  kind: MediaKind;
  title: string;
  categoryIds: string[];
  artwork: Artwork;
  addedAt?: number;
  rating?: number;
  year?: number;
  genres?: string[];
  plot?: string;
  extra?: Record<string, unknown>;
}

export interface LiveChannel extends MediaItemBase {
  kind: "live";
  number?: number;
  epgChannelId?: string;
  hasArchive?: boolean;
  archiveDays?: number;
}

export interface Movie extends MediaItemBase {
  kind: "movie";
  durationSec?: number;
  container?: StreamContainer;
  cast?: string;
  director?: string;
  trailer?: string;
}

export interface Series extends MediaItemBase {
  kind: "series";
  seasonCount?: number;
  cast?: string;
}

export interface Episode extends MediaItemBase {
  kind: "episode";
  seriesUid: string;
  season: number;
  episode: number;
  durationSec?: number;
  container?: StreamContainer;
}

export type MediaItem = LiveChannel | Movie | Series | Episode;

export interface Season {
  number: number;
  name: string;
  artwork?: Artwork;
  episodes: Episode[];
}

export interface SeriesDetail {
  series: Series;
  seasons: Season[];
}

export interface EpgProgramme {
  channelId: string;
  title: string;
  description?: string;
  start: number;
  end: number;
  hasArchive?: boolean;
}

export interface PlaybackRequest {
  url: string;
  container: StreamContainer;
  isLive: boolean;
  headers?: Record<string, string>;
  subtitles?: SubtitleTrackRef[];
  title: string;
  subtitle?: string;
  artwork?: Artwork;
  item?: MediaItem;
  startAt?: number;
}

export interface LibrarySnapshot {
  categories: Category[];
  items: MediaItem[];
  fetchedAt: number;
}

export const mediaUid = (sourceId: string, kind: MediaKind, id: string) => `${sourceId}:${kind}:${id}`;
