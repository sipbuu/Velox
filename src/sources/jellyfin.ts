import { requestJson, request, HttpError } from "@/lib/http";
import { saveSecrets } from "@/lib/credentials";
import { detectContainer } from "@/lib/container";
import { isAppleWebKit } from "@/lib/platform";
import type { SourceDetail } from "@/lib/metadata";
import {
  mediaUid,
  type Category,
  type EpgProgramme,
  type Episode,
  type LibrarySnapshot,
  type MediaItem,
  type PlaybackRequest,
  type Season,
  type Series,
  type SeriesDetail,
  type SubtitleTrackRef,
} from "@/types/media";
import type { JellyfinConfig, LoadContext, MediaSource, SourceCapabilities, SourceFactory, SourceSecrets } from "./types";

interface JfItem {
  Id: string;
  Name: string;
  Type: string;
  CollectionType?: string;
  Overview?: string;
  ProductionYear?: number;
  CommunityRating?: number;
  Genres?: string[];
  RunTimeTicks?: number;
  DateCreated?: string;
  PremiereDate?: string;
  ChannelNumber?: string;
  ImageTags?: { Primary?: string; Thumb?: string; Logo?: string };
  BackdropImageTags?: string[];
  ParentIndexNumber?: number;
  IndexNumber?: number;
  SeriesId?: string;
  SeasonId?: string;
  ProviderIds?: { Imdb?: string; Tmdb?: string };
  People?: { Name: string; Id: string; Role?: string; Type: string; PrimaryImageTag?: string }[];
  RemoteTrailers?: { Url: string }[];
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean };
  StartDate?: string;
  EndDate?: string;
  ChannelId?: string;
}

interface JfMediaSource {
  Id: string;
  Container?: string;
  SupportsDirectStream?: boolean;
  SupportsDirectPlay?: boolean;
  TranscodingUrl?: string;
  MediaStreams?: { Type: string; Index: number; Language?: string; DisplayTitle?: string; DeliveryMethod?: string; DeliveryUrl?: string; Codec?: string; IsDefault?: boolean }[];
}

const TICKS = 10_000_000;
const FIELDS = "Overview,Genres,ProductionYear,CommunityRating,ProviderIds,DateCreated,RunTimeTicks,PremiereDate";

export class JellyfinSource implements MediaSource<JellyfinConfig> {
  readonly capabilities: SourceCapabilities = { live: true, movies: true, series: true, epg: true, catchup: false, search: true, downloads: true };
  private userId?: string;
  private items: MediaItem[] = [];
  private sessions = new Map<string, { playSessionId?: string; mediaSourceId: string }>();

  constructor(
    readonly config: JellyfinConfig,
    private secrets: SourceSecrets,
  ) {}

  private get base() {
    return this.config.server.replace(/\/+$/, "");
  }

  private authHeader(token?: string) {
    const parts = [`Client="Velox"`, `Device="Velox"`, `DeviceId="${this.config.deviceId}"`, `Version="${__APP_VERSION__}"`];
    if (token) parts.push(`Token="${token}"`);
    return { Authorization: `MediaBrowser ${parts.join(", ")}`, "X-Emby-Authorization": `MediaBrowser ${parts.join(", ")}` };
  }

  async authenticate() {
    const res = await requestJson<{ AccessToken: string; User: { Id: string; Name: string } }>(`${this.base}/Users/AuthenticateByName`, {
      method: "POST",
      headers: this.authHeader(),
      body: JSON.stringify({ Username: this.config.username, Pw: this.secrets.password ?? "" }),
    });
    this.secrets = { ...this.secrets, token: res.AccessToken };
    this.userId = res.User.Id;
    await saveSecrets(this.config.id, this.secrets).catch(() => {});
    return { ok: true, message: `Signed in as ${res.User.Name}` };
  }

  private async api<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {}, retry = true): Promise<T> {
    if (!this.secrets.token) await this.authenticate();
    try {
      return await requestJson<T>(`${this.base}${path}`, {
        method: init.method,
        headers: this.authHeader(this.secrets.token),
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: init.signal,
      });
    } catch (e) {
      if (retry && e instanceof HttpError && e.status === 401 && this.secrets.password) {
        this.secrets = { ...this.secrets, token: undefined };
        return this.api<T>(path, init, false);
      }
      throw e;
    }
  }

  private async uid() {
    if (!this.userId && !this.secrets.token) await this.authenticate();
    if (!this.userId) this.userId = (await this.api<{ Id: string }>("/Users/Me")).Id;
    return this.userId;
  }

  private img(id: string, type: "Primary" | "Backdrop" | "Thumb", tag?: string, h = 600) {
    if (!tag) return undefined;
    return `${this.base}/Items/${id}/Images/${type}?fillHeight=${h}&quality=90&tag=${tag}`;
  }

  private toItem(i: JfItem, categoryId: string): MediaItem | null {
    const sid = this.config.id;
    const common = {
      id: i.Id,
      sourceId: sid,
      title: i.Name,
      categoryIds: [categoryId],
      plot: i.Overview,
      year: i.ProductionYear,
      rating: i.CommunityRating,
      genres: i.Genres,
      addedAt: i.DateCreated ? Date.parse(i.DateCreated) : undefined,
    };
    const backdrop = i.BackdropImageTags?.[0] ? this.img(i.Id, "Backdrop", i.BackdropImageTags[0], 720) : undefined;
    if (i.Type === "Movie")
      return {
        ...common,
        uid: mediaUid(sid, "movie", i.Id),
        kind: "movie",
        artwork: { poster: this.img(i.Id, "Primary", i.ImageTags?.Primary), backdrop },
        durationSec: i.RunTimeTicks ? i.RunTimeTicks / TICKS : undefined,
        extra: { imdb: i.ProviderIds?.Imdb, tmdb: i.ProviderIds?.Tmdb },
      };
    if (i.Type === "Series")
      return { ...common, uid: mediaUid(sid, "series", i.Id), kind: "series", artwork: { poster: this.img(i.Id, "Primary", i.ImageTags?.Primary), backdrop } };
    if (i.Type === "TvChannel")
      return {
        ...common,
        uid: mediaUid(sid, "live", i.Id),
        kind: "live",
        number: i.ChannelNumber ? Number(i.ChannelNumber) || undefined : undefined,
        epgChannelId: i.Id,
        artwork: { logo: this.img(i.Id, "Primary", i.ImageTags?.Primary, 200) },
      };
    return null;
  }

  async loadLibrary(ctx?: LoadContext): Promise<LibrarySnapshot> {
    const uid = await this.uid();
    ctx?.onProgress?.("Loading libraries", 0.1);
    const views = await this.api<{ Items: JfItem[] }>(`/Users/${uid}/Views`, { signal: ctx?.signal });
    const categories: Category[] = [];
    const items: MediaItem[] = [];
    const sid = this.config.id;

    for (const [n, v] of views.Items.entries()) {
      ctx?.onProgress?.(`Loading ${v.Name}`, 0.1 + (0.8 * n) / Math.max(1, views.Items.length));
      if (v.CollectionType === "movies" || v.CollectionType === "tvshows" || v.CollectionType === "homevideos" || v.CollectionType === "boxsets") {
        const kind = v.CollectionType === "tvshows" ? "series" : "movie";
        const type = kind === "series" ? "Series" : "Movie";
        const res = await this.api<{ Items: JfItem[] }>(
          `/Users/${uid}/Items?ParentId=${v.Id}&IncludeItemTypes=${type}&Recursive=true&Fields=${FIELDS}&EnableImageTypes=Primary,Backdrop&ImageTypeLimit=1&SortBy=SortName`,
          { signal: ctx?.signal },
        );
        const catId = `${kind}:${v.Id}`;
        categories.push({ id: catId, sourceId: sid, kind, name: v.Name, itemCount: res.Items.length });
        for (const i of res.Items) {
          const m = this.toItem(i, catId);
          if (m) items.push(m);
        }
      }
    }

    const live = await this.api<{ Items: JfItem[] }>(`/LiveTv/Channels?userId=${uid}&EnableImageTypes=Primary&SortBy=SortName`, { signal: ctx?.signal }).catch(() => ({ Items: [] as JfItem[] }));
    if (live.Items.length) {
      categories.push({ id: "live:all", sourceId: sid, kind: "live", name: "Live TV", itemCount: live.Items.length });
      for (const c of live.Items) {
        const m = this.toItem({ ...c, Type: "TvChannel" }, "live:all");
        if (m) items.push(m);
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
    const uid = await this.uid();
    const sid = this.config.id;
    const seriesUid = mediaUid(sid, "series", seriesId);
    const [info, eps] = await Promise.all([
      this.api<JfItem>(`/Users/${uid}/Items/${seriesId}`),
      this.api<{ Items: JfItem[] }>(`/Shows/${seriesId}/Episodes?userId=${uid}&Fields=Overview,RunTimeTicks&EnableImageTypes=Primary,Thumb`),
    ]);
    const series = (this.items.find((i) => i.uid === seriesUid) as Series | undefined) ?? (this.toItem(info, "") as Series);
    const bySeason = new Map<number, Episode[]>();
    for (const e of eps.Items) {
      const season = e.ParentIndexNumber ?? 0;
      const ep: Episode = {
        uid: mediaUid(sid, "episode", e.Id),
        id: e.Id,
        sourceId: sid,
        kind: "episode",
        seriesUid,
        title: e.Name,
        season,
        episode: e.IndexNumber ?? 0,
        categoryIds: [],
        plot: e.Overview,
        durationSec: e.RunTimeTicks ? e.RunTimeTicks / TICKS : undefined,
        artwork: { poster: this.img(e.Id, "Primary", e.ImageTags?.Primary, 360) },
      };
      bySeason.set(season, [...(bySeason.get(season) ?? []), ep]);
    }
    const seasons: Season[] = [...bySeason.entries()]
      .sort(([a], [b]) => a - b)
      .map(([number, episodes]) => ({ number, name: number === 0 ? "Specials" : `Season ${number}`, episodes }));
    return { series, seasons };
  }

  async getItemDetail(item: MediaItem): Promise<SourceDetail> {
    if (item.kind === "live" || item.kind === "episode") return {};
    const uid = await this.uid();
    const i = await this.api<JfItem>(`/Users/${uid}/Items/${item.id}`);
    return {
      plot: i.Overview,
      genres: i.Genres,
      rating: i.CommunityRating,
      durationSec: i.RunTimeTicks ? i.RunTimeTicks / TICKS : undefined,
      releaseDate: i.PremiereDate?.slice(0, 10),
      trailer: i.RemoteTrailers?.[0]?.Url,
      backdrop: i.BackdropImageTags?.[0] ? this.img(i.Id, "Backdrop", i.BackdropImageTags[0], 1080) : undefined,
      imdbId: i.ProviderIds?.Imdb,
      tmdbId: i.ProviderIds?.Tmdb,
      director: i.People?.filter((p) => p.Type === "Director").map((p) => p.Name).join(", "),
      castMembers: i.People?.filter((p) => p.Type === "Actor")
        .slice(0, 20)
        .map((p) => ({ name: p.Name, role: p.Role, photo: this.img(p.Id, "Primary", p.PrimaryImageTag, 240) })),
    };
  }

  async getEpg(channel: MediaItem): Promise<EpgProgramme[]> {
    if (channel.kind !== "live") return [];
    const uid = await this.uid();
    const min = new Date(Date.now() - 4 * 3600_000).toISOString();
    const max = new Date(Date.now() + 14 * 3600_000).toISOString();
    const res = await this.api<{ Items: JfItem[] }>(`/LiveTv/Programs?ChannelIds=${channel.id}&UserId=${uid}&MinEndDate=${min}&MaxStartDate=${max}&Fields=Overview&SortBy=StartDate`);
    return res.Items.filter((p) => p.StartDate && p.EndDate).map((p) => ({
      channelId: channel.id,
      title: p.Name,
      description: p.Overview,
      start: Date.parse(p.StartDate!),
      end: Date.parse(p.EndDate!),
    }));
  }

  private deviceProfile() {
    const video = isAppleWebKit() ? "h264,hevc" : "h264";
    return {
      MaxStreamingBitrate: 120_000_000,
      DirectPlayProfiles: [
        { Container: "mp4,m4v,mov", Type: "Video", VideoCodec: video, AudioCodec: "aac,mp3,ac3,eac3,flac,opus,alac" },
        { Container: "webm", Type: "Video", VideoCodec: "vp8,vp9,av1", AudioCodec: "vorbis,opus" },
      ],
      TranscodingProfiles: [{ Container: "ts", Type: "Video", Protocol: "hls", VideoCodec: "h264", AudioCodec: "aac,mp3", Context: "Streaming", MaxAudioChannels: "6", MinSegments: 1, BreakOnNonKeyFrames: true }],
      ContainerProfiles: [],
      CodecProfiles: [],
      SubtitleProfiles: [
        { Format: "vtt", Method: "External" },
        { Format: "srt", Method: "External" },
      ],
    };
  }

  async resolvePlayback(item: MediaItem): Promise<PlaybackRequest> {
    const uid = await this.uid();
    const info = await this.api<{ MediaSources: JfMediaSource[]; PlaySessionId?: string }>(
      `/Items/${item.id}/PlaybackInfo?UserId=${uid}&IsPlayback=true&AutoOpenLiveStream=true&MaxStreamingBitrate=120000000`,
      { method: "POST", body: { DeviceProfile: this.deviceProfile() } },
    );
    const src = info.MediaSources[0];
    if (!src) throw new Error("No playable media source on the Jellyfin server.");
    const token = this.secrets.token ?? "";
    let url: string;
    const direct = src.SupportsDirectStream && ["mp4", "m4v", "mov", "webm"].includes((src.Container ?? "").split(",")[0]);
    if (direct && item.kind !== "live") {
      url = `${this.base}/Videos/${item.id}/stream.${src.Container!.split(",")[0]}?Static=true&MediaSourceId=${src.Id}&api_key=${token}&PlaySessionId=${info.PlaySessionId ?? ""}`;
    } else if (src.TranscodingUrl) {
      url = `${this.base}${src.TranscodingUrl}${src.TranscodingUrl.includes("api_key") ? "" : `&api_key=${token}`}`;
    } else {
      url = `${this.base}/Videos/${item.id}/master.m3u8?MediaSourceId=${src.Id}&api_key=${token}&VideoCodec=h264&AudioCodec=aac&PlaySessionId=${info.PlaySessionId ?? ""}`;
    }
    this.sessions.set(item.id, { playSessionId: info.PlaySessionId, mediaSourceId: src.Id });
    const subtitles: SubtitleTrackRef[] = (src.MediaStreams ?? [])
      .filter((s) => s.Type === "Subtitle" && s.DeliveryMethod === "External" && s.DeliveryUrl)
      .map((s) => ({
        id: `jf-${s.Index}`,
        label: s.DisplayTitle ?? s.Language ?? `Track ${s.Index}`,
        language: s.Language,
        url: `${this.base}${s.DeliveryUrl}${s.DeliveryUrl!.includes("api_key") ? "" : `${s.DeliveryUrl!.includes("?") ? "&" : "?"}api_key=${token}`}`,
        format: s.DeliveryUrl!.includes(".srt") ? "srt" : "vtt",
        isDefault: s.IsDefault,
      }));
    return {
      url,
      container: url.includes(".m3u8") ? "hls" : detectContainer(url),
      isLive: item.kind === "live",
      title: item.title,
      subtitle: item.kind === "episode" ? `S${item.season} · E${item.episode}` : item.year ? String(item.year) : undefined,
      artwork: item.artwork,
      item,
      subtitles,
    };
  }

  async reportProgress(item: MediaItem, positionSec: number, _durationSec: number | undefined, state: "playing" | "paused" | "stopped") {
    if (item.kind === "live") return;
    const s = this.sessions.get(item.id);
    const body = {
      ItemId: item.id,
      MediaSourceId: s?.mediaSourceId ?? item.id,
      PlaySessionId: s?.playSessionId,
      PositionTicks: Math.round(positionSec * TICKS),
      IsPaused: state === "paused",
      CanSeek: true,
      PlayMethod: "DirectStream",
    };
    const path = state === "stopped" ? "/Sessions/Playing/Stopped" : "/Sessions/Playing/Progress";
    await request(`${this.base}${path}`, { method: "POST", headers: { ...this.authHeader(this.secrets.token), "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  }
}

export const jellyfinFactory: SourceFactory<JellyfinConfig> = {
  kind: "jellyfin",
  label: "Jellyfin / Emby",
  description: "Movies, shows and Live TV from your Jellyfin server, with resume sync and server-side transcoding.",
  secretFields: ["password", "token"],
  create: (config, secrets) => new JellyfinSource(config, secrets),
};
