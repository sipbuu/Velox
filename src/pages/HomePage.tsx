import { Link, useNavigate } from "react-router-dom";
import { Clapperboard, Layers, Plus, RefreshCw, Tv } from "lucide-react";
import { useMemo } from "react";
import { useLibrary, useUnifiedLibrary } from "@/store/library";
import { useSources } from "@/store/sources";
import { useFilters } from "@/store/filters";
import { usePlayer } from "@/store/player";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/media/Artwork";
import { PosterCard } from "@/components/media/PosterCard";
import { ChannelTile } from "@/components/media/ChannelTile";
import type { MediaItem } from "@/types/media";

export function HomePage() {
  const view = useUnifiedLibrary();
  const configs = useSources((s) => s.configs);
  const { recents, favorites, refreshAll, status } = useLibrary();
  const hiddenItems = useFilters((s) => s.hiddenItems);
  const hiddenUids = useMemo(() => new Set(hiddenItems), [hiddenItems]);
  const play = usePlayer((s) => s.play);
  const navigate = useNavigate();

  const counts = useMemo(() => {
    const c = { live: 0, movie: 0, series: 0 };
    for (const i of view.items) if (i.kind in c) c[i.kind as keyof typeof c]++;
    return c;
  }, [view.items]);

  const continueWatching = recents
    .filter((r) => !r.finished && r.position && r.duration && r.position > 20)
    .map((r) => ({ r, item: view.byUid.get(r.uid) ?? r.item }))
    .filter((x): x is { r: (typeof recents)[number]; item: MediaItem } => !!x.item && !hiddenUids.has(x.item.uid));
  const recentChannels = recents
    .filter((r) => r.item?.kind === "live" || view.byUid.get(r.uid)?.kind === "live")
    .map((r) => view.byUid.get(r.uid) ?? r.item!)
    .filter((i) => !hiddenUids.has(i.uid))
    .slice(0, 12);
  const favItems = favorites.map((u) => view.byUid.get(u)).filter((x): x is MediaItem => !!x);
  const latestMovies = useMemo(
    () => view.items.filter((i) => i.kind === "movie").sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 12),
    [view.items],
  );
  const liveSample = useMemo(() => {
    const fav = new Set(favorites);
    return view.items
      .filter((i) => i.kind === "live")
      .sort((a, b) => Number(fav.has(b.uid)) - Number(fav.has(a.uid)))
      .slice(0, 8);
  }, [view.items, favorites]);
  const loading = Object.values(status).some((s) => s.state === "loading");

  const open = (item: MediaItem) =>
    item.kind === "series"
      ? navigate(`/series/${encodeURIComponent(item.uid)}`)
      : item.kind === "movie"
        ? navigate(`/title/${encodeURIComponent(item.uid)}`)
        : play(item);

  if (!configs.length) {
    return (
      <EmptyState
        icon={<Plus />}
        title="Welcome to Velox"
        body="Add an Xtream Codes account, an M3U playlist, direct stream URLs or a local media folder to get started."
        action={
          <Link to="/sources" className="btn-primary">
            Add a source
          </Link>
        }
      />
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Home"
        subtitle={(() => {
          const n = configs.filter((c) => c.enabled).length;
          return `${n} active source${n === 1 ? "" : "s"}`;
        })()}
        actions={
          <button className="btn-glass" onClick={refreshAll} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:grid-rows-2">
        <BentoTile to="/live" className="col-span-2 row-span-2 min-h-[12rem] md:min-h-[18rem]" icon={<Tv size={28} />} label="Live TV" count={counts.live} gradient="from-[#5b8cff] to-[#7a5cff]">
          {liveSample.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {liveSample.map((ch) => (
                <span
                  key={ch.uid}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play ${ch.title}`}
                  onClick={(e) => {
                    e.preventDefault();
                    void play(ch);
                  }}
                  className="glass-pill aspect-video overflow-hidden !rounded-xl !bg-white/85 transition-transform duration-200 ease-spring hover:scale-105 active:scale-95"
                >
                  <Artwork src={ch.artwork.logo} title={ch.title} variant="logo" fit="contain" className="h-full w-full" />
                </span>
              ))}
            </div>
          )}
        </BentoTile>
        <BentoTile to="/movies" icon={<Clapperboard size={22} />} label="Movies" count={counts.movie} gradient="from-[#ff5ca8] to-[#ff8a5c]" />
        <BentoTile to="/series" icon={<Layers size={22} />} label="Series" count={counts.series} gradient="from-[#22c3a6] to-[#2a8cff]" />
        <GlassPanel className="col-span-2 flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Sources</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {configs.map((c) => (
                <span key={c.id} className="glass-pill px-2.5 py-1 text-xs text-ink-muted">
                  {c.name}
                  {status[c.id]?.state === "error" && <span className="ml-1 text-live">!</span>}
                </span>
              ))}
            </div>
          </div>
          <Link to="/sources" className="btn-glass shrink-0">
            Manage
          </Link>
        </GlassPanel>
      </section>

      {continueWatching.length > 0 && (
        <Shelf title="Continue watching">
          {continueWatching.slice(0, 12).map(({ r, item }) => (
            <div key={item.uid} className="w-56 shrink-0">
              <button className="poster-card group block aspect-video w-full bg-surface" onClick={() => play(item, {})}>
                <Artwork src={item.artwork.backdrop ?? item.artwork.poster ?? item.artwork.logo} title={item.title} variant="logo" className="absolute inset-0" />
                <div className="absolute inset-0 bg-poster-fade" />
                <p className="absolute bottom-3 left-3 right-3 truncate text-left text-sm font-semibold text-white">{item.title}</p>
                {r.duration && r.position ? (
                  <div className="absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-white/30">
                    <div className="h-full rounded-full bg-white" style={{ width: `${(r.position / r.duration) * 100}%` }} />
                  </div>
                ) : null}
              </button>
            </div>
          ))}
        </Shelf>
      )}

      {recentChannels.length > 0 && (
        <Shelf title="Recent channels">
          {recentChannels.map((ch) => (
            <div key={ch.uid} className="w-44 shrink-0">
              <ChannelTile item={ch} onSelect={(c) => play(c, { channels: recentChannels })} />
            </div>
          ))}
        </Shelf>
      )}

      {favItems.length > 0 && (
        <Shelf title="Favorites">
          {favItems.slice(0, 20).map((item) =>
            item.kind === "live" ? (
              <div key={item.uid} className="w-44 shrink-0 self-start">
                <ChannelTile item={item} onSelect={(c) => play(c, { channels: favItems.filter((f) => f.kind === "live") })} />
              </div>
            ) : (
              <div key={item.uid} className="w-32 shrink-0 md:w-40">
                <PosterCard item={item} onSelect={open} />
              </div>
            ),
          )}
        </Shelf>
      )}

      {latestMovies.length > 0 && (
        <Shelf title="Recently added movies">
          {latestMovies.map((item) => (
            <div key={item.uid} className="w-32 shrink-0 md:w-40">
              <PosterCard item={item} onSelect={open} />
            </div>
          ))}
        </Shelf>
      )}
    </div>
  );
}

function BentoTile({ to, icon, label, count, gradient, className = "", children }: { to: string; icon: React.ReactNode; label: string; count: number; gradient: string; className?: string; children?: React.ReactNode }) {
  return (
    <Link to={to} className={`poster-card group relative flex flex-col justify-between overflow-hidden bg-gradient-to-br p-5 text-white ${gradient} ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-glass-sheen" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl transition-transform duration-500 group-hover:scale-125" />
      <div className="glass-pill grid h-11 w-11 place-items-center !bg-white/20 text-white">{icon}</div>
      {children && <div className="relative my-4">{children}</div>}
      <div>
        <p className="text-3xl font-bold tabular-nums tracking-tight">{count.toLocaleString()}</p>
        <p className="text-sm font-medium text-white/80">{label}</p>
      </div>
    </Link>
  );
}

function Shelf({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">{children}</div>
    </section>
  );
}
