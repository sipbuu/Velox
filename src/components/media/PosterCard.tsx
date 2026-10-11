import { memo, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { Artwork } from "./Artwork";
import { FavoriteButton } from "./FavoriteButton";
import { useLongPress } from "@/hooks/useLongPress";
import { useUi } from "@/store/ui";

interface Props {
  item: MediaItem;
  onSelect: (item: MediaItem) => void;
  progress?: number;
}

export const PosterCard = memo(function PosterCard({ item, onSelect, progress }: Props) {
  const openSheet = useUi((s) => s.openSheet);
  const press = useLongPress((x, y) => openSheet({ item, x, y }));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(item);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={item.title}
      className="group block w-full cursor-pointer select-none text-left tap-highlight-none focus:outline-none"
      onClick={() => onSelect(item)}
      onKeyDown={onKey}
      {...press}
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
        <FavoriteButton item={item} className="absolute right-2 top-2" />
        {progress != null && progress > 0.02 && (
          <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-ink">{item.title}</p>
      {item.year && <p className="text-xs text-ink-faint">{item.year}</p>}
    </div>
  );
});
