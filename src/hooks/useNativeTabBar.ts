import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { nativeTabsSupported, onNativeTab, selectNativeTab, setNativeTabs, setNativeTabsVisible, type NativeTab } from "@/lib/nativeTabs";
import { usePlayer } from "@/store/player";

export function useNativeTabBar(tabs: (NativeTab & { to: string })[]) {
  const [active, setActive] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const playerFull = usePlayer((s) => !!s.request && s.mode === "full");
  const index = Math.max(
    0,
    tabs.findIndex((t) => (t.to === "/" ? pathname === "/" : pathname.startsWith(t.to))),
  );

  const initialIndex = useRef(index);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void nativeTabsSupported().then(async (ok) => {
      if (!ok || cancelled) return;
      try {
        const material = await setNativeTabs(
          tabs.map(({ title, symbol }) => ({ title, symbol })),
          initialIndex.current,
        );
        if (cancelled) return;
        off = await onNativeTab((i) => tabs[i] && navigate(tabs[i].to));
        setActive(true);
        if (material) document.documentElement.dataset.nativeTabs = material;
      } catch (e) {
        console.warn("[velox] native tab bar unavailable", e);
      }
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [tabs, navigate]);

  useEffect(() => {
    if (active) void selectNativeTab(index);
  }, [active, index]);

  useEffect(() => {
    if (active) void setNativeTabsVisible(!playerFull);
  }, [active, playerFull]);

  return active;
}
