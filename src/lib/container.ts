import type { StreamContainer } from "@/types/media";

const EXT_MAP: Record<string, StreamContainer> = {
  m3u8: "hls",
  m3u: "hls",
  ts: "mpegts",
  mts: "mpegts",
  m2ts: "mpegts",
  mp4: "mp4",
  m4v: "mp4",
  mov: "mp4",
  mkv: "mkv",
  webm: "webm",
  mpd: "dash",
};

export function extensionOf(url: string): string | undefined {
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url.split(/[?#]/)[0];
    const m = /\.([a-z0-9]{2,5})$/i.exec(path);
    return m?.[1].toLowerCase();
  } catch {
    return undefined;
  }
}

export function detectContainer(url: string, hint?: string): StreamContainer {
  const ext = (hint ?? extensionOf(url))?.toLowerCase();
  if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
  if (/\/hls\/|m3u8|format=hls/i.test(url)) return "hls";
  if (/\/live\//i.test(url)) return "mpegts";
  return "unknown";
}

export const PLAYABLE_LOCAL_EXTENSIONS = ["mp4", "m4v", "mov", "mkv", "webm", "ts", "m2ts", "m3u8", "mp3", "aac", "flac", "m4a"];
export const SUBTITLE_EXTENSIONS = ["vtt", "srt", "ass", "ssa"];
