import { memo, useState } from "react";
import { fallbackArtwork } from "@/lib/fallbackArt";
import { cn } from "@/lib/cn";

interface Props {
  src?: string;
  title: string;
  variant?: "logo" | "poster";
  className?: string;
  fit?: "cover" | "contain";
}

const failed = new Set<string>();

export const Artwork = memo(function Artwork({ src, title, variant = "poster", className, fit = "cover" }: Props) {
  const usable = src && /^(https?:|data:|blob:|asset:|tauri:|http:\/\/asset\.localhost)/.test(src) && !failed.has(src);
  const [state, setState] = useState<"loading" | "ok" | "error">(usable ? "loading" : "error");
  const fallback = fallbackArtwork(title, variant);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {state === "loading" && <div className="skeleton absolute inset-0" />}
      <img
        src={state === "error" || !usable ? fallback : src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        className={cn(
          "h-full w-full transition-opacity duration-300",
          fit === "contain" && state === "ok" ? "object-contain p-[12%]" : "object-cover",
          state === "loading" ? "opacity-0" : "opacity-100",
        )}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (state === "loading" && (img.naturalWidth < 2 || img.naturalHeight < 2)) {
            if (src) failed.add(src);
            setState("error");
          } else if (state === "loading") setState("ok");
        }}
        onError={() => {
          if (src) failed.add(src);
          setState("error");
        }}
      />
    </div>
  );
});
