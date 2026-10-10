import { useEffect } from "react";
import { Download, Pause, Play, Trash2, X } from "lucide-react";
import { useDownloads, type DownloadTask } from "@/store/downloads";
import { usePlayer } from "@/store/player";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/media/Artwork";
import { toPlayableFileUrl } from "@/lib/ipc";
import { detectContainer } from "@/lib/container";
import { formatBytes } from "@/lib/format";
import { isTauri } from "@/lib/platform";

export function DownloadsPage() {
  const { tasks, init, pause, resume, cancel, remove } = useDownloads();
  const playRequest = usePlayer((s) => s.playRequest);

  useEffect(() => {
    void init();
  }, [init]);

  const list = Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt);

  const playOffline = async (t: DownloadTask) =>
    playRequest({
      url: await toPlayableFileUrl(t.filePath),
      container: detectContainer(t.filePath),
      isLive: false,
      title: t.title,
      artwork: { poster: t.posterUrl ?? undefined },
    });

  if (!isTauri()) {
    return <EmptyState icon={<Download />} title="Downloads need the app" body="Offline downloads are available in the iOS, macOS, Windows and Linux apps." />;
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Downloads" subtitle="Watch offline, saved to this device" />
      {list.length === 0 && <EmptyState icon={<Download />} title="No downloads" body="Open a movie or episode and tap the download button in the player." />}
      <div className="grid gap-3">
        {list.map((t) => {
          const pct = t.bytesTotal ? t.bytesDone / t.bytesTotal : 0;
          return (
            <GlassPanel key={t.id} className="flex items-center gap-4 p-3">
              <Artwork src={t.posterUrl ?? undefined} title={t.title} className="aspect-[2/3] w-12 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{t.title}</p>
                <p className="text-xs text-ink-muted">
                  {t.state === "downloading"
                    ? `${formatBytes(t.bytesDone)} of ${t.bytesTotal ? formatBytes(t.bytesTotal) : "?"} · ${formatBytes(t.speedBps)}/s`
                    : t.state === "failed"
                      ? (t.error ?? "Failed")
                      : t.state === "completed"
                        ? formatBytes(t.bytesDone)
                        : t.state}
                </p>
                {t.state !== "completed" && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/10">
                    <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct * 100}%` }} />
                  </div>
                )}
              </div>
              {t.state === "completed" && (
                <button aria-label="Play" className="btn-primary !px-3" onClick={() => playOffline(t)}>
                  <Play size={16} fill="currentColor" />
                </button>
              )}
              {t.state === "downloading" && (
                <button aria-label="Pause" className="btn-glass !px-2.5" onClick={() => pause(t.id)}>
                  <Pause size={16} />
                </button>
              )}
              {(t.state === "paused" || t.state === "failed" || t.state === "queued") && (
                <button aria-label="Resume" className="btn-glass !px-2.5" onClick={() => resume(t.id)}>
                  <Play size={16} />
                </button>
              )}
              {t.state !== "completed" && t.state !== "cancelled" && (
                <button aria-label="Cancel" className="btn-glass !px-2.5" onClick={() => cancel(t.id)}>
                  <X size={16} />
                </button>
              )}
              <button aria-label="Delete" className="btn-glass !px-2.5 text-live" onClick={() => remove(t.id, true)}>
                <Trash2 size={16} />
              </button>
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}
