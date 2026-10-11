import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { kvStorage } from "@/lib/kv";
import { hashPin } from "@/lib/contentFilter";

interface FiltersState {
  hiddenCategories: string[];
  hiddenItems: string[];
  hideAdult: boolean;
  pinHash: string | null;
  showHidden: boolean;
  hideCategory: (key: string) => void;
  unhideCategory: (key: string) => void;
  hideItem: (uid: string) => void;
  unhideItem: (uid: string) => void;
  setHideAdult: (v: boolean) => void;
  setPin: (pin: string | null) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setShowHidden: (v: boolean) => void;
}

export const useFilters = create<FiltersState>()(
  persist(
    (set, get) => ({
      hiddenCategories: [],
      hiddenItems: [],
      hideAdult: true,
      pinHash: null,
      showHidden: false,
      hideCategory: (key) => set((s) => ({ hiddenCategories: [...new Set([...s.hiddenCategories, key])] })),
      unhideCategory: (key) => set((s) => ({ hiddenCategories: s.hiddenCategories.filter((k) => k !== key) })),
      hideItem: (uid) => set((s) => ({ hiddenItems: [...new Set([...s.hiddenItems, uid])] })),
      unhideItem: (uid) => set((s) => ({ hiddenItems: s.hiddenItems.filter((k) => k !== uid) })),
      setHideAdult: (hideAdult) => set({ hideAdult }),
      async setPin(pin) {
        set({ pinHash: pin ? await hashPin(pin) : null });
      },
      async verifyPin(pin) {
        const h = get().pinHash;
        return !h || (await hashPin(pin)) === h;
      },
      setShowHidden: (showHidden) => set({ showHidden }),
    }),
    {
      name: "velox.filters",
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: ({ hiddenCategories, hiddenItems, hideAdult, pinHash }) => ({ hiddenCategories, hiddenItems, hideAdult, pinHash }),
    },
  ),
);
