import { useEffect, useState } from "react";
import type { MediaItem } from "@/types/media";
import { Artwork } from "@/components/media/Artwork";

interface Props {
  item: MediaItem;
  seconds?: number;
  onPlay: () => void;
  onCancel: () => void;
}

export function UpNext({ item, seconds = 8, onPlay, onCancel }: Props) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) {
      onPlay();
      return;
    }
    const t = window.setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left, onPlay]);

  const label = item.kind === "episode" ? `S${item.season} · E${item.episode}` : "";
  return (
    <div className="glass-dark absolute bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] right-4 z-30 flex w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-glass-lg p-3 animate-fade-up">
      <Artwork src={item.artwork.poster ?? item.artwork.backdrop} title={item.title} variant="logo" className="aspect-video w-28 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Up next in {left}s</p>
        <p className="truncate font-semibold">{item.title}</p>
        {label && <p className="text-xs text-white/60">{label}</p>}
        <div className="mt-2 flex gap-2">
          <button className="btn !px-3 !py-1 bg-white text-black" onClick={onPlay}>
            Play now
          </button>
          <button className="btn !px-3 !py-1 bg-white/15" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full bg-white transition-[width] duration-1000 ease-linear" style={{ width: `${((seconds - left) / seconds) * 100}%` }} />
      </div>
    </div>
  );
}
