import { detectContainer } from "@/lib/container";
import type { MediaKind } from "@/types/media";

export interface M3UEntry {
  title: string;
  url: string;
  duration: number;
  attrs: Record<string, string>;
  group?: string;
  logo?: string;
  tvgId?: string;
  tvgName?: string;
  headers: Record<string, string>;
  kind: Exclude<MediaKind, "episode" | "series"> | "series";
  catchup?: { type: string; days?: number; source?: string };
}

export interface M3UPlaylist {
  headerAttrs: Record<string, string>;
  epgUrls: string[];
  entries: M3UEntry[];
}

const ATTR_RE = /([\w-]+)=("([^"]*)"|'([^']*)'|([^\s,]+))/g;

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

function splitExtInf(line: string): { duration: number; attrs: Record<string, string>; title: string } {
  const body = line.slice(line.indexOf(":") + 1);
  let inQuote: string | null = null;
  let commaAt = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inQuote) {
      if (c === inQuote) inQuote = null;
    } else if (c === '"' || c === "'") inQuote = c;
    else if (c === ",") {
      commaAt = i;
      break;
    }
  }
  const meta = commaAt >= 0 ? body.slice(0, commaAt) : body;
  const title = commaAt >= 0 ? body.slice(commaAt + 1).trim() : "";
  const duration = parseFloat(meta) || -1;
  return { duration, attrs: parseAttrs(meta), title };
}

export function classifyEntry(url: string, attrs: Record<string, string>, duration: number, group?: string): M3UEntry["kind"] {
  const type = (attrs["tvg-type"] ?? attrs["type"] ?? "").toLowerCase();
  if (type === "movie" || type === "movies" || type === "vod") return "movie";
  if (type === "series" || type === "show") return "series";
  if (type === "live") return "live";
  if (/\/movie\//i.test(url)) return "movie";
  if (/\/series\//i.test(url)) return "series";
  const c = detectContainer(url);
  if (c === "mp4" || c === "mkv" || c === "webm") {
    if (group && /series|show|s\d{1,2}\s*e\d{1,3}/i.test(group)) return "series";
    return "movie";
  }
  if (duration > 0 && c !== "hls" && c !== "mpegts") return "movie";
  return "live";
}

export function parseM3U(text: string): M3UPlaylist {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const playlist: M3UPlaylist = { headerAttrs: {}, epgUrls: [], entries: [] };

  let pending: { duration: number; attrs: Record<string, string>; title: string } | null = null;
  let pendingGroup: string | undefined;
  let headers: Record<string, string> = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTM3U")) {
      playlist.headerAttrs = parseAttrs(line.slice(7));
      const epg = playlist.headerAttrs["url-tvg"] ?? playlist.headerAttrs["x-tvg-url"] ?? playlist.headerAttrs["tvg-url"];
      if (epg) playlist.epgUrls = epg.split(",").map((s) => s.trim()).filter(Boolean);
      continue;
    }
    if (line.startsWith("#EXTINF")) {
      pending = splitExtInf(line);
      continue;
    }
    if (line.startsWith("#EXTGRP:")) {
      pendingGroup = line.slice(8).trim();
      continue;
    }
    if (line.startsWith("#EXTVLCOPT:")) {
      const [k, ...v] = line.slice(11).split("=");
      const value = v.join("=");
      if (/http-user-agent/i.test(k)) headers["User-Agent"] = value;
      else if (/http-referrer|http-referer/i.test(k)) headers["Referer"] = value;
      else if (/http-origin/i.test(k)) headers["Origin"] = value;
      continue;
    }
    if (line.startsWith("#KODIPROP:")) {
      const [k, ...v] = line.slice(10).split("=");
      if (/stream_headers/i.test(k)) {
        for (const pair of v.join("=").split("&")) {
          const [hk, hv] = pair.split("=");
          if (hk && hv) headers[decodeURIComponent(hk)] = decodeURIComponent(hv);
        }
      }
      continue;
    }
    if (line.startsWith("#")) continue;

    const attrs = pending?.attrs ?? {};
    const group = attrs["group-title"] || pendingGroup;
    const title = pending?.title || attrs["tvg-name"] || line.split("/").pop() || line;
    const duration = pending?.duration ?? -1;
    if (attrs["http-user-agent"]) headers["User-Agent"] = attrs["http-user-agent"];
    if (attrs["http-referrer"]) headers["Referer"] = attrs["http-referrer"];

    const catchupType = attrs["catchup"] ?? attrs["catchup-type"];
    playlist.entries.push({
      title,
      url: line,
      duration,
      attrs,
      group,
      logo: attrs["tvg-logo"] || attrs["logo"] || undefined,
      tvgId: attrs["tvg-id"] || undefined,
      tvgName: attrs["tvg-name"] || undefined,
      headers,
      kind: classifyEntry(line, attrs, duration, group),
      catchup: catchupType
        ? {
            type: catchupType,
            days: attrs["catchup-days"] ? Number(attrs["catchup-days"]) : undefined,
            source: attrs["catchup-source"],
          }
        : undefined,
    });

    pending = null;
    pendingGroup = undefined;
    headers = {};
  }
  return playlist;
}
