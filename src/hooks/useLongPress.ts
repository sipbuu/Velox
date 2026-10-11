import { useRef, type MouseEvent, type TouchEvent } from "react";

export function useLongPress(onPress: (x: number, y: number) => void, ms = 480) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };

  return {
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      onPress(e.clientX, e.clientY);
    },
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      fired.current = false;
      start.current = { x: t.clientX, y: t.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onPress(t.clientX, t.clientY);
      }, ms);
    },
    onTouchMove: (e: TouchEvent) => {
      const t = e.touches[0];
      if (start.current && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) clear();
    },
    onTouchEnd: () => clear(),
    onClickCapture: (e: MouseEvent) => {
      if (fired.current) {
        e.stopPropagation();
        e.preventDefault();
        fired.current = false;
      }
    },
  };
}
