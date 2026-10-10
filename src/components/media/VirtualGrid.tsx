import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

interface Props<T> {
  items: T[];
  minItemWidth: number;
  aspect: number;
  footerHeight: number;
  gap?: number;
  render: (item: T) => ReactNode;
  getKey: (item: T) => string;
}

export function VirtualGrid<T>({ items, minItemWidth, aspect, footerHeight, gap = 16, render, getKey }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(2, Math.floor((width + gap) / (minItemWidth + gap)));
  const itemW = width ? (width - gap * (cols - 1)) / cols : minItemWidth;
  const rowH = itemW * aspect + footerHeight + gap;
  const rows = useMemo(() => Math.ceil(items.length / cols), [items.length, cols]);

  const v = useWindowVirtualizer({
    count: rows,
    estimateSize: () => rowH,
    overscan: 4,
    scrollMargin: ref.current?.offsetTop ?? 0,
  });

  useEffect(() => v.measure(), [rowH, v]);

  return (
    <div ref={ref} className="relative w-full" style={{ height: v.getTotalSize() }}>
      {v.getVirtualItems().map((row) => (
        <div
          key={row.key}
          className="absolute left-0 right-0 grid"
          style={{
            transform: `translateY(${row.start - v.options.scrollMargin}px)`,
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap,
          }}
        >
          {items.slice(row.index * cols, row.index * cols + cols).map((it) => (
            <div key={getKey(it)}>{render(it)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
