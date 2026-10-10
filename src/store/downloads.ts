import { create } from "zustand";
import { invoke, listen } from "@/lib/ipc";
import { isTauri } from "@/lib/platform";
import type { PlaybackRequest } from "@/types/media";

export type DownloadState = "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";

export interface DownloadTask {
  id: string;
  title: string;
  url: string;
  filePath: string;
  state: DownloadState;
  bytesDone: number;
  bytesTotal: number | null;
  speedBps: number;
  error?: string | null;
  posterUrl?: string | null;
  createdAt: number;
}

interface DownloadsState {
  tasks: Record<string, DownloadTask>;
  ready: boolean;
  init: () => Promise<void>;
  enqueue: (req: PlaybackRequest) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string, deleteFile: boolean) => Promise<void>;
}

let unlisten: (() => void) | undefined;

export const useDownloads = create<DownloadsState>((set, get) => ({
  tasks: {},
  ready: false,
  async init() {
    if (get().ready || !isTauri()) return set({ ready: true });
    const list = await invoke<DownloadTask[]>("downloads_list");
    set({ tasks: Object.fromEntries(list.map((t) => [t.id, t])), ready: true });
    unlisten?.();
    unlisten = await listen<DownloadTask>("velox://download", (t) =>
      set((s) => ({ tasks: { ...s.tasks, [t.id]: t } })),
    );
  },
  async enqueue(req) {
    if (!isTauri()) throw new Error("Offline downloads require the native app.");
    if (req.container === "hls" || req.container === "mpegts") throw new Error("Live and HLS streams can't be downloaded yet.");
    const task = await invoke<DownloadTask>("downloads_enqueue", {
      request: {
        url: req.url,
        title: req.title,
        headers: req.headers ?? {},
        posterUrl: req.artwork?.poster ?? req.artwork?.logo ?? null,
        extension: req.url.split(/[?#]/)[0].split(".").pop() ?? "mp4",
      },
    });
    set((s) => ({ tasks: { ...s.tasks, [task.id]: task } }));
  },
  pause: (id) => invoke("downloads_pause", { id }),
  resume: (id) => invoke("downloads_resume", { id }),
  cancel: (id) => invoke("downloads_cancel", { id }),
  async remove(id, deleteFile) {
    await invoke("downloads_remove", { id, deleteFile });
    set((s) => {
      const { [id]: _r, ...tasks } = s.tasks;
      return { tasks };
    });
  },
}));
