import { useEffect, useState, type RefObject } from "react";

interface Props {
  video: HTMLVideoElement | null;
  controlsRef: RefObject<HTMLDivElement | null>;
  controlsVisible: boolean;
  version: number;
}

const activeTrack = (v: HTMLVideoElement) =>
  Array.from(v.textTracks).find((t) => (t.kind === "subtitles" || t.kind === "captions") && t.mode === "showing");

export function CaptionOverlay({ video, controlsRef, controlsVisible, version }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [bottom, setBottom] = useState(24);

  useEffect(() => {
    if (!video) return;
    let track: TextTrack | undefined;
    const read = () => {
      const cues = track?.activeCues ? Array.from(track.activeCues) : [];
      setLines(cues.map((c) => (c as VTTCue).text.replace(/<[^>]+>/g, "")));
    };
    const attach = () => {
      track?.removeEventListener("cuechange", read);
      track = activeTrack(video);
      track?.addEventListener("cuechange", read);
      read();
    };
    attach();
    video.textTracks.addEventListener("change", attach);
    video.textTracks.addEventListener("addtrack", attach);
    return () => {
      track?.removeEventListener("cuechange", read);
      video.textTracks.removeEventListener("change", attach);
      video.textTracks.removeEventListener("addtrack", attach);
    };
  }, [video, version]);

  useEffect(() => {
    if (!video) return;
    const place = () => {
      const h = video.clientHeight;
      const w = video.clientWidth;
      const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 9 / 16;
      const frameGap = Math.max(0, (h - Math.min(h, w * ratio)) / 2);
      const controlsH = controlsVisible ? (controlsRef.current?.offsetHeight ?? 0) : 0;
      setBottom(Math.max(frameGap + 16, controlsH + 12, 24));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(video);
    video.addEventListener("loadedmetadata", place);
    return () => {
      ro.disconnect();
      video.removeEventListener("loadedmetadata", place);
    };
  }, [video, controlsVisible, controlsRef]);

  if (!lines.length) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-1 px-6 text-center transition-[bottom] duration-300 ease-spring"
      style={{ bottom }}
      aria-live="polite"
    >
      {lines.map((l, i) => (
        <span key={i} className="velox-cue whitespace-pre-line rounded-lg px-3 py-1 leading-snug">
          {l}
        </span>
      ))}
    </div>
  );
}
