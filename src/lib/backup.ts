import { invoke } from "./ipc";
import { isTauri } from "./platform";
import { useSettings } from "@/store/settings";
import { useSources } from "@/store/sources";
import { useLibrary } from "@/store/library";
import { useFilters } from "@/store/filters";
import { useReminders } from "@/store/reminders";

interface BackupFile {
  app: "velox";
  version: 1;
  exportedAt: string;
  settings: Record<string, unknown>;
  sources: unknown[];
  favorites: string[];
  favoriteItems: Record<string, unknown>;
  recents: unknown[];
  filters: { hiddenCategories: string[]; hiddenItems: string[]; hideAdult: boolean };
  reminders: unknown[];
}

const SECRET_SETTINGS = ["tmdbApiKey", "omdbApiKey", "set", "hydrated"];

export function buildBackup(): BackupFile {
  const settings = Object.fromEntries(Object.entries(useSettings.getState()).filter(([k, v]) => !SECRET_SETTINGS.includes(k) && typeof v !== "function"));
  const lib = useLibrary.getState();
  const f = useFilters.getState();
  return {
    app: "velox",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    sources: useSources.getState().configs,
    favorites: lib.favorites,
    favoriteItems: lib.favoriteItems,
    recents: lib.recents,
    filters: { hiddenCategories: f.hiddenCategories, hiddenItems: f.hiddenItems, hideAdult: f.hideAdult },
    reminders: useReminders.getState().reminders,
  };
}

export function applyBackup(raw: string): { sources: number; favorites: number } {
  const data = JSON.parse(raw) as Partial<BackupFile>;
  if (data.app !== "velox") throw new Error("This isn't a Velox backup file.");
  if (data.settings) useSettings.getState().set(data.settings);
  const existing = new Set(useSources.getState().configs.map((c) => c.id));
  const incoming = (data.sources ?? []).filter((c) => !existing.has((c as { id: string }).id));
  useSources.setState((s) => ({ configs: [...s.configs, ...(incoming as typeof s.configs)] }));
  useLibrary.setState((s) => ({
    favorites: [...new Set([...(data.favorites ?? []), ...s.favorites])],
    favoriteItems: { ...(data.favoriteItems as typeof s.favoriteItems), ...s.favoriteItems },
    recents: s.recents.length ? s.recents : ((data.recents ?? []) as typeof s.recents),
  }));
  if (data.filters)
    useFilters.setState((s) => ({
      hiddenCategories: [...new Set([...s.hiddenCategories, ...data.filters!.hiddenCategories])],
      hiddenItems: [...new Set([...s.hiddenItems, ...data.filters!.hiddenItems])],
      hideAdult: data.filters!.hideAdult,
    }));
  if (data.reminders) useReminders.setState({ reminders: data.reminders as ReturnType<typeof useReminders.getState>["reminders"] });
  return { sources: incoming.length, favorites: data.favorites?.length ?? 0 };
}

export async function exportBackup(): Promise<string | null> {
  const json = JSON.stringify(buildBackup(), null, 2);
  const name = `velox-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: name, filters: [{ name: "Velox backup", extensions: ["json"] }] });
    if (!path) return null;
    await invoke("text_file_write", { path, contents: json });
    return path;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
}

export async function pickAndImportBackup(): Promise<{ sources: number; favorites: number } | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: "Velox backup", extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return null;
    return applyBackup(await invoke<string>("text_file_read", { path }));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(applyBackup(await file.text()));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
