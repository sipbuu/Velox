import { useEffect } from "react";
import { useSettings } from "@/store/settings";

export function useThemeSync() {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const reduceTransparency = useSettings((s) => s.reduceTransparency);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      const root = document.documentElement;
      root.dataset.theme = resolved;
      root.style.setProperty("--v-accent", accent);
      root.toggleAttribute("data-reduce-transparency", reduceTransparency);
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        if (theme !== "system") m.setAttribute("content", resolved === "dark" ? "#0b0b10" : "#f2f2f7");
      });
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, accent, reduceTransparency]);
}
