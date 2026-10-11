import { requestJson, request } from "@/lib/http";
import { detectContainer } from "@/lib/container";
import type { SourceDetail } from "@/lib/metadata";
import {
  mediaUid,
  type Category,
  type Episode,
  type LibrarySnapshot,
  type MediaItem,
  type PlaybackRequest,
  type Season,
  type Series,
  type SeriesDetail,
  type SubtitleTrackRef,
} from "@/types/media";
import type { LoadContext, MediaSource, PlexConfig, SourceCapabilities, SourceFactory, SourceSecrets } from "./types";

interface PlexStream {
  streamType: number;
  key?: string;
  codec?: string;
  language?: string;
  languageCode?: string;
  displayTitle?: string;
  default?: boolean;
}

interface PlexPart {
  id: number;
  key: string;
  container?: string;
  Stream?: PlexStream[];
}

interface PlexMeta {
  ratingKey: string;
  key: string;
  type: string;
  title: string;
  summary?: string;
  year?: number;
  thumb?: string;
  art?: string;
  grandparentThumb?: string;
  rating?: number;
  audienceRating?: number;
  addedAt?: number;
  duration?: number;
  index?: number;
  parentIndex?: number;
  originallyAvailableAt?: string;
  Genre?: { tag: string }[];
  Role?: { tag: string; role?: string; thumb?: string }[];
  Director?: { tag: string }[];
  Guid?: { id: string }[];
  Media?: { container?: string; videoCodec?: string; Part: PlexPart[] }[];
  Extras?: { Metadata?: PlexMeta[] };
  viewOffset?: number;
}

interface Container<T> {
  MediaContainer: { Metadata?: T[]; Directory?: { key: string; title: string; type: string }[]; size?: number };
}

export const PLEX_PRODUCT = "Velox";

export function plexHeaders(clientId: string, token?: string): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Plex-Product": PLEX_PRODUCT,
    "X-Plex-Version": __APP_VERSION__,
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Platform": "Web",
    "X-Plex-Device-Name": "Velox",
    ...(token ? { "X-Plex-Token": token } : {}),
  };
}

export class PlexSource implements MediaSource<PlexConfig> {
  readonly capabilities: SourceCapabilities = { live: false, movies: true, series: true, epg: false, catchup: false, search: true, downloads: true };
  private items: MediaItem[] = [];
  private sessionId = Math.random().toString(36).slice(2);

  constructor(
    readonly config: PlexConfig,
    private readonly secrets: SourceSecrets,
  ) {}

  private get base() {
    return this.config.server.replace(/\/+$/, "");
  }

  private get token() {
    return this.secrets.token ?? "";
  }

  private api<T>(path: string, signal?: AbortSignal) {
    return requestJson<T>(`${this.base}${path}`, { headers: plexHeaders(this.config.clientId, this.token), signal, timeoutMs: 60_000 });
  }

  private photo(path?: string, w = 400, h = 600) {
    if (!path) return undefined;
    if (/^https?:/.test(path)) return path;
    return `${this.base}/photo/:/transcode?width=${w}&height=${h}&minSize=1&upscale=1&url=${encodeURIComponent(path)}&X-Plex-Token=${this.token}`;
  }

  async authenticate() {
    const res = await this.api<{ MediaContainer: { friendlyName?: string } }>("/");
    return { ok: true, message: res.MediaContainer.friendlyName };
  }

  private toItem(m: PlexMeta, categoryId: string): MediaItem | null {
    const sid = this.config.id;
    const common = {
      id: m.ratingKey,
      sourceId: sid,
      title: m.title,
      categoryIds: [categoryId],
      plot: m.summary,
      year: m.year,
      rating: m.audienceRating ?? m.rating,
      genres: m.Genre?.map((g) => g.tag),
      addedAt: m.addedAt ? m.addedAt * 1000 : undefined,
      artwork: { poster: this.photo(m.thumb), backdrop: this.photo(m.art, 1280, 720) },
    };
    if (m.type === "movie") {
      const part = m.Media?.[0]?.Part?.[0];
      return {
        ...common,
        uid: mediaUid(sid, "movie", m.ratingKey),
        kind: "movie",
        durationSec: m.duration ? m.duration / 1000 : undefined,
        container: detectContainer("", part?.container ?? m.Media?.[0]?.container),
        extra: { partKey: part?.key, container: part?.container ?? m.Media?.[0]?.container },
      };
    }
    if (m.type === "show") return { ...common, uid: mediaUid(sid, "series", m.ratingKey), kind: "series" };
    return null;
  }

  async loadLibrary(ctx?: LoadContext): Promise<LibrarySnapshot> {
    const sid = this.config.id;
    ctx?.onProgress?.("Loading Plex libraries", 0.1);
    const sections = await this.api<Container<never>>("/library/sections", ctx?.signal);
    const dirs = (sections.MediaContainer.Directory ?? []).filter((d) => d.type === "movie" || d.type === "show");
    const categories: Category[] = [];
    const items: MediaItem[] = [];
    for (const [n, d] of dirs.entries()) {
      ctx?.onProgress?.(`Loading ${d.title}`, 0.1 + (0.85 * n) / Math.max(1, dirs.length));
      const kind = d.type === "show" ? "series" : "movie";
      const res = await this.api<Container<PlexMeta>>(`/library/sections/${d.key}/all?includeGuids=1`, ctx?.signal);
      const catId = `${kind}:${d.key}`;
      const list = res.MediaContainer.Metadata ?? [];
      categories.push({ id: catId, sourceId: sid, kind, name: d.title, itemCount: list.length });
      for (const m of list) {
        const it = this.toItem(m, catId);
        if (it) items.push(it);
      }
    }
    this.items = items;
    return { categories, items, fetchedAt: Date.now() };
  }

  async search(query: string) {
    const q = query.toLowerCase();
    return this.items.filter((i) => i.title.toLowerCase().includes(q)).slice(0, 200);
  }

  async getSeriesDetail(seriesId: string): Promise<SeriesDetail> {
    const sid = this.config.id;
    const seriesUid = mediaUid(sid, "series", seriesId);
    const res = await this.api<Container<PlexMeta>>(`/library/metadata/${seriesId}/allLeaves`);
    const series = (this.items.find((i) => i.uid === seriesUid) as Series | undefined) ?? {
      uid: seriesUid,
      id: seriesId,
      sourceId: sid,
      kind: "series" as const,
      title: "Series",
      categoryIds: [],
      artwork: {},
    };
    const bySeason = new Map<number, Episode[]>();
    for (const e of res.MediaContainer.Metadata ?? []) {
      const season = e.parentIndex ?? 0;
      const part = e.Media?.[0]?.Part?.[0];
      bySeason.set(season, [
        ...(bySeason.get(season) ?? []),
        {
          uid: mediaUid(sid, "episode", e.ratingKey),
          id: e.ratingKey,
          sourceId: sid,
          kind: "episode",
          seriesUid,
          title: e.title,
          season,
          episode: e.index ?? 0,
          categoryIds: [],
          plot: e.summary,
          durationSec: e.duration ? e.duration / 1000 : undefined,
          artwork: { poster: this.photo(e.thumb, 480, 270) },
          container: detectContainer("", part?.container),
          extra: { partKey: part?.key, container: part?.container },
        },
      ]);
    }
    const seasons: Season[] = [...bySeason.entries()]
      .sort(([a], [b]) => a - b)
      .map(([number, episodes]) => ({ number, name: number === 0 ? "Specials" : `Season ${number}`, episodes }));
    return { series, seasons };
  }

  async getItemDetail(item: MediaItem): Promise<SourceDetail> {
    const res = await this.api<Container<PlexMeta>>(`/library/metadata/${item.id}?includeExtras=1`);
    const m = res.MediaContainer.Metadata?.[0];
    if (!m) return {};
    const guid = (scheme: string) => m.Guid?.find((g) => g.id.startsWith(`${scheme}://`))?.id.split("://")[1];
    const trailer = m.Extras?.Metadata?.find((x) => x.type === "clip" || x.title.toLowerCase().includes("trailer"))?.Media?.[0]?.Part?.[0]?.key;
    return {
      plot: m.summary,
      genres: m.Genre?.map((g) => g.tag),
      rating: m.audienceRating ?? m.rating,
      durationSec: m.duration ? m.duration / 1000 : undefined,
      releaseDate: m.originallyAvailableAt,
      backdrop: this.photo(m.art, 1920, 1080),
      director: m.Director?.map((d) => d.tag).join(", "),
      imdbId: guid("imdb"),
      tmdbId: guid("tmdb"),
      trailer: trailer ? `${this.base}${trailer}?X-Plex-Token=${this.token}` : undefined,
      castMembers: m.Role?.slice(0, 20).map((r) => ({ name: r.tag, role: r.role, photo: r.thumb })),
    };
  }

  async resolvePlayback(item: MediaItem): Promise<PlaybackRequest> {
    const res = await this.api<Container<PlexMeta>>(`/library/metadata/${item.id}`);
    const m = res.MediaContainer.Metadata?.[0];
    const part = m?.Media?.[0]?.Part?.[0];
    if (!m || !part) throw new Error("This item has no playable media on the Plex server.");
    const container = (part.container ?? m.Media?.[0]?.container ?? "").toLowerCase();
    const directOk = ["mp4", "m4v", "mov", "webm"].includes(container) && (m.Media?.[0]?.videoCodec ?? "h264") !== "hevc";
    const q = new URLSearchParams({
      path: `/library/metadata/${item.id}`,
      mediaIndex: "0",
      partIndex: "0",
      protocol: "hls",
      fastSeek: "1",
      directPlay: "0",
      directStream: "1",
      directStreamAudio: "1",
      videoQuality: "100",
      maxVideoBitrate: "20000",
      subtitles: "none",
      session: this.sessionId,
      ...plexHeaders(this.config.clientId, this.token),
    });
    q.delete("Accept");
    const url = directOk ? `${this.base}${part.key}?X-Plex-Token=${this.token}` : `${this.base}/video/:/transcode/universal/start.m3u8?${q}`;
    const subtitles: SubtitleTrackRef[] = (part.Stream ?? [])
      .filter((s) => s.streamType === 3 && s.key)
      .map((s, i) => ({
        id: `plex-${i}`,
        label: s.displayTitle ?? s.language ?? `Track ${i + 1}`,
        language: s.languageCode,
        url: `${this.base}${s.key}?X-Plex-Token=${this.token}`,
        format: s.codec === "srt" ? "srt" : s.codec === "ass" || s.codec === "ssa" ? "ass" : "vtt",
        isDefault: s.default,
      }));
    return {
      url,
      container: directOk ? detectContainer("", container) : "hls",
      isLive: false,
      title: item.title,
      subtitle: item.kind === "episode" ? `S${item.season} · E${item.episode}` : item.year ? String(item.year) : undefined,
      artwork: item.artwork,
      item,
      subtitles,
    };
  }

  async reportProgress(item: MediaItem, positionSec: number, durationSec: number | undefined, state: "playing" | "paused" | "stopped") {
    const q = new URLSearchParams({
      ratingKey: item.id,
      key: `/library/metadata/${item.id}`,
      state,
      time: String(Math.round(positionSec * 1000)),
      ...(durationSec ? { duration: String(Math.round(durationSec * 1000)) } : {}),
    });
    await request(`${this.base}/:/timeline?${q}`, { headers: plexHeaders(this.config.clientId, this.token) }).catch(() => {});
  }
}

export const plexFactory: SourceFactory<PlexConfig> = {
  kind: "plex",
  label: "Plex",
  description: "Sign in with Plex to browse your server's movies and shows, with transcoding and watch-progress sync.",
  secretFields: ["token"],
  create: (config, secrets) => new PlexSource(config, secrets),
};

export interface PlexServerChoice {
  name: string;
  uri: string;
  token: string;
  local: boolean;
  relay: boolean;
}

export async function plexStartPin(clientId: string) {
  return requestJson<{ id: number; code: string }>("https://plex.tv/api/v2/pins?strong=true", { method: "POST", headers: plexHeaders(clientId) });
}

export function plexAuthUrl(clientId: string, code: string) {
  const q = new URLSearchParams({ clientID: clientId, code, "context[device][product]": PLEX_PRODUCT });
  return `https://app.plex.tv/auth#?${q}`;
}

export async function plexPollPin(clientId: string, id: number): Promise<string | null> {
  const res = await requestJson<{ authToken?: string | null }>(`https://plex.tv/api/v2/pins/${id}`, { headers: plexHeaders(clientId) });
  return res.authToken ?? null;
}

export async function plexServers(clientId: string, userToken: string): Promise<PlexServerChoice[]> {
  const res = await requestJson<{ name: string; provides: string; accessToken?: string; connections: { uri: string; local: boolean; relay: boolean }[] }[]>(
    "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1",
    { headers: plexHeaders(clientId, userToken) },
  );
  return res
    .filter((r) => r.provides.includes("server"))
    .flatMap((r) => r.connections.map((c) => ({ name: r.name, uri: c.uri, token: r.accessToken ?? userToken, local: c.local, relay: c.relay })))
    .sort((a, b) => Number(a.relay) - Number(b.relay) || Number(b.uri.startsWith("https")) - Number(a.uri.startsWith("https")));
}
