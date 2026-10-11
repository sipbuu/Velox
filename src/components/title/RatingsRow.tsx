import type { Rating } from "@/lib/metadata";
import { openExternal } from "@/lib/open";
import { cn } from "@/lib/cn";

const STYLE: Record<Rating["source"], { badge: string; cls: string }> = {
  imdb: { badge: "IMDb", cls: "bg-[#f5c518] text-black" },
  rt: { badge: "🍅", cls: "bg-[#fa320a] text-white" },
  metacritic: { badge: "M", cls: "bg-[#66cc33] text-black" },
  tmdb: { badge: "TMDB", cls: "bg-gradient-to-r from-[#90cea1] to-[#01b4e4] text-[#0d253f]" },
  provider: { badge: "★", cls: "bg-white/20 text-white" },
};

export function RatingsRow({ ratings, className }: { ratings: Rating[]; className?: string }) {
  if (!ratings.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {ratings.map((r) => {
        const s = STYLE[r.source];
        const Tag = r.url ? "button" : "span";
        return (
          <Tag
            key={r.source}
            title={r.label}
            onClick={r.url ? () => openExternal(r.url!) : undefined}
            className={cn("glass-dark flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-semibold", r.url && "transition-transform hover:scale-105 active:scale-95")}
          >
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black leading-4", s.cls)}>{s.badge}</span>
            {r.value}
          </Tag>
        );
      })}
    </div>
  );
}
