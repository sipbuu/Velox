import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { kvStorage } from "@/lib/kv";
import { isTauri } from "@/lib/platform";
import { categoryKey, isCategoryHidden, isItemHidden, type ContentFilter } from "@/lib/contentFilter";
import type { Category, LibrarySnapshot, MediaItem, MediaKind } from "@/types/media";
import { getSourceInstance, useSources } from "./sources";
import { useFilters } from "./filters";

interface SourceStatus {
  state: "idle" | "loading" | "ready" | "error";
  message?: string;
  progress?: number;
}

export interface RecentEntry {
  uid: string;
  at: number;
  position?: number;
  duration?: number;
  finished?: boolean;
  item?: MediaItem;
}

interface LibraryState {
  snapshots: Record<string, LibrarySnapshot>;
  status: Record<string, SourceStatus>;
  favorites: string[];
  favoriteItems: Record<string, MediaItem>;
  recents: RecentEntry[];
  refresh: (sourceId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  toggleFavorite: (item: MediaItem | string) => void;
  markWatched: (item: MediaItem, position?: number, duration?: number) => void;
  clearRecent: (uid: string) => void;
  dropSnapshot: (sourceId: string) => void;
}

const controllers = new Map<string, AbortController>();
const FINISHED_RATIO = 0.94;

export const leanItem = (item: MediaItem): MediaItem => ({ ...item, plot: item.plot?.slice(0, 280) });

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      snapshots: {},
      status: {},
      favorites: [],
      favoriteItems: {},
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
      toggleFavorite(target) {
        const uid = typeof target === "string" ? target : target.uid;
        set((s) => {
          if (s.favorites.includes(uid)) {
            const { [uid]: _drop, ...favoriteItems } = s.favoriteItems;
            return { favorites: s.favorites.filter((f) => f !== uid), favoriteItems };
          }
          const favoriteItems = typeof target === "string" ? s.favoriteItems : { ...s.favoriteItems, [uid]: leanItem(target) };
          return { favorites: [uid, ...s.favorites], favoriteItems };
        });
      },
      markWatched(item, position, duration) {
        const finished = !!(position && duration && position / duration >= FINISHED_RATIO);
        set((s) => ({
          recents: [
            { uid: item.uid, at: Date.now(), position, duration, finished, item: leanItem(item) },
            ...s.recents.filter((r) => r.uid !== item.uid),
          ].slice(0, 80),
        }));
      },
      clearRecent(uid) {
        set((s) => ({ recents: s.recents.filter((r) => r.uid !== uid) }));
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
      version: 2,
      storage: createJSONStorage(() => kvStorage),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<LibraryState>;
        return { ...p, favoriteItems: p.favoriteItems ?? {}, recents: (p.recents ?? []).filter((r) => r && r.uid) } as LibraryState;
      },
      partialize: (s) => ({
        favorites: s.favorites,
        favoriteItems: s.favoriteItems,
        recents: s.recents,
        snapshots: isTauri() ? s.snapshots : {},
      }),
    },
  ),
);

export interface UnifiedView {
  categories: Category[];
  items: MediaItem[];
  byUid: Map<string, MediaItem>;
  hiddenCount: number;
}

export function buildUnified(snapshots: Record<string, LibrarySnapshot>, enabledIds: string[], filter: ContentFilter | null): UnifiedView {
  const categories: Category[] = [];
  const items: MediaItem[] = [];
  const hiddenCats = new Set<string>();
  let hiddenCount = 0;
  for (const id of enabledIds) {
    const snap = snapshots[id];
    if (!snap) continue;
    for (const c of snap.categories) {
      if (filter && isCategoryHidden(c, filter)) hiddenCats.add(categoryKey(c));
      else categories.push(c);
    }
    for (const i of snap.items) {
      if (filter && isItemHidden(i, hiddenCats, filter)) hiddenCount++;
      else items.push(i);
    }
  }
  return { categories, items, byUid: new Map(items.map((i) => [i.uid, i])), hiddenCount };
}

export function useContentFilter(): ContentFilter {
  const { hiddenCategories, hiddenItems, hideAdult, showHidden } = useFilters();
  return useMemo(
    () => ({ hiddenCategories: new Set(hiddenCategories), hiddenItems: new Set(hiddenItems), hideAdult, bypass: showHidden }),
    [hiddenCategories, hiddenItems, hideAdult, showHidden],
  );
}

function useEnabledIds() {
  const configs = useSources((s) => s.configs);
  return useMemo(() => configs.filter((c) => c.enabled).map((c) => c.id), [configs]);
}

export function useUnifiedLibrary(): UnifiedView {
  const snapshots = useLibrary((s) => s.snapshots);
  const enabled = useEnabledIds();
  const filter = useContentFilter();
  return useMemo(() => buildUnified(snapshots, enabled, filter), [snapshots, enabled, filter]);
}

export function useRawLibrary(): UnifiedView {
  const snapshots = useLibrary((s) => s.snapshots);
  const enabled = useEnabledIds();
  return useMemo(() => buildUnified(snapshots, enabled, null), [snapshots, enabled]);
}

export function itemsOfKind(view: UnifiedView, kind: MediaKind, categoryId?: string): MediaItem[] {
  return view.items.filter((i) => i.kind === kind && (!categoryId || i.categoryIds.includes(categoryId)));
}

export { categoryKey };
