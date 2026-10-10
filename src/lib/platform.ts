declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export type Platform = "ios" | "android" | "macos" | "windows" | "linux" | "web";

export const isTauri = (): boolean => typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

let cached: Platform | undefined;

export async function detectPlatform(): Promise<Platform> {
  if (cached) return cached;
  if (!isTauri()) return (cached = "web");
  try {
    const { platform } = await import("@tauri-apps/plugin-os");
    const p = platform();
    const known: Platform[] = ["ios", "android", "macos", "windows", "linux"];
    cached = known.includes(p as Platform) ? (p as Platform) : "web";
  } catch {
    cached = "web";
  }
  return cached;
}

export const isAppleWebKit = (): boolean =>
  typeof navigator !== "undefined" &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg\//.test(navigator.userAgent);

export const isIOSLike = (): boolean =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
