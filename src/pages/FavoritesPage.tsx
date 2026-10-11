import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { useLibrary, useUnifiedLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChannelTile } from "@/components/media/ChannelTile";
import { PosterCard } from "@/components/media/PosterCard";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "all", label: "All" },
  { key: "live", label: "Channels" },
  { key: "movie", label: "Movies" },
  { key: "series", label: "Shows" },
] as const;

export function FavoritesPage() {
  const view = useUnifiedLibrary();
  const { favorites, favoriteItems } = useLibrary();
  const play = usePlayer((s) => s.play);
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");

  const items = useMemo(
    () =>
      favorites
        .map((uid) => view.byUid.get(uid) ?? (view.byUid.size ? undefined : favoriteItems[uid]))
        .filter((i): i is MediaItem => !!i),
    [favorites, favoriteItems, view.byUid],
  );
  const groups = {
    live: items.filter((i) => i.kind === "live"),
    movie: items.filter((i) => i.kind === "movie"),
    series: items.filter((i) => i.kind === "series"),
  };

  const select = (i: MediaItem) =>
    i.kind === "series"
      ? navigate(`/series/${encodeURIComponent(i.uid)}`)
      : play(i, i.kind === "live" ? { channels: groups.live } : undefined);

  if (!items.length) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Favorites" />
        <EmptyState icon={<Heart />} title="No favorites yet" body="Tap the heart on any channel, movie or show, or long-press it and choose Add to Favorites." />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Favorites" subtitle={`${items.length} saved`} />
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => {
          const count = t.key === "all" ? items.length : groups[t.key].length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-medium", tab === t.key ? "bg-ink text-canvas" : "glass-pill text-ink-muted")}
            >
              {t.label} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>
      {(tab === "all" || tab === "live") && groups.live.length > 0 && (
        <Section title="Channels" show={tab === "all"}>
          <div className="grid grid-cols-channels gap-4">
            {groups.live.map((i) => (
              <ChannelTile key={i.uid} item={i} onSelect={select} />
            ))}
          </div>
        </Section>
      )}
      {(tab === "all" || tab === "movie") && groups.movie.length > 0 && (
        <Section title="Movies" show={tab === "all"}>
          <div className="grid grid-cols-posters gap-4">
            {groups.movie.map((i) => (
              <PosterCard key={i.uid} item={i} onSelect={select} />
            ))}
          </div>
        </Section>
      )}
      {(tab === "all" || tab === "series") && groups.series.length > 0 && (
        <Section title="Shows" show={tab === "all"}>
          <div className="grid grid-cols-posters gap-4">
            {groups.series.map((i) => (
              <PosterCard key={i.uid} item={i} onSelect={select} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      {show && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}
