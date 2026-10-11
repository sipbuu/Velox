import { useFilters } from "@/store/filters";
import { useUi } from "@/store/ui";

export async function requirePin(reason: string): Promise<boolean> {
  if (!useFilters.getState().pinHash) return true;
  return useUi.getState().askPin(reason);
}
