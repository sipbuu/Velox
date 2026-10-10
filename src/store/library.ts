import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { kvStorage } from "@/lib/kv";
import { isTauri } from "@/lib/platform";
import type { Category, LibrarySnapshot, MediaItem, MediaKind } from "@/types/media";
import { getSourceInstance, useSources } from "./sources";

interface SourceStatus {
  state: "idle" | "loading" | "ready" | "error";
  message?: string;
  progress?: number;
}

interface LibraryState {
  snapshots: Record<string, LibrarySnapshot>;
  status: Record<string, SourceStatus>;
  favorites: string[];
  recents: { uid: string; at: number; position?: number; duration?: number }[];
  refresh: (sourceId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  toggleFavorite: (uid: string) => void;
  markWatched: (uid: string, position?: number, duration?: number) => void;
  dropSnapshot: (sourceId: string) => void;
}

const controllers = new Map<string, AbortController>();

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      snapshots: {},
      status: {},
      favorites: [],
      recents: [],
      async refresh(sourceId) {
        controllers.get(sourceId)?.abort();
        const ctrl = new AbortController();
        controllers.set(sourceId, ctrl);
        const setStatus = (st: SourceStatus) => set((s) => ({ status: { ...s.status, [sourceId]: st } }));
        setStatus({ state: "loading", progress: 0 });
        try {
          const src = await getSourceInstance(sourceId);
          if (!src) throw new Error("Unknown source");
          const snap = await src.loadLibrary({
            signal: ctrl.signal,
            onProgress: (message, progress) => setStatus({ state: "loading", message, progress }),
          });
          set((s) => ({ snapshots: { ...s.snapshots, [sourceId]: snap } }));
          setStatus({ state: "ready" });
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          setStatus({ state: "error", message: (err as Error).message });
        } finally {
          if (controllers.get(sourceId) === ctrl) controllers.delete(sourceId);
        }
      },
      async refreshAll() {
        const ids = useSources.getState().configs.filter((c) => c.enabled).map((c) => c.id);
        await Promise.allSettled(ids.map((id) => get().refresh(id)));
      },
      toggleFavorite(uid) {
        set((s) => ({
          favorites: s.favorites.includes(uid) ? s.favorites.filter((f) => f !== uid) : [uid, ...s.favorites],
        }));
      },
      markWatched(uid, position, duration) {
        set((s) => ({
          recents: [{ uid, at: Date.now(), position, duration }, ...s.recents.filter((r) => r.uid !== uid)].slice(0, 60),
        }));
      },
      dropSnapshot(sourceId) {
        set((s) => {
          const { [sourceId]: _d, ...snapshots } = s.snapshots;
          const { [sourceId]: _s, ...status } = s.status;
          return { snapshots, status };
        });
      },
    }),
    {
      name: "velox.library",
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ favorites: s.favorites, recents: s.recents, snapshots: isTauri() ? s.snapshots : {} }),
    },
  ),
);

export interface UnifiedView {
  categories: Category[];
  items: MediaItem[];
  byUid: Map<string, MediaItem>;
}

let memo: { key: unknown; enabled: string; view: UnifiedView } | undefined;

export function selectUnified(snapshots: Record<string, LibrarySnapshot>, enabledIds: string[]): UnifiedView {
  const enabled = enabledIds.join("|");
  if (memo && memo.key === snapshots && memo.enabled === enabled) return memo.view;
  const categories: Category[] = [];
  const items: MediaItem[] = [];
  for (const id of enabledIds) {
    const snap = snapshots[id];
    if (!snap) continue;
    categories.push(...snap.categories);
    items.push(...snap.items);
  }
  const view = { categories, items, byUid: new Map(items.map((i) => [i.uid, i])) };
  memo = { key: snapshots, enabled, view };
  return view;
}

export function useUnifiedLibrary(): UnifiedView {
  const snapshots = useLibrary((s) => s.snapshots);
  const configs = useSources((s) => s.configs);
  return selectUnified(
    snapshots,
    configs.filter((c) => c.enabled).map((c) => c.id),
  );
}

export function itemsOfKind(view: UnifiedView, kind: MediaKind, categoryId?: string): MediaItem[] {
  return view.items.filter((i) => i.kind === kind && (!categoryId || i.categoryIds.includes(categoryId)));
}

export const categoryKey = (c: Category) => `${c.sourceId}::${c.id}`;
