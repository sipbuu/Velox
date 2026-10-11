import { useEffect } from "react";
import { invoke } from "@/lib/ipc";
import { detectPlatform, isTauri } from "@/lib/platform";

export type NativeMaterial = "liquid-glass" | "vibrancy" | "mica" | "none";

export function useNativeChrome() {
  useEffect(() => {
    const root = document.documentElement;
    void detectPlatform().then((p) => (root.dataset.platform = p));
    if (!isTauri()) return;
    invoke<NativeMaterial>("native_material")
      .then((m) => {
        if (m !== "none") root.dataset.material = m;
      })
      .catch(() => {});
  }, []);
}
