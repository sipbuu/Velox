import { lazy, Suspense } from "react";
import { usePlayer } from "@/store/player";

const VeloxPlayer = lazy(() => import("@/components/player/VeloxPlayer").then((m) => ({ default: m.VeloxPlayer })));

export function PlayerHost() {
  const { request, error, loading } = usePlayer();

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-[55] grid place-items-center bg-black/40 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}
      {error && (
        <div className="glass-strong fixed bottom-24 left-1/2 z-[56] -translate-x-1/2 rounded-full px-4 py-2 text-sm animate-fade-up md:bottom-8">
          {error}
          <button className="ml-3 text-accent" onClick={() => usePlayer.setState({ error: null })}>
            Dismiss
          </button>
        </div>
      )}
      {request && (
        <Suspense fallback={null}>
          <VeloxPlayer key="player" />
        </Suspense>
      )}
    </>
  );
}
