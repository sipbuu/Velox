import { isTauri } from "./platform";
import type { StateStorage } from "zustand/middleware";

type TauriStore = Awaited<ReturnType<typeof import("@tauri-apps/plugin-store").load>>;
let storePromise: Promise<TauriStore> | undefined;

function nativeStore() {
  storePromise ??= import("@tauri-apps/plugin-store").then((m) =>
    m.load("velox.json", { autoSave: 400, defaults: {} }),
  );
  return storePromise;
}

const web = (): Storage | undefined => (typeof localStorage === "undefined" ? undefined : localStorage);

export const kvStorage: StateStorage = {
  async getItem(name) {
    if (!isTauri()) return web()?.getItem(name) ?? null;
    const s = await nativeStore();
    return (await s.get<string>(name)) ?? null;
  },
  async setItem(name, value) {
    if (!isTauri()) return web()?.setItem(name, value);
    const s = await nativeStore();
    await s.set(name, value);
  },
  async removeItem(name) {
    if (!isTauri()) return web()?.removeItem(name);
    const s = await nativeStore();
    await s.delete(name);
  },
};
