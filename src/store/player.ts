import { create } from "zustand";
import type { MediaItem, PlaybackRequest } from "@/types/media";
import { getSourceInstance } from "./sources";

interface PlayerState {
  request: PlaybackRequest | null;
  queue: MediaItem[];
  error: string | null;
  loading: boolean;
  play: (item: MediaItem, opts?: { catchupStart?: number; catchupDurationMin?: number; queue?: MediaItem[] }) => Promise<void>;
  playRequest: (req: PlaybackRequest) => void;
  next: () => Promise<void>;
  stop: () => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  request: null,
  queue: [],
  error: null,
  loading: false,
  async play(item, opts) {
    set({ loading: true, error: null });
    try {
      const src = await getSourceInstance(item.sourceId);
      if (!src) throw new Error("Source unavailable");
      const request = await src.resolvePlayback(item, opts);
      set({ request, loading: false, queue: opts?.queue ?? get().queue });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },
  playRequest(request) {
    set({ request, error: null, loading: false });
  },
  async next() {
    const [nextItem, ...rest] = get().queue;
    if (!nextItem) return;
    set({ queue: rest });
    await get().play(nextItem);
  },
  stop() {
    set({ request: null, error: null, loading: false });
  },
}));
