import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import type { MediaItem } from "@/types/media";
import type { TitleMetadata } from "@/lib/metadata";
import { Artwork } from "@/components/media/Artwork";
import { useSettings } from "@/store/settings";
import { usePlayer } from "@/store/player";
import { RatingsRow } from "./RatingsRow";
import { youtubeEmbed } from "@/lib/youtube";

interface Props {
  item: MediaItem;
  meta: TitleMetadata | null;
  actions: ReactNode;
}

export function TitleHero({ item, meta, actions }: Props) {
  const navigate = useNavigate();
  const autoplay = useSettings((s) => s.autoplayTrailers);
  const playerActive = usePlayer((s) => !!s.request);
  const [showTrailer, setShowTrailer] = useState(false);
  const [muted, setMuted] = useState(true);
  const trailerKey = meta?.trailerKey;
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setShowTrailer(false);
    if (!trailerKey || !autoplay || reduced || playerActive) return;
    const t = window.setTimeout(() => setShowTrailer(true), 1800);
    return () => window.clearTimeout(t);
  }, [trailerKey, autoplay, reduced, playerActive]);

  const backdrop = meta?.backdrop ?? item.artwork.backdrop ?? item.artwork.poster;
  const facts = [
    meta?.year ?? item.year,
    meta?.runtimeMin ? `${Math.floor(meta.runtimeMin / 60) ? `${Math.floor(meta.runtimeMin / 60)}h ` : ""}${meta.runtimeMin % 60}m` : undefined,
    meta?.certification,
    (meta?.genres.length ? meta.genres : item.genres ?? []).slice(0, 3).join(", ") || undefined,
  ].filter(Boolean);

  return (
    <div className="relative -mx-4 -mt-4 mb-6 overflow-hidden md:-mx-8 md:-mt-8 md:rounded-b-glass-xl">
      <div className="relative h-[24rem] w-full md:h-[34rem]">
        <Artwork src={backdrop} title={item.title} className="absolute inset-0 h-full w-full" />
        {showTrailer && trailerKey && (
          <div className="absolute inset-0 overflow-hidden animate-fade-up">
            <iframe
              className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 md:h-[120%] md:w-[120%]"
              src={youtubeEmbed(trailerKey, { muted, loop: true, controls: false })}
              title="Trailer preview"
              allow="autoplay; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/50 to-canvas/0" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas/80 via-canvas/20 to-transparent" />
      </div>

      <button aria-label="Back" className="glass-pill absolute left-4 top-[calc(env(safe-area-inset-top)+1rem)] grid h-10 w-10 place-items-center md:left-8" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} />
      </button>
      {showTrailer && (
        <button aria-label={muted ? "Unmute trailer" : "Mute trailer"} className="glass-pill absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] grid h-10 w-10 place-items-center md:right-8" onClick={() => setMuted((m) => !m)}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      )}

      <div className="absolute inset-x-4 bottom-4 flex items-end gap-5 md:inset-x-8 md:bottom-8">
        <Artwork src={meta?.poster ?? item.artwork.poster} title={item.title} className="hidden aspect-[2/3] w-40 shrink-0 rounded-glass shadow-poster ring-1 ring-white/10 md:block" />
        <div className="min-w-0 flex-1">
          <h1 className="text-balance text-3xl font-bold tracking-tight md:text-5xl">{meta?.title ?? item.title}</h1>
          {meta?.tagline && <p className="mt-1 text-sm italic text-ink-muted md:text-base">{meta.tagline}</p>}
          {facts.length > 0 && <p className="mt-2 text-sm text-ink-muted">{facts.join(" · ")}</p>}
          {meta && <RatingsRow ratings={meta.ratings} className="mt-3" />}
          <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
        </div>
      </div>
    </div>
  );
}
