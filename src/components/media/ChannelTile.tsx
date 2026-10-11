import { memo, type KeyboardEvent } from "react";
import { History } from "lucide-react";
import type { EpgProgramme, MediaItem } from "@/types/media";
import { Artwork } from "./Artwork";
import { FavoriteButton } from "./FavoriteButton";
import { useLongPress } from "@/hooks/useLongPress";
import { useUi } from "@/store/ui";
import { formatTime } from "@/lib/format";

interface Props {
  item: MediaItem;
  onSelect: (item: MediaItem) => void;
  nowPlaying?: EpgProgramme;
}

export const ChannelTile = memo(function ChannelTile({ item, onSelect, nowPlaying }: Props) {
  const openSheet = useUi((s) => s.openSheet);
  const press = useLongPress((x, y) => openSheet({ item, x, y }));
  const pct = nowPlaying ? (Date.now() - nowPlaying.start) / Math.max(1, nowPlaying.end - nowPlaying.start) : 0;
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
      className="poster-card glass group flex w-full cursor-pointer select-none flex-col gap-3 p-3 text-left tap-highlight-none"
      onClick={() => onSelect(item)}
      onKeyDown={onKey}
      {...press}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-white/60 dark:bg-white/5">
        <Artwork src={item.artwork.logo} title={item.title} variant="logo" fit="contain" className="absolute inset-0" />
        {item.kind === "live" && item.number != null && (
          <span className="glass-dark absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">{item.number}</span>
        )}
        {item.kind === "live" && item.hasArchive && (
          <span title="Catch-up available" className="glass-dark absolute bottom-1.5 left-1.5 grid h-5 w-5 place-items-center rounded-md">
            <History size={11} />
          </span>
        )}
        <FavoriteButton item={item} className="absolute right-1.5 top-1.5" size={12} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
        {nowPlaying ? (
          <>
            <p className="truncate text-xs text-ink-muted">
              {formatTime(nowPlaying.start)} · {nowPlaying.title}
            </p>
            <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, pct * 100)}%` }} />
            </div>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-live animate-live-pulse" /> Live
          </p>
        )}
      </div>
    </div>
  );
});
