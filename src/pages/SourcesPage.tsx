import { useRef, useState } from "react";
import { Clapperboard, FolderOpen, Link2, ListVideo, Plus, RefreshCw, Server, Trash2, Tv2, Upload } from "lucide-react";
import { JellyfinForm, PlexForm } from "@/pages/sources/MediaServerForms";
import { useSources } from "@/store/sources";
import { useLibrary } from "@/store/library";
import { listSourceFactories } from "@/sources/registry";
import { registerLocalPlaylist } from "@/sources/m3u";
import { registerWebFiles } from "@/sources/local";
import { XtreamSource } from "@/sources/xtream";
import type { DirectConfig, LocalConfig, M3UConfig, SourceConfig, XtreamConfig } from "@/sources/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { isTauri } from "@/lib/platform";
import { newId } from "@/lib/id";
import { cn } from "@/lib/cn";

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  xtream: Server,
  m3u: ListVideo,
  local: FolderOpen,
  direct: Link2,
  jellyfin: Tv2,
  plex: Clapperboard,
};

export function SourcesPage() {
  const { configs, addSource, removeSource, toggleSource } = useSources();
  const { refresh, status, dropSnapshot } = useLibrary();
  const [adding, setAdding] = useState<string | null>(null);

  const add = async (config: SourceConfig, secrets?: Record<string, string>) => {
    await addSource(config, secrets);
    setAdding(null);
    void refresh(config.id);
  };

  return (
    <div className="animate-fade-up">
      <PageHeader title="Sources & Accounts" subtitle="Mix Xtream accounts, playlists, URLs and local media in one library" />

      <div className="grid gap-3">
        {configs.map((c) => {
          const Icon = ICONS[c.kind] ?? Server;
          const st = status[c.id];
          return (
            <GlassPanel key={c.id} className="flex items-center gap-4 p-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                <p className={cn("truncate text-xs", st?.state === "error" ? "text-live" : "text-ink-faint")}>
                  {st?.state === "loading" ? (st.message ?? "Loading…") : st?.state === "error" ? st.message : c.kind.toUpperCase()}
                </p>
              </div>
              <button aria-label="Refresh" className="btn-glass !px-2.5" onClick={() => refresh(c.id)}>
                <RefreshCw size={16} className={st?.state === "loading" ? "animate-spin" : ""} />
              </button>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={c.enabled} onChange={(e) => toggleSource(c.id, e.target.checked)} />
                <span className="h-7 w-12 rounded-full bg-ink/15 transition-colors peer-checked:bg-success" />
                <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-spring peer-checked:translate-x-5" />
              </label>
              <button
                aria-label="Remove"
                className="btn-glass !px-2.5 text-live"
                onClick={async () => {
                  if (!confirm(`Remove "${c.name}"? Saved credentials will be deleted.`)) return;
                  await removeSource(c.id);
                  dropSnapshot(c.id);
                }}
              >
                <Trash2 size={16} />
              </button>
            </GlassPanel>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Add a source</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {listSourceFactories().map((f) => {
          const Icon = ICONS[f.kind] ?? Plus;
          return (
            <button
              key={f.kind}
              className={cn("poster-card glass flex items-start gap-3 p-4 text-left", adding === f.kind && "ring-2 ring-accent")}
              onClick={() => setAdding(adding === f.kind ? null : f.kind)}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <Icon size={18} />
              </div>
              <div>
                <p className="font-semibold">{f.label}</p>
                <p className="text-xs text-ink-muted">{f.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {adding && (
        <GlassPanel strong className="mt-4 p-5 animate-fade-up">
          {adding === "xtream" && <XtreamForm onSubmit={add} />}
          {adding === "m3u" && <M3UForm onSubmit={add} />}
          {adding === "local" && <LocalForm onSubmit={add} />}
          {adding === "direct" && <DirectForm onSubmit={add} />}
          {adding === "jellyfin" && <JellyfinForm onSubmit={add} />}
          {adding === "plex" && <PlexForm onSubmit={add} />}
        </GlassPanel>
      )}
    </div>
  );
}

type Submit = (c: SourceConfig, secrets?: Record<string, string>) => Promise<void>;

const base = (kind: string, name: string) => ({ id: newId(kind), kind, name, enabled: true, createdAt: Date.now() });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function XtreamForm({ onSubmit }: { onSubmit: Submit }) {
  const [f, setF] = useState({ name: "", server: "", username: "", password: "", fmt: "m3u8" as "m3u8" | "ts", ua: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cfg = (): XtreamConfig => ({
    ...base("xtream", f.name || new URL(f.server).host),
    kind: "xtream",
    server: f.server.trim(),
    username: f.username.trim(),
    preferredLiveFormat: f.fmt,
    userAgent: f.ua || undefined,
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const c = cfg();
          const auth = await new XtreamSource(c, { password: f.password }).authenticate();
          if (!auth.ok) throw new Error(auth.message);
          await onSubmit(c, { password: f.password });
        } catch (err) {
          setMsg((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Display name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="My provider" /></Field>
      <Field label="Server URL"><input className="input" required type="url" value={f.server} onChange={(e) => setF({ ...f, server: e.target.value })} placeholder="http://example.com:8080" /></Field>
      <Field label="Username"><input className="input" required autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
      <Field label="Password"><input className="input" required type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Field label="Live stream format">
        <select className="input" value={f.fmt} onChange={(e) => setF({ ...f, fmt: e.target.value as "m3u8" | "ts" })}>
          <option value="m3u8">HLS (.m3u8): best for iOS & time-shift</option>
          <option value="ts">MPEG-TS (.ts)</option>
        </select>
      </Field>
      <Field label="Custom User-Agent (optional)"><input className="input" value={f.ua} onChange={(e) => setF({ ...f, ua: e.target.value })} /></Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Signing in…" : "Add account"}</button>
        {msg && <p className="text-sm text-live">{msg}</p>}
        <p className="ml-auto text-xs text-ink-faint">{isTauri() ? "Password is stored in the system keychain." : "Password is encrypted in browser storage."}</p>
      </div>
    </form>
  );
}

function M3UForm({ onSubmit }: { onSubmit: Submit }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [epg, setEpg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const c: M3UConfig = { ...base("m3u", name || "Playlist"), kind: "m3u", url: url.trim(), epgUrl: epg || undefined };
        void onSubmit(c);
      }}
    >
      <Field label="Display name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My playlist" /></Field>
      <Field label="Playlist URL"><input className="input" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/playlist.m3u8" /></Field>
      <Field label="XMLTV EPG URL (optional)"><input className="input" type="url" value={epg} onChange={(e) => setEpg(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary">Add playlist</button>
        <button type="button" className="btn-glass" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Import .m3u file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const c: M3UConfig = { ...base("m3u", name || file.name), kind: "m3u", fileName: file.name };
            registerLocalPlaylist(c.id, await file.text());
            void onSubmit(c);
          }}
        />
      </div>
    </form>
  );
}

function LocalForm({ onSubmit }: { onSubmit: Submit }) {
  const [name, setName] = useState("Local Media");
  const [folders, setFolders] = useState<string[]>([]);
  const dirRef = useRef<HTMLInputElement>(null);

  const pick = async () => {
    if (isTauri()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const res = await open({ directory: true, multiple: true });
      if (res) setFolders((f) => [...new Set([...f, ...(Array.isArray(res) ? res : [res])])]);
    } else dirRef.current?.click();
  };

  return (
    <div className="grid gap-3">
      <Field label="Display name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">
        {folders.map((f) => (
          <span key={f} className="glass-pill px-3 py-1 text-xs">{f}</span>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="btn-glass" onClick={pick}><FolderOpen size={16} /> Choose folder</button>
        <button
          className="btn-primary"
          disabled={!folders.length && isTauri()}
          onClick={() => void onSubmit({ ...base("local", name), kind: "local", folders } as LocalConfig)}
        >
          Add
        </button>
      </div>
      <input
        ref={dirRef}
        type="file"
        hidden
        multiple
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const c = { ...base("local", name), kind: "local", folders: ["browser"] } as LocalConfig;
          registerWebFiles(c.id, files);
          void onSubmit(c);
        }}
      />
      <p className="text-xs text-ink-faint">
        Sidecar subtitles (movie.en.srt, movie.vtt) next to a video are picked up automatically. MKV support depends on the platform's WebView.
      </p>
    </div>
  );
}

function DirectForm({ onSubmit }: { onSubmit: Submit }) {
  const [name, setName] = useState("Bookmarks");
  const [rows, setRows] = useState([{ title: "", url: "", isLive: true }]);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const entries = rows.filter((r) => r.url).map((r) => ({ ...r, id: newId("u"), title: r.title || r.url }));
        void onSubmit({ ...base("direct", name), kind: "direct", entries } as DirectConfig);
      }}
    >
      <Field label="Collection name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input className="input" placeholder="Title" value={r.title} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
          <input className="input" type="url" required placeholder="https://…/stream.m3u8" value={r.url} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={r.isLive} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, isLive: e.target.checked } : x)))} /> Live
          </label>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" className="btn-glass" onClick={() => setRows([...rows, { title: "", url: "", isLive: true }])}><Plus size={16} /> Row</button>
        <button className="btn-primary">Save</button>
      </div>
    </form>
  );
}
