import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { useUi } from "@/store/ui";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  { title: "Playback", keys: [["Space / K", "Play / pause"], ["← / →", "Back / forward 10s"], ["↑ / ↓", "Volume"], ["M", "Mute"], ["F", "Fullscreen"], ["C", "Cycle subtitles"], ["< / >", "Slower / faster"], ["Esc", "Minimize player"]] },
  { title: "Live TV", keys: [["Page Up / Down", "Previous / next channel"]] },
  { title: "App", keys: [["?", "Show shortcuts"], ["/", "Search"], ["G then H", "Home"], ["G then L", "Live TV"], ["G then T", "TV Guide"], ["G then F", "Favorites"]] },
];

export function ShortcutsOverlay() {
  const { shortcutsOpen, setShortcutsOpen } = useUi();
  useEffect(() => {
    if (!shortcutsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShortcutsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsOpen, setShortcutsOpen]);
  if (!shortcutsOpen) return null;
  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setShortcutsOpen(false)}>
      <div className="glass-strong w-full max-w-2xl rounded-glass-xl p-6 animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <Keyboard size={20} className="text-accent" />
          <h2 className="flex-1 text-lg font-semibold">Keyboard shortcuts</h2>
          <button aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/10" onClick={() => setShortcutsOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{g.title}</p>
              <dl className="space-y-1.5">
                {g.keys.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-ink-muted">{v}</dt>
                    <dd>
                      <kbd className="rounded-md border border-ink/15 bg-ink/5 px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
