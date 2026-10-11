import { ExternalLink } from "lucide-react";
import { useSettings } from "@/store/settings";
import { Row, Section, Toggle } from "@/components/ui/SettingsRows";
import { openExternal } from "@/lib/open";

export function MetadataSection() {
  const s = useSettings();
  return (
    <div id="metadata">
      <Section title="Metadata, Trailers & Reviews">
        <p className="py-3 text-xs text-ink-muted">
          Velox uses your provider's info first. Add free API keys to enrich titles with trailers, cast, reviews and IMDb / Rotten Tomatoes / Metacritic scores. Keys stay on this
          device.
        </p>
        <Row label="TMDB API key or read token">
          <div className="flex items-center gap-2">
            <input className="input !w-56" type="password" autoComplete="off" placeholder="v3 key or v4 token" value={s.tmdbApiKey} onChange={(e) => s.set({ tmdbApiKey: e.target.value.trim() })} />
            <button aria-label="Get a TMDB key" className="btn-glass !px-2.5" onClick={() => openExternal("https://www.themoviedb.org/settings/api")}>
              <ExternalLink size={14} />
            </button>
          </div>
        </Row>
        <Row label="OMDb API key (IMDb ratings)">
          <div className="flex items-center gap-2">
            <input className="input !w-56" type="password" autoComplete="off" placeholder="optional" value={s.omdbApiKey} onChange={(e) => s.set({ omdbApiKey: e.target.value.trim() })} />
            <button aria-label="Get an OMDb key" className="btn-glass !px-2.5" onClick={() => openExternal("https://www.omdbapi.com/apikey.aspx")}>
              <ExternalLink size={14} />
            </button>
          </div>
        </Row>
        <Row label="Metadata language">
          <select className="input !w-auto" value={s.metadataLanguage} onChange={(e) => s.set({ metadataLanguage: e.target.value })}>
            {["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "it-IT", "pt-BR", "nl-NL", "pl-PL", "tr-TR", "ar-SA", "ja-JP", "ko-KR"].map((l) => (
              <option key={l} value={l}>
                {new Intl.DisplayNames([l], { type: "language" }).of(l) ?? l}
              </option>
            ))}
          </select>
        </Row>
        <Toggle label="Autoplay trailer previews" hint="Plays a muted trailer behind the title on details pages." value={s.autoplayTrailers} onChange={(v) => s.set({ autoplayTrailers: v })} />
      </Section>
    </div>
  );
}
