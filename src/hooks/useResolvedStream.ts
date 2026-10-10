import { useEffect, useState } from "react";
import type { PlaybackRequest, StreamContainer } from "@/types/media";
import { useSettings } from "@/store/settings";
import { canUseNativeRelay, isRemoteUrl, relayUrl, startTimeshift, stopTimeshift } from "@/lib/mediaServer";
import { needsRelayForContainer } from "@/components/player/engines";

export interface ResolvedStream {
  url: string;
  container: StreamContainer;
  isLive: boolean;
  timeshift: "none" | "native" | "memory" | "software";
}

export function useResolvedStream(req: PlaybackRequest | null) {
  const { softwareBufferCache, softwareBufferStorage, timeshiftWindowSec, routeStreamsThroughRelay } = useSettings();
  const [stream, setStream] = useState<ResolvedStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!req) {
      setStream(null);
      return;
    }
    let cancelled = false;
    let sessionId: string | undefined;
    setStream(null);
    setError(null);

    (async () => {
      const native = canUseNativeRelay();
      const remote = isRemoteUrl(req.url);
      const forceRelay = native && remote && req.isLive && needsRelayForContainer(req.container);

      if (native && remote && req.isLive && (softwareBufferCache || forceRelay)) {
        const s = await startTimeshift(req, softwareBufferCache ? timeshiftWindowSec : 12, softwareBufferStorage);
        sessionId = s.id;
        if (cancelled) return;
        setStream({ url: s.playlistUrl, container: "hls", isLive: true, timeshift: softwareBufferCache ? "software" : "native" });
        return;
      }

      const useRelay = native && remote && (routeStreamsThroughRelay || !!req.headers);
      const url = useRelay ? await relayUrl(req.url, req.headers) : req.url;
      if (cancelled) return;
      setStream({
        url,
        container: req.container,
        isLive: req.isLive,
        timeshift: !req.isLive ? "none" : softwareBufferCache ? "memory" : "native",
      });
    })().catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      if (sessionId) void stopTimeshift(sessionId);
    };
  }, [req, softwareBufferCache, softwareBufferStorage, timeshiftWindowSec, routeStreamsThroughRelay]);

  return { stream, error };
}
