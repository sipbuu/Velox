import { useCallback, useEffect, useRef, useState } from "react";
import {
  AirplayIcon,
  ChevronDown,
  Download,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { PlaybackRequest } from "@/types/media";
import { useSettings } from "@/store/settings";
import { useLibrary } from "@/store/library";
import { useDownloads } from "@/store/downloads";
import { useResolvedStream } from "@/hooks/useResolvedStream";
import { useEpg } from "@/hooks/useEpgNow";
import { subtitleBlobUrl } from "@/lib/subtitles";
import { formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { isTauri } from "@/lib/platform";
import { attachEngine, type EngineHandle } from "./engines";
import { TrackMenu } from "./TrackMenu";
import { CaptionOverlay } from "./CaptionOverlay";

interface Props {
  request: PlaybackRequest;
  onClose: () => void;
  onEnded?: () => void;
}

type WebkitVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitEnterFullscreen?: () => void;
};

export function VeloxPlayer({ request, onClose, onEnded }: Props) {
  const videoRef = useRef<WebkitVideo>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const hideTimer = useRef<number>(undefined);

  const settings = useSettings();
  const markWatched = useLibrary((s) => s.markWatched);
  const enqueueDownload = useDownloads((s) => s.enqueue);
  const { stream, error: resolveError } = useResolvedStream(request);
  const { current: nowOnAir } = useEpg(request.isLive ? request.item : undefined);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [tracksVersion, setTracksVersion] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const bumpTracks = useCallback(() => setTracksVersion((v) => v + 1), []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    let disposed = false;
    setError(null);
    setBuffering(true);

    attachEngine(video, {
      url: stream.url,
      container: stream.container,
      isLive: stream.isLive,
      preferNativeHls: settings.preferNativeHls,
      memoryBufferSec: stream.timeshift === "memory" || stream.timeshift === "software" ? settings.timeshiftWindowSec : 0,
      onFatalError: (m) => setError(m),
      onTracksChanged: bumpTracks,
    })
      .then((engine) => {
        if (disposed) return engine.destroy();
        engineRef.current = engine;
        if (request.startAt) video.currentTime = request.startAt;
        video.play().catch(() => setPlaying(false));
      })
      .catch((e: Error) => setError(e.message));

    return () => {
      disposed = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [stream, settings.preferNativeHls, settings.timeshiftWindowSec, request.startAt, bumpTracks]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !request.subtitles?.length) return;
    const created: { el: HTMLTrackElement; url: string }[] = [];
    let cancelled = false;
    (async () => {
      for (const sub of request.subtitles!) {
        try {
          const url = await subtitleBlobUrl(sub);
          if (cancelled) return URL.revokeObjectURL(url);
          const el = document.createElement("track");
          el.kind = "subtitles";
          el.label = sub.label;
          el.srclang = sub.language ?? "";
          el.src = url;
          const wantDefault =
            settings.subtitlesEnabledByDefault &&
            (sub.isDefault || sub.language?.startsWith(settings.preferredSubtitleLang));
          if (wantDefault && !created.some((c) => c.el.default)) el.default = true;
          video.appendChild(el);
          created.push({ el, url });
        } catch (e) {
          console.warn("[velox] subtitle failed", sub.label, e);
        }
      }
      bumpTracks();
    })();
    return () => {
      cancelled = true;
      created.forEach(({ el, url }) => {
        el.remove();
        URL.revokeObjectURL(url);
      });
    };
  }, [request.subtitles, settings.subtitlesEnabledByDefault, settings.preferredSubtitleLang, bumpTracks]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const c = settings.captionStyle;
    el.style.setProperty("--v-cue-scale", String(c.size));
    el.style.setProperty("--v-cue-color", c.color);
    el.style.setProperty("--v-cue-bg", c.background);
    el.style.setProperty(
      "--v-cue-font",
      c.font === "serif" ? "Georgia, serif" : c.font === "mono" ? "ui-monospace, monospace" : "inherit",
    );
  }, [settings.captionStyle]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateRange = () => {
      const s = video.seekable;
      if (stream?.isLive && s.length) setRange({ start: s.start(0), end: s.end(s.length - 1) });
      else setRange({ start: 0, end: Number.isFinite(video.duration) ? video.duration : 0 });
    };
    const on: Record<string, () => void> = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      timeupdate: () => {
        setTime(video.currentTime);
        updateRange();
      },
      durationchange: updateRange,
      progress: updateRange,
      waiting: () => setBuffering(true),
      playing: () => setBuffering(false),
      canplay: () => setBuffering(false),
      volumechange: () => {
        setMuted(video.muted);
        setVolume(video.volume);
      },
      ended: () => onEnded?.(),
      error: () => setError(video.error?.message || "This format can't be played on this device."),
    };
    Object.entries(on).forEach(([k, fn]) => video.addEventListener(k, fn));
    video.textTracks.addEventListener?.("addtrack", bumpTracks);
    return () => {
      Object.entries(on).forEach(([k, fn]) => video.removeEventListener(k, fn));
      video.textTracks.removeEventListener?.("addtrack", bumpTracks);
    };
  }, [stream, onEnded, bumpTracks]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const item = request.item;
    if (!item) return;
    const save = () => {
      const v = videoRef.current;
      if (v) markWatched(item, stream?.isLive ? undefined : v.currentTime, Number.isFinite(v.duration) ? v.duration : undefined);
    };
    const t = window.setInterval(save, 15_000);
    return () => {
      clearInterval(t);
      save();
    };
  }, [request.item, stream?.isLive, markWatched]);

  const poke = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 3000);
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
    poke();
  }, [poke]);

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.min(Math.max(v.currentTime + delta, range.start), range.end || v.currentTime + delta);
      poke();
    },
    [range, poke],
  );

  const toggleFullscreen = useCallback(async () => {
    const v = videoRef.current;
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (shellRef.current?.requestFullscreen) await shellRef.current.requestFullscreen();
    else v?.webkitEnterFullscreen?.();
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await v.requestPictureInPicture?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          seekBy(-10);
          break;
        case "ArrowRight":
          seekBy(10);
          break;
        case "ArrowUp":
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case "ArrowDown":
          v.volume = Math.max(0, v.volume - 0.1);
          break;
        case "m":
          v.muted = !v.muted;
          break;
        case "f":
          void toggleFullscreen();
          break;
        case "c": {
          const tracks = Array.from(v.textTracks).filter((t) => t.kind === "subtitles" || t.kind === "captions");
          const showing = tracks.findIndex((t) => t.mode === "showing");
          const next = showing + 1 >= tracks.length ? -1 : showing + 1;
          tracks.forEach((t, i) => (t.mode = i === next ? "showing" : "disabled"));
          flash(next < 0 ? "Subtitles off" : `Subtitles: ${tracks[next].label || tracks[next].language}`);
          break;
        }
        case "Escape":
          if (!document.fullscreenElement) onClose();
          break;
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, toggleFullscreen, onClose, poke, flash]);

  const behindLive = stream?.isLive ? Math.max(0, range.end - time) : 0;
  const atLive = behindLive < 4;
  const span = Math.max(0.001, range.end - range.start);
  const progress = ((time - range.start) / span) * 100;
  const shownError = error ?? resolveError;
  const canDownload = isTauri() && !request.isLive && request.container !== "hls";

  return (
    <div
      ref={shellRef}
      className={cn("fixed inset-0 z-50 bg-black text-white select-none", !controlsVisible && "cursor-none")}
      onMouseMove={poke}
      onTouchStart={poke}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain"
        playsInline
        autoPlay
        crossOrigin="anonymous"
        x-webkit-airplay="allow"
        poster={request.artwork?.backdrop}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {buffering && !shownError && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}

      {shownError && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="glass-dark max-w-md rounded-glass-lg p-6 text-center">
            <p className="text-lg font-semibold">Playback failed</p>
            <p className="mt-2 text-sm text-white/70">{shownError}</p>
            <button className="btn mt-4 bg-white/15 hover:bg-white/25" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}

      <CaptionOverlay video={videoRef.current} controlsRef={controlsRef} controlsVisible={controlsVisible} version={tracksVersion} />

      {toast && (
        <div className="glass-dark absolute left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] -translate-x-1/2 rounded-full px-4 py-2 text-sm animate-fade-up">
          {toast}
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <button aria-label="Close player" className="glass-dark grid h-10 w-10 place-items-center rounded-full" onClick={onClose}>
            <ChevronDown size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{request.title}</p>
            {(nowOnAir || request.subtitle) && (
              <p className="truncate text-xs text-white/60">
                {nowOnAir ? `${formatTime(nowOnAir.start)}–${formatTime(nowOnAir.end)} · ${nowOnAir.title}` : request.subtitle}
              </p>
            )}
          </div>
          {stream?.timeshift === "software" && (
            <span className="glass-dark rounded-full px-2.5 py-1 text-[11px] font-medium text-white/80">Buffer cache</span>
          )}
        </div>

        <div className="flex items-center justify-center gap-10">
          <button aria-label="Back 10 seconds" className="glass-dark grid h-14 w-14 place-items-center rounded-full active:scale-90" onClick={() => seekBy(-10)}>
            <RotateCcw size={24} />
          </button>
          <button aria-label={playing ? "Pause" : "Play"} className="glass-dark grid h-20 w-20 place-items-center rounded-full active:scale-90" onClick={togglePlay}>
            {playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" className="ml-1" />}
          </button>
          <button aria-label="Forward 10 seconds" className="glass-dark grid h-14 w-14 place-items-center rounded-full active:scale-90 disabled:opacity-40" disabled={stream?.isLive && atLive} onClick={() => seekBy(10)}>
            <RotateCw size={24} />
          </button>
        </div>

        <div ref={controlsRef} className="bg-gradient-to-t from-black/80 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-12">
          <div className="glass-dark mx-auto max-w-5xl rounded-glass-lg px-4 py-3">
            <div className="flex items-center gap-3 text-xs tabular-nums text-white/80">
              <span className="w-14">{stream?.isLive ? (atLive ? "" : `-${formatDuration(behindLive)}`) : formatDuration(time)}</span>
              <input
                type="range"
                aria-label="Seek"
                className="range flex-1"
                min={0}
                max={100}
                step={0.1}
                value={Number.isFinite(progress) ? progress : 0}
                style={{ background: `linear-gradient(90deg, #fff ${progress}%, rgb(255 255 255 / 0.25) ${progress}%)` }}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (v) v.currentTime = range.start + (Number(e.target.value) / 100) * span;
                }}
              />
              {stream?.isLive ? (
                <button
                  className={cn(
                    "flex w-14 items-center justify-end gap-1.5 font-semibold",
                    atLive ? "text-white" : "text-white/60 hover:text-white",
                  )}
                  onClick={() => engineRef.current?.goLive()}
                >
                  <span className={cn("h-2 w-2 rounded-full", atLive ? "bg-live animate-live-pulse" : "bg-white/40")} />
                  LIVE
                </button>
              ) : (
                <span className="w-14 text-right">{formatDuration(range.end)}</span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-1">
              <button aria-label={muted ? "Unmute" : "Mute"} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={() => videoRef.current && (videoRef.current.muted = !muted)}>
                {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                aria-label="Volume"
                className="range hidden w-24 sm:block"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.volume = Number(e.target.value);
                  v.muted = v.volume === 0;
                }}
              />
              <div className="flex-1" />
              {canDownload && (
                <button
                  aria-label="Download for offline"
                  className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
                  onClick={() =>
                    enqueueDownload(request).then(
                      () => flash("Added to downloads"),
                      (e: Error) => flash(e.message),
                    )
                  }
                >
                  <Download size={18} />
                </button>
              )}
              <TrackMenu video={videoRef.current} engine={engineRef.current} version={tracksVersion} onChanged={bumpTracks} />
              {videoRef.current?.webkitShowPlaybackTargetPicker && (
                <button aria-label="AirPlay" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={() => videoRef.current?.webkitShowPlaybackTargetPicker?.()}>
                  <AirplayIcon size={18} />
                </button>
              )}
              {document.pictureInPictureEnabled && (
                <button aria-label="Picture in picture" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={togglePip}>
                  <PictureInPicture2 size={18} />
                </button>
              )}
              <button aria-label="Fullscreen" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={toggleFullscreen}>
                {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
