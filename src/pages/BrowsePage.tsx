import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clapperboard, Heart, Layers, Search, Tv } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { useLibrary, useUnifiedLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { PageHeader } from "@/components/ui/PageHeader";
import { CategoryChips } from "@/components/ui/CategoryChips";
import { EmptyState } from "@/components/ui/EmptyState";
import { VirtualGrid } from "@/components/media/VirtualGrid";
import { PosterCard } from "@/components/media/PosterCard";
import { ChannelTile } from "@/components/media/ChannelTile";
import { useDebounced } from "@/hooks/useDebounced";
import { cn } from "@/lib/cn";

const META = {
  live: { title: "Live TV", icon: Tv },
  movie: { title: "Movies", icon: Clapperboard },
  series: { title: "Series", icon: Layers },
} as const;

export function BrowsePage({ kind }: { kind: "live" | "movie" | "series" }) {
  const view = useUnifiedLibrary();
  const favorites = useLibrary((s) => s.favorites);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const play = usePlayer((s) => s.play);
  const navigate = useNavigate();
  const [category, setCategory] = useState<string>();
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const q = useDebounced(query.trim().toLowerCase());

  const categories = useMemo(() => view.categories.filter((c) => c.kind === kind), [view.categories, kind]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const items = useMemo(() => {
    const [srcId, catId] = category?.split("::") ?? [];
    return view.items.filter(
      (i) =>
        i.kind === kind &&
        (!category || (i.sourceId === srcId && i.categoryIds.includes(catId))) &&
        (!q || i.title.toLowerCase().includes(q)) &&
        (!favOnly || favSet.has(i.uid)),
    );
  }, [view.items, kind, category, q, favOnly, favSet]);

  const select = (item: MediaItem) => {
    if (item.kind === "series") navigate(`/series/${encodeURIComponent(item.uid)}`);
    else {
      const queue = item.kind === "live" ? [] : undefined;
      void play(item, { queue });
    }
  };

  const meta = META[kind];
  const Icon = meta.icon;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={meta.title}
        subtitle={`${items.length.toLocaleString()} ${kind === "live" ? "channels" : "titles"}`}
        actions={
          <button
            aria-label="Favorites only"
            className={cn("btn-glass", favOnly && "!bg-live/15 text-live")}
            onClick={() => setFavOnly((f) => !f)}
          >
            <Heart size={16} fill={favOnly ? "currentColor" : "none"} />
          </button>
        }
      />
      <div className="sticky top-[env(safe-area-inset-top)] z-30 -mx-4 mb-5 space-y-3 px-4 py-2 md:-mx-8 md:px-8">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input className="input pl-10" placeholder={`Search ${meta.title.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {categories.length > 0 && <CategoryChips categories={categories} value={category} onChange={setCategory} />}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Icon />} title="Nothing here yet" body="Add or refresh a source, or try a different category." />
      ) : kind === "live" ? (
        <VirtualGrid
          items={items}
          minItemWidth={170}
          aspect={9 / 16}
          footerHeight={84}
          getKey={(i) => i.uid}
          render={(i) => (
            <div onContextMenu={(e) => (e.preventDefault(), toggleFavorite(i.uid))}>
              <ChannelTile item={i} onSelect={select} favorite={favSet.has(i.uid)} />
            </div>
          )}
        />
      ) : (
        <VirtualGrid
          items={items}
          minItemWidth={140}
          aspect={1.5}
          footerHeight={56}
          getKey={(i) => i.uid}
          render={(i) => (
            <div onContextMenu={(e) => (e.preventDefault(), toggleFavorite(i.uid))}>
              <PosterCard item={i} onSelect={select} favorite={favSet.has(i.uid)} />
            </div>
          )}
        />
      )}
    </div>
  );
}
