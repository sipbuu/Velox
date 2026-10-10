import { invoke } from "./ipc";
import { isTauri } from "./platform";
import type { PlaybackRequest } from "@/types/media";

interface ServerInfo {
  baseUrl: string;
  token: string;
}

let info: Promise<ServerInfo> | undefined;

export function mediaServerInfo(): Promise<ServerInfo> {
  info ??= invoke<ServerInfo>("media_server_info");
  return info;
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function relayUrl(url: string, headers?: Record<string, string>): Promise<string> {
  const { baseUrl, token } = await mediaServerInfo();
  const q = new URLSearchParams({ k: token, u: b64url(url) });
  if (headers && Object.keys(headers).length) q.set("h", b64url(JSON.stringify(headers)));
  return `${baseUrl}/proxy?${q}`;
}

export interface TimeshiftSession {
  id: string;
  playlistUrl: string;
}

export function startTimeshift(req: PlaybackRequest, windowSec: number, storage: "memory" | "disk"): Promise<TimeshiftSession> {
  return invoke<TimeshiftSession>("timeshift_start", {
    request: {
      url: req.url,
      headers: req.headers ?? {},
      container: req.container === "hls" ? "hls" : "mpegts",
      windowSec,
      storage,
    },
  });
}

export function stopTimeshift(id: string): Promise<void> {
  return invoke("timeshift_stop", { id });
}

export const canUseNativeRelay = () => isTauri();

export function isRemoteUrl(url: string) {
  return /^https?:\/\//i.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(url);
}
