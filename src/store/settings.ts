import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { kvStorage } from "@/lib/kv";

export type ThemePreference = "system" | "light" | "dark";
export type BufferStorage = "memory" | "disk";

export interface CaptionStyle {
  size: number;
  color: string;
  background: string;
  font: "system" | "serif" | "mono";
}

export interface SettingsState {
  theme: ThemePreference;
  accent: string;
  reduceTransparency: boolean;
  timeshiftWindowSec: number;
  softwareBufferCache: boolean;
  softwareBufferStorage: BufferStorage;
  routeStreamsThroughRelay: boolean;
  preferNativeHls: boolean;
  autoplayNextEpisode: boolean;
  preferredSubtitleLang: string;
  subtitlesEnabledByDefault: boolean;
  captionStyle: CaptionStyle;
  downloadConcurrency: number;
  downloadOnCellular: boolean;
  webCorsProxy: string;
  hydrated: boolean;
  set: (patch: Partial<Omit<SettingsState, "set" | "hydrated">>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      accent: "10 132 255",
      reduceTransparency: false,
      timeshiftWindowSec: 30,
      softwareBufferCache: false,
      softwareBufferStorage: "disk",
      routeStreamsThroughRelay: true,
      preferNativeHls: true,
      autoplayNextEpisode: true,
      preferredSubtitleLang: "en",
      subtitlesEnabledByDefault: false,
      captionStyle: { size: 1, color: "#ffffff", background: "rgba(0,0,0,0.6)", font: "system" },
      downloadConcurrency: 2,
      downloadOnCellular: false,
      webCorsProxy: "",
      hydrated: false,
      set: (patch) => set(patch),
    }),
    {
      name: "velox.settings",
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: ({ set: _s, hydrated: _h, ...rest }) => rest,
      onRehydrateStorage: () => () => useSettings.setState({ hydrated: true }),
    },
  ),
);
