import { fetchJson } from "./http";
import { kvStorage } from "./kv";
import { useSettings } from "@/store/settings";
import type { MediaItem } from "@/types/media";

export interface SourceDetail {
  plot?: string;
  cast?: string;
  director?: string;
  genres?: string[];
  rating?: number;
  durationSec?: number;
  releaseDate?: string;
  trailer?: string;
  backdrop?: string;
  poster?: string;
  tmdbId?: string;
  imdbId?: string;
}

export interface Rating {
  source: "imdb" | "rt" | "metacritic" | "tmdb" | "provider";
  label: string;
  value: string;
  url?: string;
}

export interface CastMember {
  name: string;
  role?: string;
  photo?: string;
}

export interface Review {
  author: string;
  rating?: number;
  content: string;
  url?: string;
  date?: string;
  avatar?: string;
}

export interface TitleMetadata {
  title: string;
  overview?: string;
  tagline?: string;
  genres: string[];
  runtimeMin?: number;
  year?: number;
  releaseDate?: string;
  backdrop?: string;
  poster?: string;
  trailerKey?: string;
  trailerUrl?: string;
  ratings: Rating[];
  cast: CastMember[];
  directors: string[];
  reviews: Review[];
  certification?: string;
  awards?: string;
  imdbId?: string;
  tmdbId?: string;
  fetchedAt: number;
}

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const CACHE_TTL = 7 * 86400_000;
const memory = new Map<string, Promise<TitleMetadata>>();

const NOISE = /\b(4k|uhd|fhd|hd|sd|hevc|h\.?26[45]|x26[45]|1080p|720p|2160p|multi|vostfr|dual|web-?dl|bluray|hdr|10bit)\b/gi;

export function cleanTitle(raw: string): { title: string; year?: number } {
  let t = raw.replace(/^\s*(\|[a-z]{2,3}\||\[[a-z]{2,3}\]|[a-z]{2,3}\s*[-|:]\s+)/i, "");
  const yearMatch = /[([]?\b(19\d{2}|20\d{2})\b[)\]]?\s*$/.exec(t) ?? /\((19\d{2}|20\d{2})\)/.exec(t);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;
  if (yearMatch) t = t.replace(yearMatch[0], " ");
  t = t
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b.*$/i, "")
    .replace(NOISE, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s*[-|:]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { title: t || raw.trim(), year };
}

export function youtubeKey(input?: string): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/.exec(s);
  return m?.[1];
}

function tmdbFetch<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const { tmdbApiKey, metadataLanguage } = useSettings.getState();
  const key = tmdbApiKey.trim();
  const bearer = key.startsWith("eyJ");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ language: metadataLanguage || "en-US", ...params })) if (v !== undefined && v !== "") q.set(k, String(v));
  if (!bearer) q.set("api_key", key);
  return fetchJson<T>(`${TMDB}${path}?${q}`, bearer ? { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } } : {});
}

interface TmdbVideo { key: string; site: string; type: string; official?: boolean; iso_639_1?: string }
interface TmdbPerson { name: string; character?: string; roles?: { character: string }[]; profile_path?: string | null; job?: string }
interface TmdbReview { author: string; author_details?: { rating?: number | null; avatar_path?: string | null }; content: string; url?: string; created_at?: string }
interface TmdbDetail {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  tagline?: string;
  genres?: { name: string }[];
  runtime?: number;
  episode_run_time?: number[];
  release_date?: string;
  first_air_date?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  imdb_id?: string;
  external_ids?: { imdb_id?: string | null };
  videos?: { results: TmdbVideo[] };
  credits?: { cast: TmdbPerson[]; crew: TmdbPerson[] };
  aggregate_credits?: { cast: TmdbPerson[] };
  created_by?: { name: string }[];
  reviews?: { results: TmdbReview[] };
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
}

async function tmdbLookup(kind: "movie" | "tv", title: string, year?: number, tmdbId?: string, imdbId?: string): Promise<TmdbDetail | null> {
  let id = tmdbId && /^\d+$/.test(tmdbId) ? tmdbId : undefined;
  if (!id && imdbId) {
    const found = await tmdbFetch<{ movie_results: { id: number }[]; tv_results: { id: number }[] }>(`/find/${imdbId}`, { external_source: "imdb_id" });
    id = String((kind === "movie" ? found.movie_results : found.tv_results)[0]?.id ?? "") || undefined;
  }
  if (!id) {
    const search = async (y?: number) =>
      tmdbFetch<{ results: { id: number }[] }>(`/search/${kind}`, { query: title, ...(kind === "movie" ? { year: y } : { first_air_date_year: y }) });
    let res = await search(year);
    if (!res.results.length && year) res = await search();
    id = res.results[0] ? String(res.results[0].id) : undefined;
  }
  if (!id) return null;
  const append = kind === "movie" ? "videos,credits,reviews,external_ids,release_dates" : "videos,aggregate_credits,reviews,external_ids,content_ratings";
  return tmdbFetch<TmdbDetail>(`/${kind}/${id}`, { append_to_response: append, include_video_language: "en,null" });
}

interface OmdbResponse {
  Response: "True" | "False";
  imdbID?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Rated?: string;
  Awards?: string;
  Ratings?: { Source: string; Value: string }[];
}

async function omdbLookup(imdbId?: string, title?: string, year?: number, type?: "movie" | "series"): Promise<OmdbResponse | null> {
  const key = useSettings.getState().omdbApiKey.trim();
  if (!key || (!imdbId && !title)) return null;
  const q = new URLSearchParams({ apikey: key, tomatoes: "true" });
  if (imdbId) q.set("i", imdbId);
  else {
    q.set("t", title!);
    if (year) q.set("y", String(year));
    if (type) q.set("type", type);
  }
  const res = await fetchJson<OmdbResponse>(`https://www.omdbapi.com/?${q}`);
  return res.Response === "True" ? res : null;
}

function pickTrailer(videos: TmdbVideo[] = []): string | undefined {
  const yt = videos.filter((v) => v.site === "YouTube");
  const score = (v: TmdbVideo) => (v.type === "Trailer" ? 4 : v.type === "Teaser" ? 2 : 0) + (v.official ? 1 : 0) + (v.iso_639_1 === "en" ? 1 : 0);
  return yt.sort((a, b) => score(b) - score(a))[0]?.key;
}

async function build(item: MediaItem, detail: SourceDetail): Promise<TitleMetadata> {
  const { title, year } = cleanTitle(item.title);
  const kind = item.kind === "series" ? "tv" : "movie";
  const settings = useSettings.getState();
  const meta: TitleMetadata = {
    title,
    overview: detail.plot || item.plot,
    genres: detail.genres ?? item.genres ?? [],
    runtimeMin: detail.durationSec ? Math.round(detail.durationSec / 60) : undefined,
    year: item.year ?? year,
    releaseDate: detail.releaseDate,
    backdrop: detail.backdrop ?? item.artwork.backdrop,
    poster: detail.poster ?? item.artwork.poster,
    trailerKey: youtubeKey(detail.trailer),
    trailerUrl: detail.trailer && !youtubeKey(detail.trailer) && /^https?:/.test(detail.trailer) ? detail.trailer : undefined,
    ratings: [],
    cast: (detail.cast ?? "").split(/,\s*/).filter(Boolean).slice(0, 15).map((name) => ({ name })),
    directors: (detail.director ?? "").split(/,\s*/).filter(Boolean),
    reviews: [],
    imdbId: detail.imdbId,
    tmdbId: detail.tmdbId,
    fetchedAt: Date.now(),
  };
  const providerRating = detail.rating ?? item.rating;
  if (providerRating) meta.ratings.push({ source: "provider", label: "Provider", value: `${providerRating.toFixed(1)}/10` });

  if (settings.tmdbApiKey.trim()) {
    try {
      const t = await tmdbLookup(kind, title, meta.year, detail.tmdbId, detail.imdbId);
      if (t) {
        meta.tmdbId = String(t.id);
        meta.imdbId = meta.imdbId ?? t.imdb_id ?? t.external_ids?.imdb_id ?? undefined;
        meta.overview = t.overview || meta.overview;
        meta.tagline = t.tagline || undefined;
        meta.genres = t.genres?.map((g) => g.name) ?? meta.genres;
        meta.runtimeMin = t.runtime || t.episode_run_time?.[0] || meta.runtimeMin;
        meta.releaseDate = t.release_date || t.first_air_date || meta.releaseDate;
        meta.year = meta.year ?? (meta.releaseDate ? Number(meta.releaseDate.slice(0, 4)) : undefined);
        if (t.backdrop_path) meta.backdrop = `${IMG}/w1280${t.backdrop_path}`;
        if (t.poster_path) meta.poster = meta.poster ?? `${IMG}/w500${t.poster_path}`;
        meta.trailerKey = meta.trailerKey ?? pickTrailer(t.videos?.results);
        const cast = t.credits?.cast ?? t.aggregate_credits?.cast ?? [];
        if (cast.length)
          meta.cast = cast.slice(0, 20).map((c) => ({ name: c.name, role: c.character ?? c.roles?.[0]?.character, photo: c.profile_path ? `${IMG}/w185${c.profile_path}` : undefined }));
        const directors = t.credits?.crew.filter((c) => c.job === "Director").map((c) => c.name) ?? t.created_by?.map((c) => c.name) ?? [];
        if (directors.length) meta.directors = directors;
        meta.reviews = (t.reviews?.results ?? []).slice(0, 10).map((r) => ({
          author: r.author,
          rating: r.author_details?.rating ?? undefined,
          content: r.content,
          url: r.url,
          date: r.created_at,
          avatar: r.author_details?.avatar_path?.startsWith("/") ? `${IMG}/w92${r.author_details.avatar_path}` : undefined,
        }));
        const region = (settings.metadataLanguage || "en-US").split("-")[1] ?? "US";
        meta.certification =
          t.release_dates?.results.find((r) => r.iso_3166_1 === region)?.release_dates.find((d) => d.certification)?.certification ||
          t.content_ratings?.results.find((r) => r.iso_3166_1 === region)?.rating ||
          undefined;
        if (t.vote_average && t.vote_count)
          meta.ratings.push({ source: "tmdb", label: "TMDB", value: `${Math.round(t.vote_average * 10)}%`, url: `https://www.themoviedb.org/${kind}/${t.id}` });
      }
    } catch (e) {
      console.warn("[velox] TMDB lookup failed", e);
    }
  }

  try {
    const o = await omdbLookup(meta.imdbId, meta.imdbId ? undefined : title, meta.year, kind === "tv" ? "series" : "movie");
    if (o) {
      meta.imdbId = meta.imdbId ?? o.imdbID;
      meta.awards = o.Awards && o.Awards !== "N/A" ? o.Awards : undefined;
      meta.certification = meta.certification ?? (o.Rated && o.Rated !== "N/A" ? o.Rated : undefined);
      if (o.imdbRating && o.imdbRating !== "N/A")
        meta.ratings.unshift({ source: "imdb", label: "IMDb", value: `${o.imdbRating}/10`, url: `https://www.imdb.com/title/${meta.imdbId}/` });
      const rt = o.Ratings?.find((r) => r.Source === "Rotten Tomatoes")?.Value;
      if (rt) meta.ratings.push({ source: "rt", label: "Rotten Tomatoes", value: rt });
      if (o.Metascore && o.Metascore !== "N/A") meta.ratings.push({ source: "metacritic", label: "Metacritic", value: `${o.Metascore}/100` });
    }
  } catch (e) {
    console.warn("[velox] OMDb lookup failed", e);
  }

  if (meta.imdbId && !meta.ratings.some((r) => r.source === "imdb"))
    meta.ratings.unshift({ source: "imdb", label: "IMDb", value: "View", url: `https://www.imdb.com/title/${meta.imdbId}/` });
  return meta;
}

export function getTitleMetadata(item: MediaItem, detail: SourceDetail, force = false): Promise<TitleMetadata> {
  const { tmdbApiKey, omdbApiKey } = useSettings.getState();
  const cacheKey = `velox.meta.${item.uid}.${tmdbApiKey ? 1 : 0}${omdbApiKey ? 1 : 0}`;
  if (!force && memory.has(cacheKey)) return memory.get(cacheKey)!;
  const task = (async () => {
    if (!force) {
      const raw = await kvStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as TitleMetadata;
        if (Date.now() - cached.fetchedAt < CACHE_TTL) return cached;
      }
    }
    const meta = await build(item, detail);
    await Promise.resolve(kvStorage.setItem(cacheKey, JSON.stringify(meta))).catch(() => {});
    return meta;
  })();
  memory.set(cacheKey, task);
  task.catch(() => memory.delete(cacheKey));
  return task;
}
