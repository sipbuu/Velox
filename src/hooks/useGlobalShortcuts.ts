import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useUi } from "@/store/ui";
import { usePlayer } from "@/store/player";

const GO: Record<string, string> = { h: "/", l: "/live", t: "/guide", m: "/movies", s: "/series", f: "/favorites", d: "/downloads", p: "/settings" };

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const pendingG = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const player = usePlayer.getState();
      if (player.request && player.mode === "full") return;
      if (e.key === "?") {
        useUi.getState().setShortcutsOpen(true);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        navigate("/search");
        return;
      }
      if (e.key === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (Date.now() - pendingG.current < 1200 && GO[e.key]) {
        pendingG.current = 0;
        navigate(GO[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
