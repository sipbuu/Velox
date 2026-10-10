import { isTauri } from "./platform";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error(`Native command "${cmd}" is unavailable in the web build`);
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

export async function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen: tauriListen } = await import("@tauri-apps/api/event");
  return tauriListen<T>(event, (e) => handler(e.payload));
}

export async function toPlayableFileUrl(path: string): Promise<string> {
  if (!isTauri()) return path;
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(path);
}
