import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Download, EyeOff, Heart, Info, Play, Tv } from "lucide-react";
import { useUi } from "@/store/ui";
import { useLibrary } from "@/store/library";
import { useFilters } from "@/store/filters";
import { usePlayer } from "@/store/player";
import { useDownloads } from "@/store/downloads";
import { getSourceInstance } from "@/store/sources";
import { categoryKey } from "@/lib/contentFilter";
import { isTauri } from "@/lib/platform";
import { cn } from "@/lib/cn";

export function ActionSheet() {
  const { sheet, closeSheet } = useUi();
  const favorites = useLibrary((s) => s.favorites);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const { hideItem, hideCategory } = useFilters();
  const play = usePlayer((s) => s.play);
  const enqueue = useDownloads((s) => s.enqueue);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSheet();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, closeSheet]);

  if (!sheet) return null;
  const { item, category } = sheet;
  const fav = item ? favorites.includes(item.uid) : false;
  const desktop = window.matchMedia("(min-width: 768px) and (pointer: fine)").matches;
  const left = Math.min(sheet.x, window.innerWidth - 260);
  const top = Math.min(sheet.y, window.innerHeight - 320);

  const actions: { icon: React.ReactNode; label: string; run: () => void; danger?: boolean }[] = [];
  if (item) {
    actions.push({ icon: <Play size={16} />, label: item.kind === "series" ? "Open" : "Play", run: () => (item.kind === "series" ? navigate(`/series/${encodeURIComponent(item.uid)}`) : play(item)) });
    if (item.kind === "movie") actions.push({ icon: <Info size={16} />, label: "Details & trailer", run: () => navigate(`/title/${encodeURIComponent(item.uid)}`) });
    actions.push({ icon: <Heart size={16} fill={fav ? "currentColor" : "none"} />, label: fav ? "Remove from Favorites" : "Add to Favorites", run: () => toggleFavorite(item) });
    if (isTauri() && item.kind === "movie")
      actions.push({
        icon: <Download size={16} />,
        label: "Download",
        run: () => void getSourceInstance(item.sourceId).then((s) => s?.resolvePlayback(item)).then((r) => r && enqueue(r)).catch(() => {}),
      });
    actions.push({ icon: <EyeOff size={16} />, label: `Hide this ${item.kind === "live" ? "channel" : "title"}`, run: () => hideItem(item.uid), danger: true });
  }
  if (category) {
    actions.push({ icon: <Tv size={16} />, label: `Hide “${category.name}”`, run: () => hideCategory(categoryKey(category)), danger: true });
  }

  return (
    <div className="fixed inset-0 z-[60]" onPointerDown={(e) => e.target === e.currentTarget && closeSheet()}>
      <div className={cn("absolute inset-0", desktop ? "" : "bg-black/30 backdrop-blur-sm animate-fade-up")} onClick={closeSheet} />
      <div
        ref={ref}
        role="menu"
        className={cn(
          "glass-strong absolute overflow-hidden p-1.5 animate-fade-up",
          desktop ? "w-60 rounded-glass" : "inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] rounded-glass-xl p-2",
        )}
        style={desktop ? { left, top } : undefined}
      >
        {(item || category) && (
          <p className="truncate px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{item?.title ?? category?.name}</p>
        )}
        {actions.map((a) => (
          <button
            key={a.label}
            role="menuitem"
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 text-left font-medium transition-colors hover:bg-ink/5 active:bg-ink/10",
              desktop ? "py-2 text-sm" : "py-3.5 text-base",
              a.danger ? "text-live" : "text-ink",
            )}
            onClick={() => {
              closeSheet();
              a.run();
            }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
        {!desktop && (
          <button className="mt-1 w-full rounded-xl bg-ink/5 py-3.5 text-base font-semibold" onClick={closeSheet}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
