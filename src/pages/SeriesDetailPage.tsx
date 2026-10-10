import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Heart, Play } from "lucide-react";
import type { Episode, SeriesDetail } from "@/types/media";
import { getSourceInstance } from "@/store/sources";
import { useLibrary, useUnifiedLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { Artwork } from "@/components/media/Artwork";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";

export function SeriesDetailPage() {
  const { uid = "" } = useParams();
  const decoded = decodeURIComponent(uid);
  const view = useUnifiedLibrary();
  const series = view.byUid.get(decoded);
  const { favorites, toggleFavorite } = useLibrary();
  const play = usePlayer((s) => s.play);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [season, setSeason] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!series) return;
    let alive = true;
    getSourceInstance(series.sourceId)
      .then((src) => {
        if (!src?.getSeriesDetail) throw new Error("This source doesn't provide episode lists.");
        return src.getSeriesDetail(series.id);
      })
      .then((d) => alive && (setDetail(d), setSeason(0)))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [series]);

  if (!series) return <p className="text-ink-muted">Series not found.</p>;
  const episodes = detail?.seasons[season]?.episodes ?? [];
  const playEpisode = (ep: Episode, idx: number) => play(ep, { queue: episodes.slice(idx + 1) });
  const fav = favorites.includes(series.uid);

  return (
    <div className="animate-fade-up">
      <div className="relative -mx-4 -mt-4 mb-6 overflow-hidden md:-mx-8 md:-mt-8 md:rounded-b-glass-xl">
        <Artwork src={series.artwork.backdrop ?? series.artwork.poster} title={series.title} className="h-72 w-full md:h-96" />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
        <button aria-label="Back" className="glass-pill absolute left-4 top-[calc(env(safe-area-inset-top)+1rem)] grid h-10 w-10 place-items-center" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div className="absolute inset-x-4 bottom-4 flex items-end gap-4 md:inset-x-8">
          <Artwork src={series.artwork.poster} title={series.title} className="hidden aspect-[2/3] w-32 shrink-0 rounded-glass shadow-poster md:block" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{series.title}</h1>
            <p className="mt-1 text-sm text-ink-muted">{[series.year, series.genres?.join(", ")].filter(Boolean).join(" · ")}</p>
            <div className="mt-3 flex gap-2">
              {episodes[0] && (
                <button className="btn-primary" onClick={() => playEpisode(episodes[0], 0)}>
                  <Play size={16} fill="currentColor" /> Play
                </button>
              )}
              <button className="btn-glass" onClick={() => toggleFavorite(series.uid)}>
                <Heart size={16} fill={fav ? "currentColor" : "none"} className={fav ? "text-live" : ""} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {series.plot && <p className="mb-6 max-w-3xl text-sm leading-relaxed text-ink-muted">{series.plot}</p>}
      {error && <p className="text-sm text-live">{error}</p>}
      {!detail && !error && <div className="skeleton h-40 rounded-glass-lg" />}

      {detail && (
        <>
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
            {detail.seasons.map((s, i) => (
              <button
                key={s.number}
                onClick={() => setSeason(i)}
                className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-medium", i === season ? "bg-ink text-canvas" : "glass-pill text-ink-muted")}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {episodes.map((ep, idx) => (
              <GlassPanel key={ep.uid} className="poster-card flex cursor-pointer gap-3 p-2.5" onClick={() => playEpisode(ep, idx)}>
                <Artwork src={ep.artwork.poster ?? series.artwork.backdrop} title={`E${ep.episode}`} variant="logo" className="aspect-video w-36 shrink-0 rounded-xl" />
                <div className="min-w-0 py-1">
                  <p className="text-xs font-semibold text-accent">Episode {ep.episode}</p>
                  <p className="line-clamp-1 text-sm font-semibold">{ep.title}</p>
                  {ep.plot && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{ep.plot}</p>}
                  {ep.durationSec ? <p className="mt-1 text-[11px] text-ink-faint">{formatDuration(ep.durationSec)}</p> : null}
                </div>
              </GlassPanel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
