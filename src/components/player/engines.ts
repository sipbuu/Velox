import type Hls from "hls.js";
import type { StreamContainer } from "@/types/media";
import { isAppleWebKit, isIOSLike } from "@/lib/platform";

export type EngineKind = "native" | "hls" | "mpegts";

export interface AudioTrackInfo {
  id: number;
  label: string;
  language?: string;
}

export interface EngineHandle {
  kind: EngineKind;
  audioTracks(): AudioTrackInfo[];
  currentAudioTrack(): number;
  setAudioTrack(id: number): void;
  goLive(): void;
  destroy(): void;
}

export interface EngineOptions {
  url: string;
  container: StreamContainer;
  isLive: boolean;
  preferNativeHls: boolean;
  memoryBufferSec: number;
  onFatalError: (message: string) => void;
  onTracksChanged: () => void;
}

const nativeCanPlayHls = (v: HTMLVideoElement) => v.canPlayType("application/vnd.apple.mpegurl") !== "";

function nativeHandle(video: HTMLVideoElement, url: string): EngineHandle {
  video.src = url;
  const audio = () => {
    const list = (video as HTMLVideoElement & { audioTracks?: ArrayLike<{ label: string; language: string; enabled: boolean }> }).audioTracks;
    return list ? Array.from(list) : [];
  };
  return {
    kind: "native",
    audioTracks: () => audio().map((t, id) => ({ id, label: t.label || t.language || `Track ${id + 1}`, language: t.language })),
    currentAudioTrack: () => audio().findIndex((t) => t.enabled),
    setAudioTrack: (id) => audio().forEach((t, i) => (t.enabled = i === id)),
    goLive: () => {
      const r = video.seekable;
      if (r.length) video.currentTime = r.end(r.length - 1) - 1;
    },
    destroy: () => {
      video.removeAttribute("src");
      video.load();
    },
  };
}

async function hlsHandle(video: HTMLVideoElement, opts: EngineOptions): Promise<EngineHandle> {
  const { default: HlsCtor } = await import("hls.js");
  const live = opts.isLive;
  const hls: Hls = new HlsCtor({
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: live ? Math.max(30, opts.memoryBufferSec) : 90,
    liveBackBufferLength: live ? Math.max(30, opts.memoryBufferSec) : undefined,
    maxBufferLength: 30,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: opts.memoryBufferSec > 0 ? Infinity : 10,
    renderTextTracksNatively: true,
    enableWebVTT: true,
    enableIMSC1: true,
    enableCEA708Captions: true,
  });
  let networkRetries = 0;
  hls.on(HlsCtor.Events.ERROR, (_e, data) => {
    if (!data.fatal) return;
    if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && networkRetries++ < 3) {
      hls.startLoad();
    } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
      hls.recoverMediaError();
    } else {
      opts.onFatalError(`Stream error: ${data.details}`);
    }
  });
  hls.on(HlsCtor.Events.FRAG_LOADED, () => (networkRetries = 0));
  hls.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, opts.onTracksChanged);
  hls.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, opts.onTracksChanged);
  hls.loadSource(opts.url);
  hls.attachMedia(video);
  return {
    kind: "hls",
    audioTracks: () => hls.audioTracks.map((t, id) => ({ id, label: t.name || t.lang || `Track ${id + 1}`, language: t.lang })),
    currentAudioTrack: () => hls.audioTrack,
    setAudioTrack: (id) => (hls.audioTrack = id),
    goLive: () => {
      if (hls.liveSyncPosition != null) video.currentTime = hls.liveSyncPosition;
    },
    destroy: () => hls.destroy(),
  };
}

async function mpegtsHandle(video: HTMLVideoElement, opts: EngineOptions): Promise<EngineHandle | null> {
  const mpegts = (await import("mpegts.js")).default;
  if (!mpegts.getFeatureList().mseLivePlayback) return null;
  const keepBack = Math.max(30, opts.memoryBufferSec);
  const player = mpegts.createPlayer(
    { type: "mpegts", isLive: opts.isLive, url: opts.url },
    {
      enableWorker: true,
      lazyLoad: false,
      liveBufferLatencyChasing: opts.memoryBufferSec === 0,
      autoCleanupSourceBuffer: true,
      autoCleanupMaxBackwardDuration: keepBack + 10,
      autoCleanupMinBackwardDuration: keepBack,
    },
  );
  player.on(mpegts.Events.ERROR, (type: string, detail: string) => opts.onFatalError(`${type}: ${detail}`));
  player.attachMediaElement(video);
  player.load();
  return {
    kind: "mpegts",
    audioTracks: () => [],
    currentAudioTrack: () => 0,
    setAudioTrack: () => {},
    goLive: () => {
      const b = video.buffered;
      if (b.length) video.currentTime = b.end(b.length - 1) - 0.5;
    },
    destroy: () => {
      player.pause();
      player.unload();
      player.detachMediaElement();
      player.destroy();
    },
  };
}

export async function attachEngine(video: HTMLVideoElement, opts: EngineOptions): Promise<EngineHandle> {
  const { container, url } = opts;

  if (container === "hls" || (container === "unknown" && /m3u8/i.test(url))) {
    const { default: HlsCtor } = await import("hls.js");
    const wantNative = nativeCanPlayHls(video) && (isIOSLike() || (opts.preferNativeHls && isAppleWebKit()));
    if (!wantNative && HlsCtor.isSupported()) return hlsHandle(video, opts);
    if (nativeCanPlayHls(video)) return nativeHandle(video, url);
    if (HlsCtor.isSupported()) return hlsHandle(video, opts);
    throw new Error("HLS playback is not supported on this device.");
  }

  if (container === "mpegts") {
    const h = await mpegtsHandle(video, opts);
    if (h) return h;
    throw new Error("MPEG-TS needs Media Source Extensions. Enable the software buffer or use the native app.");
  }

  return nativeHandle(video, url);
}

export function needsRelayForContainer(container: StreamContainer): boolean {
  if (container !== "mpegts") return false;
  const mse = typeof window !== "undefined" && ("MediaSource" in window || "ManagedMediaSource" in window);
  return !mse || isIOSLike();
}
