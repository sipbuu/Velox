import { create } from "zustand";
import type { MediaItem, PlaybackRequest } from "@/types/media";
import { getSourceInstance } from "./sources";
import { useLibrary } from "./library";

export interface PlayOptions {
  catchupStart?: number;
  catchupDurationMin?: number;
  queue?: MediaItem[];
  channels?: MediaItem[];
  startOver?: boolean;
}

export type SleepTimer = { endsAt: number } | { endOfItem: true } | null;

interface PlayerState {
  request: PlaybackRequest | null;
  mode: "full" | "mini";
  queue: MediaItem[];
  channelList: MediaItem[];
  resumedFrom: number | null;
  catchup: { start: number; durationMin: number } | null;
  sleep: SleepTimer;
  error: string | null;
  loading: boolean;
  play: (item: MediaItem, opts?: PlayOptions) => Promise<void>;
  playRequest: (req: PlaybackRequest) => void;
  next: () => Promise<void>;
  zap: (delta: 1 | -1) => Promise<void>;
  minimize: () => void;
  expand: () => void;
  setSleep: (s: SleepTimer) => void;
  stop: () => void;
}

export function resumePositionFor(uid: string): number | null {
  const r = useLibrary.getState().recents.find((x) => x.uid === uid);
  if (!r || r.finished || !r.position || !r.duration) return null;
  if (r.position < 20 || r.position > r.duration * 0.94) return null;
  return Math.floor(r.position);
}

export const usePlayer = create<PlayerState>((set, get) => ({
  request: null,
  mode: "full",
  queue: [],
  channelList: [],
  resumedFrom: null,
  catchup: null,
  sleep: null,
  error: null,
  loading: false,
  async play(item, opts) {
    set({ loading: true, error: null });
    try {
      const src = await getSourceInstance(item.sourceId);
      if (!src) throw new Error("Source unavailable");
      const request = await src.resolvePlayback(item, opts);
      const resume = !request.isLive && !opts?.startOver && !opts?.catchupStart ? resumePositionFor(item.uid) : null;
      if (resume) request.startAt = resume;
      set((s) => ({
        request,
        loading: false,
        mode: s.request ? s.mode : "full",
        resumedFrom: resume,
        catchup: opts?.catchupStart ? { start: opts.catchupStart, durationMin: opts.catchupDurationMin ?? 120 } : null,
        queue: opts?.queue ?? (item.kind === "episode" ? s.queue : []),
        channelList: opts?.channels ?? (item.kind === "live" ? s.channelList : []),
      }));
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },
  playRequest(request) {
    set({ request, error: null, loading: false, mode: "full", resumedFrom: null, catchup: null, queue: [], channelList: [] });
  },
  async next() {
    const [nextItem, ...rest] = get().queue;
    if (!nextItem) return;
    await get().play(nextItem, { queue: rest });
  },
  async zap(delta) {
    const { channelList, request } = get();
    if (channelList.length < 2 || !request?.item) return;
    const idx = channelList.findIndex((c) => c.uid === request.item!.uid);
    const target = channelList[(idx + delta + channelList.length) % channelList.length];
    await get().play(target, { channels: channelList });
  },
  minimize: () => set({ mode: "mini" }),
  expand: () => set({ mode: "full" }),
  setSleep: (sleep) => set({ sleep }),
  stop() {
    set({ request: null, error: null, loading: false, mode: "full", resumedFrom: null, catchup: null, sleep: null });
  },
}));
