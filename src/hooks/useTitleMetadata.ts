import { useEffect, useState } from "react";
import type { MediaItem } from "@/types/media";
import { getSourceInstance } from "@/store/sources";
import { useSettings } from "@/store/settings";
import { getTitleMetadata, type SourceDetail, type TitleMetadata } from "@/lib/metadata";

export function useTitleMetadata(item: MediaItem | undefined) {
  const [meta, setMeta] = useState<TitleMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const keys = useSettings((s) => `${s.tmdbApiKey}|${s.omdbApiKey}|${s.metadataLanguage}`);

  useEffect(() => {
    if (!item) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const src = await getSourceInstance(item.sourceId);
      const detail: SourceDetail = (await src?.getItemDetail?.(item).catch(() => ({}))) ?? {};
      const m = await getTitleMetadata(item, detail);
      if (alive) setMeta(m);
    })()
      .catch((e) => console.warn("[velox] metadata", e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [item, keys]);

  return { meta, loading };
}
