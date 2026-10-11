import { create } from "zustand";
import type { Category, MediaItem } from "@/types/media";

interface SheetTarget {
  item?: MediaItem;
  category?: Category;
  x: number;
  y: number;
}

export interface AppToast {
  id: number;
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
}

interface UiState {
  sheet: SheetTarget | null;
  toasts: AppToast[];
  shortcutsOpen: boolean;
  pushToast: (t: Omit<AppToast, "id">, ms?: number) => void;
  dismissToast: (id: number) => void;
  setShortcutsOpen: (v: boolean) => void;
  pinRequest: { reason: string; resolve: (ok: boolean) => void } | null;
  openSheet: (t: SheetTarget) => void;
  closeSheet: () => void;
  askPin: (reason: string) => Promise<boolean>;
  settlePin: (ok: boolean) => void;
}

let toastSeq = 0;

export const useUi = create<UiState>((set, get) => ({
  sheet: null,
  toasts: [],
  shortcutsOpen: false,
  pushToast: (t, ms = 8000) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    window.setTimeout(() => get().dismissToast(id), ms);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  pinRequest: null,
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
  askPin: (reason) =>
    new Promise<boolean>((resolve) => {
      get().pinRequest?.resolve(false);
      set({ pinRequest: { reason, resolve } });
    }),
  settlePin: (ok) => {
    get().pinRequest?.resolve(ok);
    set({ pinRequest: null });
  },
}));
