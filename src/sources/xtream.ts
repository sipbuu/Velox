import { fetchJson } from "@/lib/http";
import { detectContainer } from "@/lib/container";
import {
  mediaUid,
  type Category,
  type Episode,
  type EpgProgramme,
  type LibrarySnapshot,
  type LiveChannel,
  type MediaItem,
  type Movie,
  type PlaybackRequest,
  type Season,
  type Series,
  type SeriesDetail,
} from "@/types/media";
import type { SourceDetail } from "@/lib/metadata";
import type { LoadContext, MediaSource, SourceCapabilities, SourceFactory, SourceSecrets, XtreamConfig } from "./types";

interface XtCategory {
  category_id: string;
  category_name: string;
  parent_id?: number | string;
}

interface XtLive {
  num?: number;
  name: string;
  stream_id: number | string;
  stream_icon?: string;
  epg_channel_id?: string | null;
  added?: string;
  category_id?: string | null;
  category_ids?: (number | string)[];
  tv_archive?: number | string;
  tv_archive_duration?: number | string;
  is_adult?: number | string;
}

interface XtVod {
  name: string;
  stream_id: number | string;
  stream_icon?: string;
  rating?: string | number;
  added?: string;
  category_id?: string | null;
  category_ids?: (number | string)[];
  container_extension?: string;
  year?: string | number;
  plot?: string;
  genre?: string;
  is_adult?: number | string;
}

interface XtSeries {
  name: string;
  series_id: number | string;
  cover?: string;
  plot?: string;
  cast?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string | number;
  backdrop_path?: string[];
  category_id?: string | null;
  category_ids?: (number | string)[];
  last_modified?: string;
  year?: string | number;
}

interface XtEpisode {
  id: string;
  episode_num: number | string;
  title: string;
  container_extension?: string;
  season: number | string;
  added?: string;
  info?: { movie_image?: string; plot?: string; duration_secs?: number; rating?: number | string };
  subtitles?: { url?: string; language?: string; label?: string }[];
}

interface XtSeriesInfo {
  info: XtSeries;
  seasons?: { season_number: number; name: string; cover?: string; cover_big?: string }[];
  episodes?: Record<string, XtEpisode[]> | XtEpisode[][];
}

interface XtVodInfo {
  info?: {
    movie_image?: string;
    backdrop_path?: string[] | string;
    youtube_trailer?: string;
    plot?: string;
    description?: string;
    cast?: string;
    actors?: string;
    director?: string;
    genre?: string;
    releasedate?: string;
    duration_secs?: number | string;
    rating?: number | string;
    tmdb_id?: number | string;
  };
}

interface XtAuth {
  user_info?: { auth: number; status?: string; exp_date?: string | null; message?: string };
  server_info?: { url: string; port: string; https_port?: string; server_protocol?: string };
}

interface XtShortEpg {
  epg_listings?: {
    title: string;
    description?: string;
    start_timestamp: string | number;
    stop_timestamp: string | number;
    has_archive?: number | string;
    channel_id?: string;
  }[];
}

const b64 = (s?: string) => {
  if (!s) return "";
  try {
    return decodeURIComponent(escape(atob(s)));
  } catch {
    return s;
  }
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : undefined;
};

const catIds = (single?: string | null, many?: (number | string)[]) =>
  many?.length ? many.map(String) : single ? [String(single)] : [];

export class XtreamSource implements MediaSource<XtreamConfig> {
  readonly capabilities: SourceCapabilities = {
    live: true,
    movies: true,
    series: true,
    epg: true,
    catchup: true,
    search: true,
    downloads: true,
  };

  private cache?: LibrarySnapshot;

  constructor(
    readonly config: XtreamConfig,
    private readonly secrets: SourceSecrets,
  ) {}

  private get base(): string {
    return this.config.server.replace(/\/+$/, "");
  }

  private get creds(): string {
    return `${encodeURIComponent(this.config.username)}/${encodeURIComponent(this.secrets.password ?? "")}`;
  }

  private api<T>(action?: string, params: Record<string, string | number> = {}, ctx?: LoadContext): Promise<T> {
    const q = new URLSearchParams({
      username: this.config.username,
      password: this.secrets.password ?? "",
      ...(action ? { action } : {}),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    return fetchJson<T>(`${this.base}/player_api.php?${q}`, {
      signal: ctx?.signal,
      userAgent: this.config.userAgent,
    });
  }

  async authenticate(ctx?: LoadContext) {
    const res = await this.api<XtAuth>(undefined, {}, ctx);
    const ok = res.user_info?.auth === 1;
    const exp = num(res.user_info?.exp_date);
    return {
      ok,
      message: ok ? res.user_info?.status : (res.user_info?.message ?? "Invalid credentials"),
      expiresAt: exp ? exp * 1000 : undefined,
    };
  }

  async loadLibrary(ctx?: LoadContext): Promise<LibrarySnapshot> {
    const sid = this.config.id;
    ctx?.onProgress?.("Fetching categories", 0.05);
    const [liveCats, vodCats, seriesCats] = await Promise.all([
      this.api<XtCategory[]>("get_live_categories", {}, ctx).catch(() => []),
      this.api<XtCategory[]>("get_vod_categories", {}, ctx).catch(() => []),
      this.api<XtCategory[]>("get_series_categories", {}, ctx).catch(() => []),
    ]);

    const categories: Category[] = [
      ...liveCats.map((c) => this.toCategory(c, "live")),
      ...vodCats.map((c) => this.toCategory(c, "movie")),
      ...seriesCats.map((c) => this.toCategory(c, "series")),
    ];

    ctx?.onProgress?.("Fetching channels, movies and series", 0.3);
    const [live, vod, series] = await Promise.all([
      this.api<XtLive[]>("get_live_streams", {}, ctx).catch(() => []),
      this.api<XtVod[]>("get_vod_streams", {}, ctx).catch(() => []),
      this.api<XtSeries[]>("get_series", {}, ctx).catch(() => []),
    ]);

    ctx?.onProgress?.("Indexing library", 0.9);
    const items: MediaItem[] = [];
    for (const l of live) {
      const id = String(l.stream_id);
      items.push({
        uid: mediaUid(sid, "live", id),
        id,
        sourceId: sid,
        kind: "live",
        title: l.name,
        number: num(l.num),
        categoryIds: catIds(l.category_id, l.category_ids).map((c) => `live:${c}`),
        artwork: { logo: l.stream_icon || undefined },
        epgChannelId: l.epg_channel_id || undefined,
        hasArchive: String(l.tv_archive) === "1",
        archiveDays: num(l.tv_archive_duration),
        addedAt: num(l.added) ? num(l.added)! * 1000 : undefined,
        extra: String(l.is_adult) === "1" ? { adult: true } : undefined,
      } satisfies LiveChannel);
    }
    for (const v of vod) {
      const id = String(v.stream_id);
      items.push({
        uid: mediaUid(sid, "movie", id),
        id,
        sourceId: sid,
        kind: "movie",
        title: v.name,
        categoryIds: catIds(v.category_id, v.category_ids).map((c) => `movie:${c}`),
        artwork: { poster: v.stream_icon || undefined },
        rating: num(v.rating),
        year: num(v.year),
        plot: v.plot,
        genres: v.genre?.split(/,\s*/),
        container: detectContainer("", v.container_extension),
        addedAt: num(v.added) ? num(v.added)! * 1000 : undefined,
        extra: { ext: v.container_extension ?? "mp4", ...(String(v.is_adult) === "1" ? { adult: true } : {}) },
      } satisfies Movie);
    }
    for (const s of series) {
      const id = String(s.series_id);
      items.push({
        uid: mediaUid(sid, "series", id),
        id,
        sourceId: sid,
        kind: "series",
        title: s.name,
        categoryIds: catIds(s.category_id, s.category_ids).map((c) => `series:${c}`),
        artwork: { poster: s.cover || undefined, backdrop: s.backdrop_path?.[0] },
        plot: s.plot,
        cast: s.cast,
        genres: s.genre?.split(/,\s*/),
        rating: num(s.rating),
        year: num(s.year) ?? num(s.releaseDate?.slice(0, 4)),
        addedAt: num(s.last_modified) ? num(s.last_modified)! * 1000 : undefined,
      } satisfies Series);
    }

    this.cache = { categories, items, fetchedAt: Date.now() };
    return this.cache;
  }

  private toCategory(c: XtCategory, kind: Category["kind"]): Category {
    return {
      id: `${kind}:${c.category_id}`,
      sourceId: this.config.id,
      kind,
      name: c.category_name,
      parentId: c.parent_id && String(c.parent_id) !== "0" ? `${kind}:${c.parent_id}` : undefined,
    };
  }

  async getSeriesDetail(seriesId: string, ctx?: LoadContext): Promise<SeriesDetail> {
    const sid = this.config.id;
    const info = await this.api<XtSeriesInfo>("get_series_info", { series_id: seriesId }, ctx);
    const seriesUid = mediaUid(sid, "series", seriesId);
    const cached = this.cache?.items.find((i) => i.uid === seriesUid) as Series | undefined;
    const series: Series = cached ?? {
      uid: seriesUid,
      id: seriesId,
      sourceId: sid,
      kind: "series",
      title: info.info?.name ?? "Series",
      categoryIds: [],
      artwork: { poster: info.info?.cover, backdrop: info.info?.backdrop_path?.[0] },
      plot: info.info?.plot,
    };

    const groups: XtEpisode[][] = Array.isArray(info.episodes) ? info.episodes : Object.values(info.episodes ?? {});
    const seasonMeta = new Map((info.seasons ?? []).map((s) => [s.season_number, s]));
    const seasons: Season[] = groups
      .filter((g) => g.length)
      .map((eps) => {
        const number = num(eps[0].season) ?? 0;
        const meta = seasonMeta.get(number);
        return {
          number,
          name: meta?.name || `Season ${number}`,
          artwork: { poster: meta?.cover_big || meta?.cover },
          episodes: eps.map(
            (e): Episode => ({
              uid: mediaUid(sid, "episode", e.id),
              id: e.id,
              sourceId: sid,
              kind: "episode",
              seriesUid,
              title: e.title,
              season: number,
              episode: num(e.episode_num) ?? 0,
              categoryIds: [],
              artwork: { poster: e.info?.movie_image },
              plot: e.info?.plot,
              durationSec: e.info?.duration_secs,
              rating: num(e.info?.rating),
              container: detectContainer("", e.container_extension),
              extra: {
                ext: e.container_extension ?? "mp4",
                subtitles: e.subtitles,
              },
            }),
          ),
        };
      })
      .sort((a, b) => a.number - b.number);
    return { series, seasons };
  }

  async getItemDetail(item: MediaItem, ctx?: LoadContext): Promise<SourceDetail> {
    const pickBackdrop = (b?: string[] | string) => (Array.isArray(b) ? b[0] : b) || undefined;
    if (item.kind === "movie") {
      const res = await this.api<XtVodInfo>("get_vod_info", { vod_id: item.id }, ctx);
      const i = res.info ?? {};
      return {
        plot: i.plot || i.description,
        cast: i.cast || i.actors,
        director: i.director,
        genres: i.genre?.split(/,\s*/).filter(Boolean),
        rating: num(i.rating),
        durationSec: num(i.duration_secs),
        releaseDate: i.releasedate,
        trailer: i.youtube_trailer,
        backdrop: pickBackdrop(i.backdrop_path),
        poster: i.movie_image,
        tmdbId: i.tmdb_id ? String(i.tmdb_id) : undefined,
      };
    }
    if (item.kind === "series") {
      const res = await this.api<{ info?: XtSeries & { youtube_trailer?: string; director?: string; tmdb?: string | number } }>("get_series_info", { series_id: item.id }, ctx);
      const i = res.info;
      return {
        plot: i?.plot,
        cast: i?.cast,
        director: i?.director,
        genres: i?.genre?.split(/,\s*/).filter(Boolean),
        rating: num(i?.rating),
        releaseDate: i?.releaseDate,
        trailer: i?.youtube_trailer,
        backdrop: i?.backdrop_path?.[0],
        tmdbId: i?.tmdb ? String(i.tmdb) : undefined,
      };
    }
    return {};
  }

  async getEpg(channel: MediaItem, ctx?: LoadContext): Promise<EpgProgramme[]> {
    if (channel.kind !== "live") return [];
    const map = (res: XtShortEpg) =>
      (res.epg_listings ?? [])
        .map((p) => ({
          channelId: channel.id,
          title: b64(p.title),
          description: b64(p.description),
          start: (num(p.start_timestamp) ?? 0) * 1000,
          end: (num(p.stop_timestamp) ?? 0) * 1000,
          hasArchive: Number(p.has_archive) === 1,
        }))
        .filter((p) => p.end > p.start)
        .sort((a, b) => a.start - b.start);
    const full = await this.api<XtShortEpg>("get_simple_data_table", { stream_id: channel.id }, ctx).then(map).catch(() => []);
    if (full.length) return full;
    return map(await this.api<XtShortEpg>("get_short_epg", { stream_id: channel.id, limit: 24 }, ctx));
  }

  async search(query: string): Promise<MediaItem[]> {
    const q = query.toLowerCase();
    return (this.cache?.items ?? []).filter((i) => i.title.toLowerCase().includes(q)).slice(0, 200);
  }

  async resolvePlayback(
    item: MediaItem,
    opts?: { catchupStart?: number; catchupDurationMin?: number },
  ): Promise<PlaybackRequest> {
    const headers = this.config.userAgent ? { "User-Agent": this.config.userAgent } : undefined;
    const base = { title: item.title, artwork: item.artwork, item, headers };

    if (item.kind === "live") {
      const fmt = this.config.preferredLiveFormat;
      if (opts?.catchupStart) {
        const d = new Date(opts.catchupStart);
        const pad = (n: number) => String(n).padStart(2, "0");
        const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}:${pad(d.getHours())}-${pad(d.getMinutes())}`;
        const dur = opts.catchupDurationMin ?? 120;
        return {
          ...base,
          url: `${this.base}/timeshift/${this.creds}/${dur}/${start}/${item.id}.${fmt}`,
          container: fmt === "m3u8" ? "hls" : "mpegts",
          isLive: false,
        };
      }
      return {
        ...base,
        url: `${this.base}/live/${this.creds}/${item.id}.${fmt}`,
        container: fmt === "m3u8" ? "hls" : "mpegts",
        isLive: true,
      };
    }

    const ext = String(item.extra?.ext ?? "mp4");
    const path = item.kind === "movie" ? "movie" : "series";
    const subs = (item.extra?.subtitles as XtEpisode["subtitles"]) ?? [];
    return {
      ...base,
      url: `${this.base}/${path}/${this.creds}/${item.id}.${ext}`,
      container: detectContainer("", ext),
      isLive: false,
      subtitle: item.kind === "episode" ? `S${item.season} · E${item.episode}` : item.year ? String(item.year) : undefined,
      subtitles: subs
        .filter((s) => s.url)
        .map((s, i) => ({
          id: `xt-${i}`,
          label: s.label ?? s.language ?? `Track ${i + 1}`,
          language: s.language,
          url: s.url!,
          format: s.url!.endsWith(".srt") ? "srt" : "vtt",
        })),
    };
  }
}

export const xtreamFactory: SourceFactory<XtreamConfig> = {
  kind: "xtream",
  label: "Xtream Codes",
  description: "Live TV, movies, series and EPG from an Xtream Codes compatible server.",
  secretFields: ["password"],
  create: (config, secrets) => new XtreamSource(config, secrets),
};
