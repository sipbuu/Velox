import { useEffect, useState } from "react";
import type { PlaybackRequest, StreamContainer } from "@/types/media";
import { useSettings } from "@/store/settings";
import { canUseNativeRelay, isRemoteUrl, relayUrl, startTimeshift, stopTimeshift } from "@/lib/mediaServer";
import { needsRelayForContainer } from "@/components/player/engines";
import { isAppleWebKit, isIOSLike } from "@/lib/platform";

export type EnginePreference = "auto" | "hlsjs";

export interface ResolvedStream {
  url: string;
  container: StreamContainer;
  isLive: boolean;
  timeshift: "none" | "native" | "memory" | "software";
  engine: EnginePreference;
  label: string;
}

export function useResolvedStream(req: PlaybackRequest | null) {
  const { softwareBufferCache, softwareBufferStorage, timeshiftWindowSec, routeStreamsThroughRelay } = useSettings();
  const [candidates, setCandidates] = useState<ResolvedStream[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!req) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    let sessionId: string | undefined;
    setCandidates([]);
    setError(null);

    (async () => {
      const native = canUseNativeRelay();
      const remote = isRemoteUrl(req.url);
      const out: ResolvedStream[] = [];
      const liveTimeshift = !req.isLive ? "none" : softwareBufferCache ? "memory" : "native";

      const forceRelay = native && remote && req.isLive && needsRelayForContainer(req.container);
      if (native && remote && req.isLive && (softwareBufferCache || forceRelay)) {
        try {
          const s = await startTimeshift(req, softwareBufferCache ? timeshiftWindowSec : 12, softwareBufferStorage);
          sessionId = s.id;
          const ts = softwareBufferCache ? "software" : "native";
          out.push({ url: s.playlistUrl, container: "hls", isLive: true, timeshift: ts, engine: "auto", label: "Buffered relay (native player)" });
          out.push({ url: s.playlistUrl, container: "hls", isLive: true, timeshift: ts, engine: "hlsjs", label: "Buffered relay (hls.js)" });
        } catch (e) {
          console.warn("[velox] timeshift relay failed", e);
        }
      }

      const urls: { url: string; via: string }[] = [];
      if (native && remote) {
        const relayed = await relayUrl(req.url, req.headers).catch(() => null);
        const relayFirst = routeStreamsThroughRelay || !!req.headers;
        if (relayed && relayFirst) urls.push({ url: relayed, via: "relay" });
        urls.push({ url: req.url, via: "direct" });
        if (relayed && !relayFirst) urls.push({ url: relayed, via: "relay" });
      } else {
        urls.push({ url: req.url, via: "direct" });
      }

      const isHls = req.container === "hls" || (req.container === "unknown" && /m3u8/i.test(req.url));
      const engines: EnginePreference[] = isHls ? ["auto", "hlsjs"] : ["auto"];
      const autoLabel = isIOSLike() || isAppleWebKit() ? "native player" : "default player";
      for (const engine of engines)
        for (const u of urls)
          out.push({
            url: u.url,
            container: req.container,
            isLive: req.isLive,
            timeshift: liveTimeshift,
            engine,
            label: `${u.via === "relay" ? "Relay" : "Direct"} (${engine === "hlsjs" ? "hls.js" : autoLabel})`,
          });

      if (!cancelled) setCandidates(out);
    })().catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      if (sessionId) void stopTimeshift(sessionId);
    };
  }, [req, softwareBufferCache, softwareBufferStorage, timeshiftWindowSec, routeStreamsThroughRelay]);

  return { candidates, error };
}
