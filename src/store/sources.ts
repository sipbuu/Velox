import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { kvStorage } from "@/lib/kv";
import { deleteSecrets, loadSecrets, saveSecrets } from "@/lib/credentials";
import { createSource } from "@/sources/registry";
import type { MediaSource, SourceConfig, SourceSecrets } from "@/sources/types";

interface SourcesState {
  configs: SourceConfig[];
  activeProfileIds: string[] | null;
  addSource: (config: SourceConfig, secrets?: SourceSecrets) => Promise<void>;
  updateSource: (id: string, patch: Partial<SourceConfig>, secrets?: SourceSecrets) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  toggleSource: (id: string, enabled: boolean) => void;
}

const instances = new Map<string, MediaSource>();

export async function getSourceInstance(id: string): Promise<MediaSource | undefined> {
  const existing = instances.get(id);
  if (existing) return existing;
  const config = useSources.getState().configs.find((c) => c.id === id);
  if (!config) return undefined;
  const instance = createSource(config, await loadSecrets(id));
  instances.set(id, instance);
  return instance;
}

function dropInstance(id: string) {
  instances.get(id)?.dispose?.();
  instances.delete(id);
}

export const useSources = create<SourcesState>()(
  persist(
    (set) => ({
      configs: [],
      activeProfileIds: null,
      async addSource(config, secrets) {
        if (secrets && Object.keys(secrets).length) await saveSecrets(config.id, secrets);
        set((s) => ({ configs: [...s.configs, config] }));
      },
      async updateSource(id, patch, secrets) {
        if (secrets) await saveSecrets(id, secrets);
        dropInstance(id);
        set((s) => ({
          configs: s.configs.map((c) => (c.id === id ? ({ ...c, ...patch } as SourceConfig) : c)),
        }));
      },
      async removeSource(id) {
        dropInstance(id);
        await deleteSecrets(id).catch(() => {});
        set((s) => ({ configs: s.configs.filter((c) => c.id !== id) }));
      },
      toggleSource(id, enabled) {
        set((s) => ({ configs: s.configs.map((c) => (c.id === id ? { ...c, enabled } : c)) }));
      },
    }),
    { name: "velox.sources", version: 1, storage: createJSONStorage(() => kvStorage) },
  ),
);
