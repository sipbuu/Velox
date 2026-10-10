import { useEffect, useState } from "react";
import type { EpgProgramme, MediaItem } from "@/types/media";
import { getSourceInstance } from "@/store/sources";

const cache = new Map<string, { at: number; list: EpgProgramme[] }>();
const TTL = 10 * 60_000;

export function useEpg(item: MediaItem | undefined) {
  const [list, setList] = useState<EpgProgramme[]>([]);
  useEffect(() => {
    if (!item || item.kind !== "live") return;
    const hit = cache.get(item.uid);
    if (hit && Date.now() - hit.at < TTL) return setList(hit.list);
    let alive = true;
    getSourceInstance(item.sourceId)
      .then((src) => src?.getEpg?.(item) ?? [])
      .then((l) => {
        cache.set(item.uid, { at: Date.now(), list: l });
        if (alive) setList(l);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item]);
  const now = Date.now();
  return { list, current: list.find((p) => p.start <= now && p.end > now), upcoming: list.filter((p) => p.start > now) };
}
