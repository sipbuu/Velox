import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useUnifiedLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useDebounced } from "@/hooks/useDebounced";
import { PageHeader } from "@/components/ui/PageHeader";
import { PosterCard } from "@/components/media/PosterCard";
import { ChannelTile } from "@/components/media/ChannelTile";
import type { MediaItem } from "@/types/media";

export function SearchPage() {
  const view = useUnifiedLibrary();
  const play = usePlayer((s) => s.play);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim().toLowerCase(), 250);

  const results = useMemo(() => {
    if (q.length < 2) return { live: [], movie: [], series: [] } as Record<string, MediaItem[]>;
    const out: Record<string, MediaItem[]> = { live: [], movie: [], series: [] };
    for (const i of view.items) {
      if (out[i.kind] && out[i.kind].length < 40 && i.title.toLowerCase().includes(q)) out[i.kind].push(i);
    }
    return out;
  }, [q, view.items]);

  const select = (i: MediaItem) => (i.kind === "series" ? navigate(`/series/${encodeURIComponent(i.uid)}`) : play(i));

  return (
    <div className="animate-fade-up">
      <PageHeader title="Search" subtitle="Across every enabled source" />
      <label className="relative mb-6 block">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input autoFocus className="input py-3.5 pl-11 text-base" placeholder="Channels, movies, shows…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {(["live", "movie", "series"] as const).map((k) =>
        results[k].length ? (
          <section key={k} className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">{k === "live" ? "Channels" : k === "movie" ? "Movies" : "Series"}</h2>
            <div className={k === "live" ? "grid grid-cols-channels gap-4" : "grid grid-cols-posters gap-4"}>
              {results[k].map((i) =>
                k === "live" ? <ChannelTile key={i.uid} item={i} onSelect={select} /> : <PosterCard key={i.uid} item={i} onSelect={select} />,
              )}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
