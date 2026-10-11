import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useSettings } from "@/store/settings";

export function MetadataHint() {
  const hasKey = useSettings((s) => !!s.tmdbApiKey.trim());
  if (hasKey) return null;
  return (
    <Link to="/settings#metadata" className="glass mt-6 flex items-center gap-3 rounded-glass p-3 text-sm">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
        <Sparkles size={18} />
      </span>
      <span className="text-ink-muted">
        Add a free <b className="text-ink">TMDB</b> key (and optionally <b className="text-ink">OMDb</b> for IMDb, Rotten Tomatoes &amp; Metacritic scores) in Settings to unlock trailers,
        cast, reviews and ratings.
      </span>
    </Link>
  );
}
