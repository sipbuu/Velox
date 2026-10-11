import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { nativeTabsSupported, onNativeTab, selectNativeTab, setNativeTabs, setNativeTabsVisible, type NativeTab } from "@/lib/nativeTabs";
import { usePlayer } from "@/store/player";

const ROUTE_ALIASES: [RegExp, string][] = [
  [/^\/guide/, "/live"],
  [/^\/title\//, "/movies"],
  [/^\/series\//, "/series"],
  [/^\/(search|downloads|sources|settings)/, "/more"],
];

export function tabIndexFor(pathname: string, tabs: { to: string }[]): number {
  const target = ROUTE_ALIASES.find(([re]) => re.test(pathname))?.[1] ?? pathname;
  return tabs.findIndex((t) => (t.to === "/" ? target === "/" : target === t.to || target.startsWith(`${t.to}/`)));
}

export function useNativeTabBar(tabs: (NativeTab & { to: string })[]) {
  const [active, setActive] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const playerFull = usePlayer((s) => !!s.request && s.mode === "full");
  const index = tabIndexFor(pathname, tabs);

  const navigateRef = useRef(navigate);
  const tabsRef = useRef(tabs);
  const indexRef = useRef(index);
  useEffect(() => {
    navigateRef.current = navigate;
    tabsRef.current = tabs;
    if (index >= 0) indexRef.current = index;
  });

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void nativeTabsSupported().then(async (ok) => {
      if (!ok || cancelled) return;
      try {
        off = await onNativeTab((i) => {
          const tab = tabsRef.current[i];
          if (tab) navigateRef.current(tab.to);
        });
        const material = await setNativeTabs(
          tabsRef.current.map(({ title, symbol }) => ({ title, symbol })),
          Math.max(0, indexRef.current),
        );
        if (cancelled) return;
        setActive(true);
        if (material) document.documentElement.dataset.nativeTabs = material;
      } catch (e) {
        console.warn("[velox] native tab bar unavailable, using web tab bar", e);
        off?.();
        off = undefined;
        void setNativeTabsVisible(false);
      }
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    if (active && index >= 0) void selectNativeTab(index);
  }, [active, index]);

  useEffect(() => {
    if (active) void setNativeTabsVisible(!playerFull);
  }, [active, playerFull]);

  return active;
}
