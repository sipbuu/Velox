import { useCallback, useEffect, useRef, useState } from "react";
import {
  AirplayIcon,
  ChevronDown,
  Download,
  Gauge,
  History,
  ListVideo,
  Maximize,
  Maximize2,
  Minimize,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useSettings } from "@/store/settings";
import { useLibrary } from "@/store/library";
import { useDownloads } from "@/store/downloads";
import { usePlayer } from "@/store/player";
import { useResolvedStream } from "@/hooks/useResolvedStream";
import { useEpg } from "@/hooks/useEpgNow";
import { subtitleBlobUrl } from "@/lib/subtitles";
import { formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { isTauri } from "@/lib/platform";
import { attachEngine, type EngineHandle } from "./engines";
import { TrackMenu } from "./TrackMenu";
import { CaptionOverlay } from "./CaptionOverlay";
import { MenuRow, PopMenu } from "./PopMenu";
import { ChannelDrawer } from "./ChannelDrawer";
import { UpNext } from "./UpNext";

type WebkitVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitEnterFullscreen?: () => void;
};

interface Toast {
  msg: string;
  action?: { label: string; run: () => void };
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP_OPTIONS = [15, 30, 45, 60, 90];

export function VeloxPlayer() {
  const request = usePlayer((s) => s.request)!;
  const { mode, minimize, expand, stop, queue, next, channelList, zap, resumedFrom, catchup, sleep, setSleep, play } = usePlayer();
  const mini = mode === "mini";

  const videoRef = useRef<WebkitVideo>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const hideTimer = useRef<number>(undefined);
  const toastTimer = useRef<number>(undefined);

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
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [tracksVersion, setTracksVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [upNext, setUpNext] = useState(false);

  const bumpTracks = useCallback(() => setTracksVersion((v) => v + 1), []);

  const flash = useCallback((t: Toast | string, ms = 3000) => {
    setToast(typeof t === "string" ? { msg: t } : t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    let disposed = false;
    setError(null);
    setBuffering(true);
    setUpNext(false);

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
        video.playbackRate = stream.isLive ? 1 : speedRef.current;
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
    if (resumedFrom)
      flash(
        {
          msg: `Resumed at ${formatDuration(resumedFrom)}`,
          action: {
            label: "Start over",
            run: () => {
              const v = videoRef.current;
              if (v) v.currentTime = 0;
              setToast(null);
            },
          },
        },
        6000,
      );
  }, [resumedFrom, request, flash]);

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
          const wantDefault = settings.subtitlesEnabledByDefault && (sub.isDefault || sub.language?.startsWith(settings.preferredSubtitleLang));
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
    el.style.setProperty("--v-cue-scale", String(mini ? c.size * 0.6 : c.size));
    el.style.setProperty("--v-cue-color", c.color);
    el.style.setProperty("--v-cue-bg", c.background);
    el.style.setProperty("--v-cue-font", c.font === "serif" ? "Georgia, serif" : c.font === "mono" ? "ui-monospace, monospace" : "inherit");
  }, [settings.captionStyle, mini]);

  const onEnded = useCallback(() => {
    const v = videoRef.current;
    if (request.item && v && Number.isFinite(v.duration)) markWatched(request.item, v.duration, v.duration);
    if (sleep && "endOfItem" in sleep) {
      setSleep(null);
      flash("Sleep timer: playback stopped");
      return;
    }
    if (queue.length && settings.autoplayNextEpisode) setUpNext(true);
  }, [request.item, markWatched, sleep, setSleep, flash, queue.length, settings.autoplayNextEpisode]);

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
      ratechange: () => setSpeed(video.playbackRate),
      ended: onEnded,
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
    if (!sleep || !("endsAt" in sleep)) return;
    const t = window.setInterval(() => {
      if (Date.now() >= sleep.endsAt) {
        videoRef.current?.pause();
        setSleep(null);
        flash("Sleep timer: playback paused", 5000);
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [sleep, setSleep, flash]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const item = request.item;
    if (!item || catchup) return;
    const save = () => {
      const v = videoRef.current;
      if (v && !v.ended) markWatched(item, stream?.isLive ? undefined : v.currentTime, Number.isFinite(v.duration) ? v.duration : undefined);
    };
    const t = window.setInterval(save, 15_000);
    return () => {
      clearInterval(t);
      save();
    };
  }, [request.item, stream?.isLive, catchup, markWatched]);

  const poke = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 3000);
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

  const goMini = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    setDrawer(false);
    minimize();
  }, [minimize]);

  const setRate = (r: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = r;
    setSpeed(r);
  };

  const isLive = !!stream?.isLive;
  const canZap = isLive && channelList.length > 1;

  useEffect(() => {
    if (mini) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
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
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          break;
        case "PageUp":
        case "ChannelUp":
          if (canZap) void zap(-1);
          break;
        case "PageDown":
        case "ChannelDown":
          if (canZap) void zap(1);
          break;
        case "m":
          v.muted = !v.muted;
          break;
        case "f":
          void toggleFullscreen();
          break;
        case ">":
          if (!isLive) setRate(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(v.playbackRate) + 1)] ?? 1);
          break;
        case "<":
          if (!isLive) setRate(SPEEDS[Math.max(0, SPEEDS.indexOf(v.playbackRate) - 1)] ?? 1);
          break;
        case "c": {
          const tracks = Array.from(v.textTracks).filter((t) => t.kind === "subtitles" || t.kind === "captions");
          const showing = tracks.findIndex((t) => t.mode === "showing");
          const nextIdx = showing + 1 >= tracks.length ? -1 : showing + 1;
          tracks.forEach((t, i) => (t.mode = i === nextIdx ? "showing" : "disabled"));
          flash(nextIdx < 0 ? "Subtitles off" : `Subtitles: ${tracks[nextIdx].label || tracks[nextIdx].language}`);
          bumpTracks();
          break;
        }
        case "Escape":
          if (drawer) setDrawer(false);
          else if (!document.fullscreenElement) void goMini();
          break;
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mini, togglePlay, seekBy, toggleFullscreen, goMini, poke, flash, bumpTracks, canZap, zap, isLive, drawer]);

  const behindLive = isLive ? Math.max(0, range.end - time) : 0;
  const atLive = behindLive < 4;
  const span = Math.max(0.001, range.end - range.start);
  const progress = ((time - range.start) / span) * 100;
  const shownError = error ?? resolveError;
  const canDownload = isTauri() && !request.isLive && request.container !== "hls" && !catchup;
  const channel = request.item?.kind === "live" ? request.item : undefined;
  const canStartOver = !!(channel?.hasArchive && nowOnAir && !catchup);
  const sleepLabel = sleep ? ("endOfItem" in sleep ? "End" : `${Math.max(1, Math.round((sleep.endsAt - Date.now()) / 60000))}m`) : undefined;

  return (
    <div
      ref={shellRef}
      className={cn(
        "z-50 select-none overflow-hidden bg-black text-white",
        mini
          ? "group fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-3 aspect-video w-[min(22rem,calc(100vw-1.5rem))] rounded-glass-lg shadow-glass-lift ring-1 ring-white/15 animate-fade-up md:bottom-6 md:right-6"
          : "fixed inset-0",
        !mini && !controlsVisible && "cursor-none",
      )}
      onMouseMove={mini ? undefined : poke}
      onTouchStart={mini ? undefined : poke}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain"
        playsInline
        autoPlay
        crossOrigin="anonymous"
        x-webkit-airplay="allow"
        poster={request.artwork?.backdrop}
        onClick={mini ? expand : togglePlay}
        onDoubleClick={mini ? undefined : toggleFullscreen}
      />

      {buffering && !shownError && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className={cn("animate-spin rounded-full border-2 border-white/20 border-t-white", mini ? "h-7 w-7" : "h-12 w-12")} />
        </div>
      )}

      {shownError && (
        <div className="absolute inset-0 grid place-items-center p-4">
          <div className={cn("glass-dark rounded-glass-lg text-center", mini ? "p-3" : "max-w-md p-6")}>
            <p className={cn("font-semibold", mini ? "text-sm" : "text-lg")}>Playback failed</p>
            {!mini && <p className="mt-2 text-sm text-white/70">{shownError}</p>}
            <button className="btn mt-3 bg-white/15 hover:bg-white/25" onClick={stop}>
              Close
            </button>
          </div>
        </div>
      )}

      {!mini && <CaptionOverlay video={videoRef.current} controlsRef={controlsRef} controlsVisible={controlsVisible} version={tracksVersion} />}

      {mini ? (
        <MiniControls title={request.title} playing={playing} progress={isLive ? 100 : progress} live={isLive} onToggle={togglePlay} onExpand={expand} onClose={stop} />
      ) : (
        <>
          {toast && (
            <div className="glass-dark absolute left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full py-2 pl-4 pr-2 text-sm animate-fade-up">
              {toast.msg}
              {toast.action ? (
                <button className="rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25" onClick={toast.action.run}>
                  {toast.action.label}
                </button>
              ) : (
                <span className="w-2" />
              )}
            </div>
          )}

          <div className={cn("absolute inset-0 flex flex-col justify-between transition-opacity duration-300", controlsVisible ? "opacity-100" : "pointer-events-none opacity-0")}>
            <div className="flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
              <button aria-label="Minimize player" className="glass-dark grid h-10 w-10 place-items-center rounded-full" onClick={goMini}>
                <ChevronDown size={22} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{request.title}</p>
                {(nowOnAir || request.subtitle || catchup) && (
                  <p className="truncate text-xs text-white/60">
                    {catchup
                      ? `Catch-up · ${formatTime(catchup.start)}`
                      : nowOnAir
                        ? `${formatTime(nowOnAir.start)}–${formatTime(nowOnAir.end)} · ${nowOnAir.title}`
                        : request.subtitle}
                  </p>
                )}
              </div>
              {stream?.timeshift === "software" && <span className="glass-dark hidden rounded-full px-2.5 py-1 text-[11px] font-medium text-white/80 sm:block">Buffer cache</span>}
              <button aria-label="Close player" className="glass-dark grid h-10 w-10 place-items-center rounded-full" onClick={stop}>
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center justify-center gap-6 sm:gap-10">
              {canZap && (
                <button aria-label="Previous channel" className="glass-dark grid h-12 w-12 place-items-center rounded-full active:scale-90" onClick={() => zap(-1)}>
                  <SkipBack size={20} fill="currentColor" />
                </button>
              )}
              <button aria-label="Back 10 seconds" className="glass-dark grid h-14 w-14 place-items-center rounded-full active:scale-90" onClick={() => seekBy(-10)}>
                <RotateCcw size={24} />
              </button>
              <button aria-label={playing ? "Pause" : "Play"} className="glass-dark grid h-20 w-20 place-items-center rounded-full active:scale-90" onClick={togglePlay}>
                {playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" className="ml-1" />}
              </button>
              <button aria-label="Forward 10 seconds" className="glass-dark grid h-14 w-14 place-items-center rounded-full active:scale-90 disabled:opacity-40" disabled={isLive && atLive} onClick={() => seekBy(10)}>
                <RotateCw size={24} />
              </button>
              {canZap && (
                <button aria-label="Next channel" className="glass-dark grid h-12 w-12 place-items-center rounded-full active:scale-90" onClick={() => zap(1)}>
                  <SkipForward size={20} fill="currentColor" />
                </button>
              )}
            </div>

            <div ref={controlsRef} className="bg-gradient-to-t from-black/80 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-12">
              <div className="glass-dark mx-auto max-w-5xl rounded-glass-lg px-4 py-3">
                <div className="flex items-center gap-3 text-xs tabular-nums text-white/80">
                  <span className="w-14">{isLive ? (atLive ? "" : `-${formatDuration(behindLive)}`) : formatDuration(time)}</span>
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
                  {isLive ? (
                    <button className={cn("flex w-14 items-center justify-end gap-1.5 font-semibold", atLive ? "text-white" : "text-white/60 hover:text-white")} onClick={() => engineRef.current?.goLive()}>
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
                  {canStartOver && (
                    <button
                      className="ml-1 hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium hover:bg-white/10 sm:flex"
                      onClick={() => channel && nowOnAir && play(channel, { catchupStart: nowOnAir.start, catchupDurationMin: Math.ceil((nowOnAir.end - nowOnAir.start) / 60000), channels: channelList })}
                    >
                      <History size={15} /> Start over
                    </button>
                  )}
                  <div className="flex-1" />
                  {canStartOver && (
                    <button
                      aria-label="Start programme over"
                      className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 sm:hidden"
                      onClick={() => channel && nowOnAir && play(channel, { catchupStart: nowOnAir.start, catchupDurationMin: Math.ceil((nowOnAir.end - nowOnAir.start) / 60000), channels: channelList })}
                    >
                      <History size={18} />
                    </button>
                  )}
                  {canDownload && (
                    <button
                      aria-label="Download for offline"
                      className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
                      onClick={() => enqueueDownload(request).then(() => flash("Added to downloads"), (e: Error) => flash(e.message))}
                    >
                      <Download size={18} />
                    </button>
                  )}
                  {!isLive && (
                    <PopMenu label="Playback speed" icon={<Gauge size={18} />} active={speed !== 1} badge={speed !== 1 ? `${speed}×` : undefined}>
                      {(close) =>
                        SPEEDS.map((r) => (
                          <MenuRow key={r} label={r === 1 ? "Normal" : `${r}×`} active={speed === r} onClick={() => (setRate(r), close())} />
                        ))
                      }
                    </PopMenu>
                  )}
                  <PopMenu label="Sleep timer" icon={<Moon size={18} />} active={!!sleep} badge={sleepLabel}>
                    {(close) => (
                      <>
                        <MenuRow label="Off" active={!sleep} onClick={() => (setSleep(null), close())} />
                        {SLEEP_OPTIONS.map((m) => (
                          <MenuRow key={m} label={`${m} minutes`} onClick={() => (setSleep({ endsAt: Date.now() + m * 60_000 }), flash(`Sleep timer: ${m} min`), close())} />
                        ))}
                        {!isLive && <MenuRow label={request.item?.kind === "episode" ? "End of episode" : "End of movie"} active={!!sleep && "endOfItem" in sleep} onClick={() => (setSleep({ endOfItem: true }), close())} />}
                      </>
                    )}
                  </PopMenu>
                  <TrackMenu video={videoRef.current} engine={engineRef.current} version={tracksVersion} onChanged={bumpTracks} />
                  {canZap && (
                    <button aria-label="Channel list" className={cn("grid h-9 w-9 place-items-center rounded-full hover:bg-white/10", drawer && "text-accent")} onClick={() => setDrawer((d) => !d)}>
                      <ListVideo size={18} />
                    </button>
                  )}
                  {videoRef.current?.webkitShowPlaybackTargetPicker && (
                    <button aria-label="AirPlay" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={() => videoRef.current?.webkitShowPlaybackTargetPicker?.()}>
                      <AirplayIcon size={18} />
                    </button>
                  )}
                  {document.pictureInPictureEnabled && (
                    <button aria-label="Picture in picture" className="hidden h-9 w-9 place-items-center rounded-full hover:bg-white/10 sm:grid" onClick={togglePip}>
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

          {drawer && canZap && (
            <ChannelDrawer
              channels={channelList}
              currentUid={request.item?.uid}
              onPick={(c) => void play(c, { channels: channelList })}
              onClose={() => setDrawer(false)}
            />
          )}

          {upNext && queue[0] && (
            <UpNext
              item={queue[0]}
              onPlay={() => {
                setUpNext(false);
                void next();
              }}
              onCancel={() => setUpNext(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

function MiniControls({ title, playing, progress, live, onToggle, onExpand, onClose }: { title: string; playing: boolean; progress: number; live: boolean; onToggle: () => void; onExpand: () => void; onClose: () => void }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100 [@media(hover:none)]:opacity-100" />
      <div className="absolute inset-x-0 top-0 flex items-center gap-1 p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button aria-label="Expand player" className="grid h-8 w-8 place-items-center rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60" onClick={onExpand}>
          <Maximize2 size={15} />
        </button>
        <p className="min-w-0 flex-1 truncate px-1 text-xs font-semibold drop-shadow">{title}</p>
        <button aria-label="Close player" className="grid h-8 w-8 place-items-center rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <button
        aria-label={playing ? "Pause" : "Play"}
        className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        onClick={onToggle}
      >
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
        <div className={cn("h-full", live ? "bg-live" : "bg-white")} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>
    </>
  );
}
