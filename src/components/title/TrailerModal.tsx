import { ExternalLink, X } from "lucide-react";
import { openExternal } from "@/lib/open";
import { youtubeEmbed } from "@/lib/youtube";

export function TrailerModal({ trailerKey, url, title, onClose }: { trailerKey?: string; url?: string; title: string; onClose: () => void }) {
  const watchUrl = trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : url;
  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-black/80 p-3 backdrop-blur-md animate-fade-up" onClick={onClose}>
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2 text-white">
          <p className="min-w-0 flex-1 truncate font-semibold">{title} · Trailer</p>
          {watchUrl && (
            <button className="btn !py-1.5 bg-white/15 text-sm hover:bg-white/25" onClick={() => openExternal(watchUrl)}>
              <ExternalLink size={14} /> {trailerKey ? "YouTube" : "Open"}
            </button>
          )}
          <button aria-label="Close trailer" className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-glass-lg bg-black shadow-glass-lift">
          {trailerKey ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={youtubeEmbed(trailerKey)}
              title={`${title} trailer`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : url ? (
            <video className="absolute inset-0 h-full w-full" src={url} controls autoPlay playsInline />
          ) : null}
        </div>
      </div>
    </div>
  );
}
