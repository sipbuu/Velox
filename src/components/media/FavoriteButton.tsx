import { Heart } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { useLibrary } from "@/store/library";
import { cn } from "@/lib/cn";

export function FavoriteButton({ item, className, size = 14 }: { item: MediaItem; className?: string; size?: number }) {
  const fav = useLibrary((s) => s.favorites.includes(item.uid));
  const toggle = useLibrary((s) => s.toggleFavorite);
  return (
    <button
      type="button"
      aria-label={fav ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={fav}
      onClick={(e) => {
        e.stopPropagation();
        toggle(item);
      }}
      className={cn(
        "glass-dark grid h-7 w-7 place-items-center rounded-full transition-all duration-200 ease-spring hover:scale-110 active:scale-90",
        fav ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        className,
      )}
    >
      <Heart size={size} fill={fav ? "currentColor" : "none"} className={fav ? "text-live" : "text-white"} />
    </button>
  );
}
