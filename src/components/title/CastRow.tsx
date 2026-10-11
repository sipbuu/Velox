import type { CastMember } from "@/lib/metadata";
import { Artwork } from "@/components/media/Artwork";

export function CastRow({ cast }: { cast: CastMember[] }) {
  if (!cast.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">Cast</h2>
      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
        {cast.map((c) => (
          <div key={`${c.name}-${c.role}`} className="w-24 shrink-0 text-center">
            <Artwork src={c.photo} title={c.name} variant="logo" className="mx-auto aspect-square w-20 rounded-full shadow-poster ring-1 ring-ink/10" />
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight">{c.name}</p>
            {c.role && <p className="line-clamp-2 text-[11px] text-ink-faint">{c.role}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
