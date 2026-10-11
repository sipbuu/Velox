import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Clapperboard } from "lucide-react";
import type { MediaItem } from "@/types/media";
import { useLibrary, useUnifiedLibrary } from "@/store/library";
import { resumePositionFor, usePlayer } from "@/store/player";
import { useDownloads } from "@/store/downloads";
import { getSourceInstance } from "@/store/sources";
import { useTitleMetadata } from "@/hooks/useTitleMetadata";
import { TitleHero } from "@/components/title/TitleHero";
import { TitleActions } from "@/components/title/TitleActions";
import { TrailerModal } from "@/components/title/TrailerModal";
import { CastRow } from "@/components/title/CastRow";
import { ReviewsSection } from "@/components/title/ReviewsSection";
import { MetadataHint } from "@/components/title/MetadataHint";
import { PosterCard } from "@/components/media/PosterCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { isTauri } from "@/lib/platform";

export function TitlePage() {
  const { uid = "" } = useParams();
  const decoded = decodeURIComponent(uid);
  const view = useUnifiedLibrary();
  const favoriteItems = useLibrary((s) => s.favoriteItems);
  const recents = useLibrary((s) => s.recents);
  const item = view.byUid.get(decoded) ?? favoriteItems[decoded] ?? recents.find((r) => r.uid === decoded)?.item;
  const { meta, loading } = useTitleMetadata(item);
  const play = usePlayer((s) => s.play);
  const enqueue = useDownloads((s) => s.enqueue);
  const navigate = useNavigate();
  const [trailer, setTrailer] = useState(false);
  const resumeAt = item ? resumePositionFor(item.uid) : null;

  const similar = useMemo(() => {
    if (!item) return [];
    const cats = new Set(item.categoryIds);
    return view.items.filter((i) => i.kind === item.kind && i.uid !== item.uid && i.categoryIds.some((c) => cats.has(c))).slice(0, 18);
  }, [item, view.items]);

  if (!item) return <EmptyState icon={<Clapperboard />} title="Title not found" body="It may have been removed from the source or hidden." />;

  const open = (i: MediaItem) => navigate(i.kind === "series" ? `/series/${encodeURIComponent(i.uid)}` : `/title/${encodeURIComponent(i.uid)}`);

  return (
    <div className="animate-fade-up">
      <TitleHero
        item={item}
        meta={meta}
        actions={
          <TitleActions
            item={item}
            meta={meta}
            resumeAt={resumeAt}
            onPlay={() => play(item)}
            onStartOver={() => play(item, { startOver: true })}
            onTrailer={() => setTrailer(true)}
            onDownload={
              isTauri()
                ? () => void getSourceInstance(item.sourceId).then((s) => s?.resolvePlayback(item)).then((r) => r && enqueue(r)).catch(() => {})
                : undefined
            }
            onHidden={() => navigate(-1)}
          />
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          {(meta?.overview || item.plot) && <p className="max-w-3xl text-[15px] leading-relaxed text-ink-muted">{meta?.overview ?? item.plot}</p>}
          {loading && !meta && <div className="skeleton mt-4 h-24 max-w-3xl rounded-glass" />}
          <MetadataHint />
        </div>
        {meta && (meta.directors.length > 0 || meta.awards || meta.releaseDate) && (
          <dl className="glass h-fit space-y-3 rounded-glass-lg p-4 text-sm">
            {meta.directors.length > 0 && <Fact label="Director">{meta.directors.join(", ")}</Fact>}
            {meta.releaseDate && <Fact label="Released">{new Date(meta.releaseDate).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</Fact>}
            {meta.awards && <Fact label="Awards">{meta.awards}</Fact>}
          </dl>
        )}
      </div>

      {meta && <CastRow cast={meta.cast} />}
      {meta && <ReviewsSection reviews={meta.reviews} />}

      {similar.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">More like this</h2>
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
            {similar.map((s) => (
              <div key={s.uid} className="w-32 shrink-0 md:w-40">
                <PosterCard item={s} onSelect={open} />
              </div>
            ))}
          </div>
        </section>
      )}

      {trailer && meta && <TrailerModal trailerKey={meta.trailerKey} url={meta.trailerUrl} title={meta.title} onClose={() => setTrailer(false)} />}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
