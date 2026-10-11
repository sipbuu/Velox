import { Download, EyeOff, Film, Heart, Play, RotateCcw } from "lucide-react";
import type { MediaItem } from "@/types/media";
import type { TitleMetadata } from "@/lib/metadata";
import { useLibrary } from "@/store/library";
import { useFilters } from "@/store/filters";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Props {
  item: MediaItem;
  meta: TitleMetadata | null;
  playLabel?: string;
  resumeAt?: number | null;
  onPlay: () => void;
  onStartOver?: () => void;
  onTrailer?: () => void;
  onDownload?: () => void;
  onHidden?: () => void;
}

export function TitleActions({ item, meta, playLabel, resumeAt, onPlay, onStartOver, onTrailer, onDownload, onHidden }: Props) {
  const fav = useLibrary((s) => s.favorites.includes(item.uid));
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const hideItem = useFilters((s) => s.hideItem);
  return (
    <>
      <button className="btn-primary !px-5 !py-2.5 text-base" onClick={onPlay}>
        <Play size={18} fill="currentColor" /> {playLabel ?? (resumeAt ? `Resume ${formatDuration(resumeAt)}` : "Play")}
      </button>
      {resumeAt && onStartOver && (
        <button className="btn-glass !py-2.5" onClick={onStartOver}>
          <RotateCcw size={16} /> Start over
        </button>
      )}
      {(meta?.trailerKey || meta?.trailerUrl) && onTrailer && (
        <button className="btn-glass !py-2.5" onClick={onTrailer}>
          <Film size={16} /> Trailer
        </button>
      )}
      <button aria-label={fav ? "Remove from favorites" : "Add to favorites"} className={cn("btn-glass !px-3 !py-2.5", fav && "text-live")} onClick={() => toggleFavorite(item)}>
        <Heart size={18} fill={fav ? "currentColor" : "none"} />
      </button>
      {onDownload && (
        <button aria-label="Download" className="btn-glass !px-3 !py-2.5" onClick={onDownload}>
          <Download size={18} />
        </button>
      )}
      <button
        aria-label="Hide"
        className="btn-glass !px-3 !py-2.5"
        onClick={() => {
          hideItem(item.uid);
          onHidden?.();
        }}
      >
        <EyeOff size={18} />
      </button>
    </>
  );
}
