import { useEffect, useRef, useState } from "react";
import { Captions, Check, FileText } from "lucide-react";
import { subtitleFromFile } from "@/lib/subtitles";
import { cn } from "@/lib/cn";
import type { EngineHandle } from "./engines";

interface Props {
  video: HTMLVideoElement | null;
  engine: EngineHandle | null;
  version: number;
  onChanged: () => void;
}

export function TrackMenu({ video, engine, version, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  void version;
  const textTracks = video
    ? Array.from(video.textTracks).filter((t) => t.kind === "subtitles" || t.kind === "captions")
    : [];
  const activeText = textTracks.findIndex((t) => t.mode === "showing");
  const audio = engine?.audioTracks() ?? [];
  const activeAudio = engine?.currentAudioTrack() ?? -1;

  const selectText = (idx: number) => {
    textTracks.forEach((t, i) => (t.mode = i === idx ? "showing" : "disabled"));
    onChanged();
  };

  const loadFile = async (file?: File) => {
    if (!file || !video) return;
    const ref = await subtitleFromFile(file);
    if (!ref) return;
    const el = document.createElement("track");
    el.kind = "subtitles";
    el.label = ref.label;
    el.src = ref.url;
    video.appendChild(el);
    el.track.mode = "showing";
    textTracks.forEach((t) => (t.mode = "disabled"));
    onChanged();
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        aria-label="Subtitles and audio"
        className={cn("grid h-9 w-9 place-items-center rounded-full hover:bg-white/10", activeText >= 0 && "text-accent")}
        onClick={() => setOpen((o) => !o)}
      >
        <Captions size={18} />
      </button>
      {open && (
        <div className="glass-dark absolute bottom-12 right-0 w-64 rounded-glass p-2 text-sm animate-fade-up">
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-white/50">Subtitles</p>
          <Row label="Off" active={activeText < 0} onClick={() => selectText(-1)} />
          {textTracks.map((t, i) => (
            <Row key={`${t.label}-${i}`} label={t.label || t.language || `Track ${i + 1}`} hint={t.language} active={i === activeText} onClick={() => selectText(i)} />
          ))}
          <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-white/80 hover:bg-white/10" onClick={() => fileRef.current?.click()}>
            <FileText size={14} /> Load subtitle file…
          </button>
          <input ref={fileRef} type="file" accept=".srt,.vtt,.ass,.ssa" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
          {audio.length > 1 && (
            <>
              <p className="mt-2 border-t border-white/10 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">Audio</p>
              {audio.map((a) => (
                <Row key={a.id} label={a.label} hint={a.language} active={a.id === activeAudio} onClick={() => { engine?.setAudioTrack(a.id); onChanged(); }} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, hint, active, onClick }: { label: string; hint?: string; active: boolean; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10" onClick={onClick}>
      <Check size={14} className={active ? "opacity-100" : "opacity-0"} />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[11px] uppercase text-white/40">{hint}</span>}
    </button>
  );
}
