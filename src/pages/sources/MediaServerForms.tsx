import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Server } from "lucide-react";
import { JellyfinSource } from "@/sources/jellyfin";
import { plexAuthUrl, plexPollPin, plexServers, plexStartPin, PlexSource, type PlexServerChoice } from "@/sources/plex";
import type { JellyfinConfig, PlexConfig, SourceConfig } from "@/sources/types";
import { openExternal } from "@/lib/open";
import { newId } from "@/lib/id";
import { cn } from "@/lib/cn";

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

export function JellyfinForm({ onSubmit }: { onSubmit: Submit }) {
  const [f, setF] = useState({ name: "", server: "", username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const server = f.server.trim().replace(/\/+$/, "");
          const cfg: JellyfinConfig = { ...base("jellyfin", f.name || new URL(server).host), kind: "jellyfin", server, username: f.username.trim(), deviceId: newId("dev") };
          const src = new JellyfinSource(cfg, { password: f.password });
          await src.authenticate();
          await onSubmit(cfg, { password: f.password });
        } catch (err) {
          setMsg((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Display name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Home server" /></Field>
      <Field label="Server URL"><input className="input" required type="url" value={f.server} onChange={(e) => setF({ ...f, server: e.target.value })} placeholder="http://192.168.1.20:8096" /></Field>
      <Field label="Username"><input className="input" required autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
      <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Signing in…" : "Connect"}</button>
        {msg && <p className="text-sm text-live">{msg}</p>}
      </div>
    </form>
  );
}

export function PlexForm({ onSubmit }: { onSubmit: Submit }) {
  const [clientId] = useState(() => newId("velox"));
  const [phase, setPhase] = useState<"idle" | "waiting" | "pick" | "manual">("idle");
  const [servers, setServers] = useState<PlexServerChoice[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [manual, setManual] = useState({ server: "", token: "" });
  const [busy, setBusy] = useState(false);
  const polling = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(polling.current), []);

  const signIn = async () => {
    setMsg(null);
    try {
      const pin = await plexStartPin(clientId);
      await openExternal(plexAuthUrl(clientId, pin.code));
      setPhase("waiting");
      const started = Date.now();
      polling.current = window.setInterval(async () => {
        if (Date.now() - started > 5 * 60_000) {
          window.clearInterval(polling.current);
          setPhase("idle");
          setMsg("Sign-in timed out. Try again.");
          return;
        }
        const token = await plexPollPin(clientId, pin.id).catch(() => null);
        if (!token) return;
        window.clearInterval(polling.current);
        const list = await plexServers(clientId, token);
        if (!list.length) {
          setPhase("idle");
          setMsg("No Plex Media Servers found on this account.");
          return;
        }
        setServers(list);
        setPhase("pick");
      }, 2000);
    } catch (e) {
      setMsg((e as Error).message);
      setPhase("idle");
    }
  };

  const connect = async (server: string, token: string, name?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const uri = server.trim().replace(/\/+$/, "");
      const cfg: PlexConfig = { ...base("plex", name || "Plex"), kind: "plex", server: uri, clientId, serverName: name };
      await new PlexSource(cfg, { token }).authenticate();
      await onSubmit(cfg, { token });
    } catch (e) {
      setMsg(`Couldn't reach that server: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      {phase === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary bg-[#e5a00d] text-black shadow-none" onClick={signIn}>
            Sign in with Plex <ExternalLink size={14} />
          </button>
          <button className="btn-glass" onClick={() => setPhase("manual")}>
            Enter server URL & token
          </button>
        </div>
      )}
      {phase === "waiting" && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={16} className="animate-spin" /> Finish signing in on plex.tv in your browser…
        </p>
      )}
      {phase === "pick" && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Choose a server connection</p>
          {servers.map((s) => (
            <button
              key={s.uri}
              disabled={busy}
              className="glass flex items-center gap-3 rounded-xl p-3 text-left hover:bg-glass-strong/60"
              onClick={() => connect(s.uri, s.token, s.name)}
            >
              <Server size={18} className="text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.name}</span>
                <span className="block truncate text-xs text-ink-faint">{s.uri}</span>
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", s.relay ? "bg-warning/20 text-warning" : s.local ? "bg-success/20 text-success" : "bg-accent/15 text-accent")}>
                {s.relay ? "Relay" : s.local ? "Local" : "Remote"}
              </span>
            </button>
          ))}
        </div>
      )}
      {phase === "manual" && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void connect(manual.server, manual.token);
          }}
        >
          <Field label="Server URL"><input className="input" required type="url" placeholder="http://192.168.1.20:32400" value={manual.server} onChange={(e) => setManual({ ...manual, server: e.target.value })} /></Field>
          <Field label="X-Plex-Token"><input className="input" required type="password" value={manual.token} onChange={(e) => setManual({ ...manual, token: e.target.value })} /></Field>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Connecting…" : "Connect"}</button>
            <button type="button" className="btn-glass" onClick={() => setPhase("idle")}>Back</button>
          </div>
        </form>
      )}
      {msg && <p className="text-sm text-live">{msg}</p>}
    </div>
  );
}
