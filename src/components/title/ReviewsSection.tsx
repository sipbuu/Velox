import { useState } from "react";
import { ExternalLink, Star } from "lucide-react";
import type { Review } from "@/lib/metadata";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Artwork } from "@/components/media/Artwork";
import { openExternal } from "@/lib/open";

export function ReviewsSection({ reviews }: { reviews: Review[] }) {
  if (!reviews.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">Reviews</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {reviews.map((r, i) => (
          <ReviewCard key={`${r.author}-${i}`} review={r} />
        ))}
      </div>
    </section>
  );
}

function ReviewCard({ review: r }: { review: Review }) {
  const [open, setOpen] = useState(false);
  const text = r.content.replace(/\*\*|__|#+\s|\r/g, "").trim();
  return (
    <GlassPanel className="p-4">
      <div className="mb-2 flex items-center gap-3">
        <Artwork src={r.avatar} title={r.author} variant="logo" className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{r.author}</p>
          {r.date && <p className="text-[11px] text-ink-faint">{new Date(r.date).toLocaleDateString()}</p>}
        </div>
        {r.rating != null && (
          <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning">
            <Star size={11} fill="currentColor" /> {r.rating}/10
          </span>
        )}
      </div>
      <p className={`whitespace-pre-line text-sm leading-relaxed text-ink-muted ${open ? "" : "line-clamp-5"}`}>{text}</p>
      <div className="mt-2 flex gap-3 text-xs font-semibold text-accent">
        {text.length > 320 && <button onClick={() => setOpen((o) => !o)}>{open ? "Show less" : "Read more"}</button>}
        {r.url && (
          <button className="flex items-center gap-1" onClick={() => openExternal(r.url!)}>
            Full review <ExternalLink size={11} />
          </button>
        )}
      </div>
    </GlassPanel>
  );
}
