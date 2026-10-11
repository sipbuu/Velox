import { create } from "zustand";
import type { Category, MediaItem } from "@/types/media";

interface SheetTarget {
  item?: MediaItem;
  category?: Category;
  x: number;
  y: number;
}

interface UiState {
  sheet: SheetTarget | null;
  pinRequest: { reason: string; resolve: (ok: boolean) => void } | null;
  openSheet: (t: SheetTarget) => void;
  closeSheet: () => void;
  askPin: (reason: string) => Promise<boolean>;
  settlePin: (ok: boolean) => void;
}

export const useUi = create<UiState>((set, get) => ({
  sheet: null,
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
