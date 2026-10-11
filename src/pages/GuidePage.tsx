import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bell, BellRing, CalendarDays, History, Play, X } from "lucide-react";
import { reminderId, useReminders } from "@/store/reminders";
import type { EpgProgramme, LiveChannel } from "@/types/media";
import { useUnifiedLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useEpg } from "@/hooks/useEpgNow";
import { Artwork } from "@/components/media/Artwork";
import { CategoryChips } from "@/components/ui/CategoryChips";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";

const ROW_H = 72;
const HOURS_BACK = 3;
const HOURS_AHEAD = 12;

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

interface Selection {
  channel: LiveChannel;
  programme: EpgProgramme;
}

export function GuidePage() {
  const view = useUnifiedLibrary();
  const play = usePlayer((s) => s.play);
  const [category, setCategory] = useState<string>();
  const [selected, setSelected] = useState<Selection | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = useNow();
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  const pxPerMin = narrow ? 3.2 : 4.4;
  const labelW = narrow ? 92 : 200;

  const windowStart = useMemo(() => {
    const d = new Date(Date.now() - HOURS_BACK * 3600_000);
    d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
    return d.getTime();
  }, []);
  const windowEnd = windowStart + (HOURS_BACK + HOURS_AHEAD) * 3600_000;
  const totalW = ((windowEnd - windowStart) / 60000) * pxPerMin;
  const xOf = (t: number) => ((Math.min(Math.max(t, windowStart), windowEnd) - windowStart) / 60000) * pxPerMin;

  const categories = useMemo(() => view.categories.filter((c) => c.kind === "live"), [view.categories]);
  const channels = useMemo(() => {
    const [srcId, catId] = category?.split("::") ?? [];
    return view.items.filter((i): i is LiveChannel => i.kind === "live" && (!category || (i.sourceId === srcId && i.categoryIds.includes(catId))));
  }, [view.items, category]);

  const rows = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 6,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, ((Date.now() - windowStart) / 60000 - 60) * pxPerMin);
  }, [pxPerMin, windowStart]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = windowStart; t <= windowEnd; t += 30 * 60000) out.push(t);
    return out;
  }, [windowStart, windowEnd]);

  if (!view.items.some((i) => i.kind === "live")) {
    return <EmptyState icon={<CalendarDays />} title="No channels yet" body="Add an Xtream account or an M3U playlist with EPG to see the guide." />;
  }

  return (
    <div className="flex h-[calc(100dvh-env(safe-area-inset-top)-7.5rem)] flex-col animate-fade-up md:h-[calc(100dvh-4rem)]">
      <header className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">TV Guide</h1>
          <p className="mt-1 text-sm text-ink-muted">{channels.length.toLocaleString()} channels · tap a programme for catch-up</p>
        </div>
        <button className="btn-glass" onClick={() => scrollRef.current && (scrollRef.current.scrollLeft = Math.max(0, xOf(Date.now()) - 60 * pxPerMin))}>
          Now
        </button>
      </header>
      {categories.length > 0 && (
        <div className="mb-3">
          <CategoryChips categories={categories} value={category} onChange={setCategory} />
        </div>
      )}

      <div ref={scrollRef} className="glass relative min-h-0 flex-1 overflow-auto overscroll-contain rounded-glass-lg">
        <div className="relative" style={{ width: labelW + totalW, height: rows.getTotalSize() + 40 }}>
          <div className="sticky top-0 z-20 flex h-10 border-b border-ink/10 bg-surface/80 backdrop-blur-xl" style={{ width: labelW + totalW }}>
            <div className="sticky left-0 z-10 h-full shrink-0 border-r border-ink/10 bg-surface" style={{ width: labelW }} />
            <div className="relative h-full" style={{ width: totalW }}>
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 flex h-full items-center border-l border-ink/10 pl-2 text-xs font-medium tabular-nums text-ink-muted" style={{ left: xOf(t) }}>
                  {formatTime(t)}
                </span>
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-0 top-10 z-10 w-0.5 bg-live/80 shadow-[0_0_8px_rgb(255_59_48/0.6)]" style={{ left: labelW + xOf(now) }}>
            <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-live" />
          </div>

          {rows.getVirtualItems().map((r) => {
            const ch = channels[r.index];
            return (
              <GuideRow
                key={ch.uid}
                channel={ch}
                top={r.start + 40}
                labelW={labelW}
                totalW={totalW}
                now={now}
                xOf={xOf}
                windowStart={windowStart}
                windowEnd={windowEnd}
                onPlay={() => play(ch, { channels })}
                onSelect={(programme) => setSelected({ channel: ch, programme })}
              />
            );
          })}
        </div>
      </div>

      {selected && (
        <ProgrammeSheet
          selection={selected}
          now={now}
          onClose={() => setSelected(null)}
          onWatchLive={() => {
            setSelected(null);
            void play(selected.channel, { channels });
          }}
          onCatchup={() => {
            const p = selected.programme;
            setSelected(null);
            void play(selected.channel, { channels, catchupStart: p.start, catchupDurationMin: Math.ceil((p.end - p.start) / 60000) });
          }}
        />
      )}
    </div>
  );
}

interface RowProps {
  channel: LiveChannel;
  top: number;
  labelW: number;
  totalW: number;
  now: number;
  windowStart: number;
  windowEnd: number;
  xOf: (t: number) => number;
  onPlay: () => void;
  onSelect: (p: EpgProgramme) => void;
}

const GuideRow = memo(function GuideRow({ channel, top, labelW, totalW, now, windowStart, windowEnd, xOf, onPlay, onSelect }: RowProps) {
  const { list } = useEpg(channel);
  const reminders = useReminders((s) => s.reminders);
  const visible = list.filter((p) => p.end > windowStart && p.start < windowEnd);
  return (
    <div className="absolute left-0 flex border-b border-ink/5" style={{ top, height: ROW_H, width: labelW + totalW }}>
      <button
        className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-2.5 border-r border-ink/10 bg-surface/95 px-2 text-left backdrop-blur-xl hover:bg-surface"
        style={{ width: labelW }}
        onClick={onPlay}
      >
        <Artwork src={channel.artwork.logo} title={channel.title} variant="logo" fit="contain" className="h-11 w-[4.5rem] shrink-0 rounded-lg bg-white/80 dark:bg-white/10" />
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-semibold">{channel.title}</span>
          {channel.number != null && <span className="text-xs tabular-nums text-ink-faint">{channel.number}</span>}
        </span>
      </button>
      <div className="relative h-full" style={{ width: totalW }}>
        {visible.length === 0 && <div className="absolute inset-y-2 left-2 right-2 rounded-xl bg-ink/[0.04]" />}
        {visible.map((p) => {
          const left = xOf(p.start);
          const width = Math.max(4, xOf(p.end) - left - 3);
          const live = p.start <= now && p.end > now;
          const past = p.end <= now;
          const archive = past && (p.hasArchive ?? channel.hasArchive);
          return (
            <button
              key={`${p.start}-${p.title}`}
              className={cn(
                "absolute inset-y-1.5 overflow-hidden rounded-xl px-2.5 text-left transition-colors",
                live ? "bg-accent/20 ring-1 ring-accent/50 hover:bg-accent/30" : past ? "bg-ink/[0.04] text-ink-muted hover:bg-ink/10" : "bg-ink/[0.07] hover:bg-ink/[0.12]",
              )}
              style={{ left: left + 1.5, width }}
              onClick={() => onSelect(p)}
              title={p.title}
            >
              <span className="flex items-center gap-1 truncate text-[13px] font-semibold">
                {archive && <History size={12} className="shrink-0 text-accent" />}
                {reminders.some((r) => r.id === reminderId(channel.uid, p.start)) && <BellRing size={12} className="shrink-0 text-warning" />}
                <span className="truncate">{p.title}</span>
              </span>
              <span className="block truncate text-[11px] tabular-nums text-ink-faint">
                {formatTime(p.start)} – {formatTime(p.end)}
              </span>
              {live && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent/30">
                  <span className="block h-full bg-accent" style={{ width: `${((now - p.start) / (p.end - p.start)) * 100}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

function ProgrammeSheet({ selection, now, onClose, onWatchLive, onCatchup }: { selection: Selection; now: number; onClose: () => void; onWatchLive: () => void; onCatchup: () => void }) {
  const { channel, programme: p } = selection;
  const live = p.start <= now && p.end > now;
  const past = p.end <= now;
  const withinArchive = !channel.archiveDays || now - p.start < channel.archiveDays * 86400_000;
  const canCatchup = (p.hasArchive ?? channel.hasArchive) && (past || live) && withinArchive;
  const { reminders, add, remove } = useReminders();
  const reminded = reminders.some((r) => r.id === reminderId(channel.uid, p.start));
  const future = p.start > now;
  return (
    <div className="fixed inset-0 z-[60] grid items-end bg-black/30 backdrop-blur-sm md:place-items-center" onClick={onClose}>
      <div className="glass-strong m-3 w-full max-w-lg rounded-glass-xl p-5 animate-fade-up md:m-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <Artwork src={channel.artwork.logo} title={channel.title} variant="logo" fit="contain" className="h-12 w-20 shrink-0 rounded-xl bg-white/80 dark:bg-white/10" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{channel.title}</p>
            <h2 className="text-lg font-bold leading-tight">{p.title}</h2>
            <p className="mt-0.5 text-sm tabular-nums text-ink-muted">
              {new Date(p.start).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · {formatTime(p.start)} – {formatTime(p.end)}
              {live && <span className="ml-2 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-white">LIVE</span>}
            </p>
          </div>
          <button aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/10" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {p.description && <p className="mt-3 line-clamp-6 text-sm leading-relaxed text-ink-muted">{p.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {live && (
            <button className="btn-primary" onClick={onWatchLive}>
              <Play size={16} fill="currentColor" /> Watch live
            </button>
          )}
          {canCatchup && (
            <button className={live ? "btn-glass" : "btn-primary"} onClick={onCatchup}>
              <History size={16} /> {live ? "Watch from start" : "Play catch-up"}
            </button>
          )}
          {future && (
            <button
              className={reminded ? "btn-glass text-accent" : "btn-primary"}
              onClick={() => (reminded ? remove(reminderId(channel.uid, p.start)) : add({ channel, title: p.title, start: p.start, end: p.end }))}
            >
              {reminded ? <BellRing size={16} /> : <Bell size={16} />} {reminded ? "Reminder set" : "Remind me"}
            </button>
          )}
          {past && !canCatchup && <p className="text-sm text-ink-faint">Catch-up isn't available for this programme.</p>}
          {!live && (
            <button className="btn-glass" onClick={onWatchLive}>
              Tune to channel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
