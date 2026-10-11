import { Monitor, Moon, Sun } from "lucide-react";
import { useSettings, type ThemePreference } from "@/store/settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { Row, Section, Toggle } from "@/components/ui/SettingsRows";
import { ContentSection } from "@/pages/settings/ContentSection";
import { isTauri } from "@/lib/platform";
import { cn } from "@/lib/cn";

const ACCENTS = [
  ["Blue", "10 132 255"],
  ["Purple", "175 82 222"],
  ["Pink", "255 55 95"],
  ["Orange", "255 149 0"],
  ["Green", "52 199 89"],
  ["Teal", "48 176 199"],
] as const;

export function SettingsPage() {
  const s = useSettings();
  const native = isTauri();

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <PageHeader title="Settings" />

      <Section title="Appearance">
        <Row label="Theme">
          <div className="glass-pill flex p-1">
            {([
              ["system", Monitor],
              ["light", Sun],
              ["dark", Moon],
            ] as [ThemePreference, typeof Sun][]).map(([t, Icon]) => (
              <button
                key={t}
                aria-label={t}
                onClick={() => s.set({ theme: t })}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium capitalize", s.theme === t ? "bg-accent text-accent-contrast" : "text-ink-muted")}
              >
                <Icon size={14} /> {t}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Accent color">
          <div className="flex gap-2">
            {ACCENTS.map(([name, rgb]) => (
              <button
                key={name}
                aria-label={name}
                onClick={() => s.set({ accent: rgb })}
                className={cn("h-7 w-7 rounded-full ring-offset-2 ring-offset-canvas transition-transform active:scale-90", s.accent === rgb && "ring-2 ring-ink")}
                style={{ background: `rgb(${rgb})` }}
              />
            ))}
          </div>
        </Row>
        <Toggle label="Reduce transparency" hint="Use solid surfaces instead of frosted glass." value={s.reduceTransparency} onChange={(v) => s.set({ reduceTransparency: v })} />
      </Section>

      <ContentSection />

      <Section title="Live TV & Time-Shift">
        <p className="px-1 pb-2 text-xs text-ink-muted">
          Pause and rewind live TV. HLS streams with a DVR window rewind natively. For streams without one, enable the software buffer cache.
        </p>
        <Toggle
          label="Software Buffer Cache"
          hint={native ? "Records the live stream locally while you watch. Cached segments are purged when you leave the stream or quit." : "Keeps recent segments in memory so you can rewind."}
          value={s.softwareBufferCache}
          onChange={(v) => s.set({ softwareBufferCache: v })}
        />
        {native && s.softwareBufferCache && (
          <Row label="Cache storage">
            <select className="input !w-auto" value={s.softwareBufferStorage} onChange={(e) => s.set({ softwareBufferStorage: e.target.value as "memory" | "disk" })}>
              <option value="disk">Temporary disk</option>
              <option value="memory">App memory</option>
            </select>
          </Row>
        )}
        <Row label={`Rewind window: ${s.timeshiftWindowSec}s`}>
          <input type="range" className="w-40 accent-[rgb(var(--v-accent))]" min={10} max={300} step={5} value={s.timeshiftWindowSec} onChange={(e) => s.set({ timeshiftWindowSec: Number(e.target.value) })} />
        </Row>
        <Toggle label="Prefer native HLS on Apple devices" hint="Uses hardware-accelerated AVPlayer pipeline and AirPlay." value={s.preferNativeHls} onChange={(v) => s.set({ preferNativeHls: v })} />
        {native && (
          <Toggle label="Route streams through native relay" hint="Bypasses CORS and applies custom headers / User-Agent." value={s.routeStreamsThroughRelay} onChange={(v) => s.set({ routeStreamsThroughRelay: v })} />
        )}
      </Section>

      <Section title="Captions">
        <Toggle label="Show subtitles by default" value={s.subtitlesEnabledByDefault} onChange={(v) => s.set({ subtitlesEnabledByDefault: v })} />
        <Row label="Preferred language">
          <input className="input !w-24" value={s.preferredSubtitleLang} onChange={(e) => s.set({ preferredSubtitleLang: e.target.value })} />
        </Row>
        <Row label={`Text size: ${Math.round(s.captionStyle.size * 100)}%`}>
          <input type="range" className="w-40" min={0.6} max={2} step={0.1} value={s.captionStyle.size} onChange={(e) => s.set({ captionStyle: { ...s.captionStyle, size: Number(e.target.value) } })} />
        </Row>
        <Row label="Background">
          <select className="input !w-auto" value={s.captionStyle.background} onChange={(e) => s.set({ captionStyle: { ...s.captionStyle, background: e.target.value } })}>
            <option value="rgba(0,0,0,0.6)">Translucent</option>
            <option value="rgba(0,0,0,1)">Solid</option>
            <option value="transparent">None</option>
          </select>
        </Row>
        <Row label="Font">
          <select className="input !w-auto" value={s.captionStyle.font} onChange={(e) => s.set({ captionStyle: { ...s.captionStyle, font: e.target.value as "system" | "serif" | "mono" } })}>
            <option value="system">System</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
        </Row>
      </Section>

      <Section title="Playback">
        <Toggle label="Autoplay next episode" value={s.autoplayNextEpisode} onChange={(v) => s.set({ autoplayNextEpisode: v })} />
      </Section>

      {native ? (
        <Section title="Downloads">
          <Row label="Simultaneous downloads">
            <input type="number" className="input !w-20" min={1} max={6} value={s.downloadConcurrency} onChange={(e) => s.set({ downloadConcurrency: Number(e.target.value) })} />
          </Row>
        </Section>
      ) : (
        <Section title="Web">
          <Row label="CORS proxy">
            <input className="input" placeholder="https://proxy.example/?url={url}" value={s.webCorsProxy} onChange={(e) => s.set({ webCorsProxy: e.target.value })} />
          </Row>
        </Section>
      )}

      <p className="mt-8 text-center text-xs text-ink-faint">Velox {__APP_VERSION__}</p>
    </div>
  );
}

