import { lazy, Suspense } from "react";
import { usePlayer } from "@/store/player";
import { useSettings } from "@/store/settings";

const VeloxPlayer = lazy(() => import("@/components/player/VeloxPlayer").then((m) => ({ default: m.VeloxPlayer })));

export function PlayerHost() {
  const { request, error, loading, stop, next, queue } = usePlayer();
  const autoNext = useSettings((s) => s.autoplayNextEpisode);

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}
      {error && !request && (
        <div className="glass-strong fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm animate-fade-up md:bottom-8">
          {error}
          <button className="ml-3 text-accent" onClick={stop}>
            Dismiss
          </button>
        </div>
      )}
      {request && (
        <Suspense fallback={null}>
          <VeloxPlayer request={request} onClose={stop} onEnded={autoNext && queue.length ? next : undefined} />
        </Suspense>
      )}
    </>
  );
}
