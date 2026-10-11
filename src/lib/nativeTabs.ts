import { detectPlatform, isTauri } from "./platform";

export interface NativeTab {
  title: string;
  symbol: string;
}

let available: Promise<boolean> | undefined;

export function nativeTabsSupported(): Promise<boolean> {
  available ??= isTauri() ? detectPlatform().then((p) => p === "ios") : Promise.resolve(false);
  return available;
}

export async function setNativeTabs(tabs: NativeTab[], selected: number): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<{ material?: string }>("plugin:native-glass|tabs", { tabs, selected });
  return res?.material ?? null;
}

export async function selectNativeTab(index: number) {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("plugin:native-glass|select", { index }).catch(() => {});
}

export async function setNativeTabsVisible(visible: boolean) {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("plugin:native-glass|visibility", { visible }).catch(() => {});
}

export async function onNativeTab(cb: (index: number) => void): Promise<() => void> {
  const { addPluginListener } = await import("@tauri-apps/api/core");
  const listener = await addPluginListener<{ index: number }>("native-glass", "tabSelected", (e) => cb(e.index));
  return () => void listener.unregister();
}
