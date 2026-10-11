import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Layers, Play } from "lucide-react";
import type { Episode, SeriesDetail } from "@/types/media";
import { getSourceInstance } from "@/store/sources";
import { useLibrary, useUnifiedLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useTitleMetadata } from "@/hooks/useTitleMetadata";
import { Artwork } from "@/components/media/Artwork";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { TitleHero } from "@/components/title/TitleHero";
import { TitleActions } from "@/components/title/TitleActions";
import { TrailerModal } from "@/components/title/TrailerModal";
import { CastRow } from "@/components/title/CastRow";
import { ReviewsSection } from "@/components/title/ReviewsSection";
import { MetadataHint } from "@/components/title/MetadataHint";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";

export function SeriesDetailPage() {
  const { uid = "" } = useParams();
  const decoded = decodeURIComponent(uid);
  const view = useUnifiedLibrary();
  const favoriteItems = useLibrary((s) => s.favoriteItems);
  const recents = useLibrary((s) => s.recents);
  const series = view.byUid.get(decoded) ?? favoriteItems[decoded];
  const { meta } = useTitleMetadata(series);
  const play = usePlayer((s) => s.play);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [season, setSeason] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [trailer, setTrailer] = useState(false);

  useEffect(() => {
    if (!series) return;
    let alive = true;
    getSourceInstance(series.sourceId)
      .then((src) => {
        if (!src?.getSeriesDetail) throw new Error("This source doesn't provide episode lists.");
        return src.getSeriesDetail(series.id);
      })
      .then((d) => alive && setDetail(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [series]);

  const progress = useMemo(() => new Map(recents.map((r) => [r.uid, r])), [recents]);
  const allEpisodes = useMemo(() => detail?.seasons.flatMap((s) => s.episodes) ?? [], [detail]);

  const continueTarget = useMemo(() => {
    if (!allEpisodes.length) return null;
    const watched = recents.filter((r) => allEpisodes.some((e) => e.uid === r.uid)).sort((a, b) => b.at - a.at)[0];
    if (!watched) return { ep: allEpisodes[0], label: "Play S1 · E1", fresh: true };
    const idx = allEpisodes.findIndex((e) => e.uid === watched.uid);
    if (!watched.finished) return { ep: allEpisodes[idx], label: `Continue S${allEpisodes[idx].season} · E${allEpisodes[idx].episode}`, fresh: false };
    const nextEp = allEpisodes[idx + 1];
    return nextEp ? { ep: nextEp, label: `Next: S${nextEp.season} · E${nextEp.episode}`, fresh: false } : { ep: allEpisodes[0], label: "Watch again", fresh: true };
  }, [allEpisodes, recents]);

  useEffect(() => {
    if (!detail || !continueTarget) return;
    const idx = detail.seasons.findIndex((s) => s.episodes.some((e) => e.uid === continueTarget.ep.uid));
    if (idx >= 0) setSeason(idx);
  }, [detail, continueTarget]);

  if (!series) return <EmptyState icon={<Layers />} title="Series not found" body="It may have been removed from the source or hidden." />;

  const playEpisode = (ep: Episode) => {
    const idx = allEpisodes.findIndex((e) => e.uid === ep.uid);
    void play(ep, { queue: allEpisodes.slice(idx + 1) });
  };
  const episodes = detail?.seasons[season]?.episodes ?? [];

  return (
    <div className="animate-fade-up">
      <TitleHero
        item={series}
        meta={meta}
        actions={
          <TitleActions
            item={series}
            meta={meta}
            playLabel={continueTarget?.label ?? "Play"}
            onPlay={() => continueTarget && playEpisode(continueTarget.ep)}
            onTrailer={() => setTrailer(true)}
            onHidden={() => navigate(-1)}
          />
        }
      />

      {(meta?.overview || series.plot) && <p className="mb-2 max-w-3xl text-[15px] leading-relaxed text-ink-muted">{meta?.overview ?? series.plot}</p>}
      <MetadataHint />
      {error && <p className="mt-4 text-sm text-live">{error}</p>}
      {!detail && !error && <div className="skeleton mt-6 h-40 rounded-glass-lg" />}

      {detail && (
        <section className="mt-6">
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
            {episodes.map((ep) => {
              const p = progress.get(ep.uid);
              const pct = p?.finished ? 1 : p?.position && p.duration ? p.position / p.duration : 0;
              return (
                <GlassPanel key={ep.uid} className="poster-card flex cursor-pointer gap-3 p-2.5" onClick={() => playEpisode(ep)}>
                  <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl">
                    <Artwork src={ep.artwork.poster ?? series.artwork.backdrop} title={`E${ep.episode}`} variant="logo" className="absolute inset-0" />
                    <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition-opacity hover:opacity-100">
                      <Play size={22} fill="white" className="text-white" />
                    </span>
                    {pct > 0.02 && (
                      <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-white/30">
                        <span className="block h-full bg-accent" style={{ width: `${pct * 100}%` }} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 py-1">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                      Episode {ep.episode}
                      {p?.finished && <CheckCircle2 size={13} className="text-success" />}
                    </p>
                    <p className="line-clamp-1 text-sm font-semibold">{ep.title}</p>
                    {ep.plot && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{ep.plot}</p>}
                    {ep.durationSec ? <p className="mt-1 text-[11px] text-ink-faint">{formatDuration(ep.durationSec)}</p> : null}
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        </section>
      )}

      {meta && <CastRow cast={meta.cast} />}
      {meta && <ReviewsSection reviews={meta.reviews} />}
      {trailer && meta && <TrailerModal trailerKey={meta.trailerKey} url={meta.trailerUrl} title={meta.title} onClose={() => setTrailer(false)} />}
    </div>
  );
}
