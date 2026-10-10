import { memo } from "react";
import { Heart, Star } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { Artwork } from "./Artwork";
import { cn } from "@/lib/cn";

interface Props {
  item: MediaItem;
  onSelect: (item: MediaItem) => void;
  favorite?: boolean;
  progress?: number;
}

export const PosterCard = memo(function PosterCard({ item, onSelect, favorite, progress }: Props) {
  return (
    <button
      className="group block w-full text-left tap-highlight-none focus:outline-none"
      onClick={() => onSelect(item)}
      aria-label={item.title}
    >
      <div className="poster-card aspect-[2/3] bg-surface">
        <Artwork src={item.artwork.poster} title={item.title} className="absolute inset-0" />
        <div className="absolute inset-0 bg-poster-fade opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-glass-sheen opacity-60" />
        {item.rating ? (
          <span className="glass-dark absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
            <Star size={11} fill="currentColor" className="text-warning" /> {item.rating.toFixed(1)}
          </span>
        ) : null}
        {favorite && (
          <span className="glass-dark absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full">
            <Heart size={12} fill="currentColor" className="text-live" />
          </span>
        )}
        {progress != null && progress > 0.02 && (
          <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <p className={cn("mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-ink")}>{item.title}</p>
      {item.year && <p className="text-xs text-ink-faint">{item.year}</p>}
    </button>
  );
});
