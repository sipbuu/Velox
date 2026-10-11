export interface CatchupSpec {
  type: string;
  days?: number;
  source?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function fillCatchupTemplate(template: string, startMs: number, durationMin: number, nowMs = Date.now()): string {
  const start = Math.floor(startMs / 1000);
  const durSec = Math.round(durationMin * 60);
  const end = start + durSec;
  const now = Math.floor(nowMs / 1000);
  const d = new Date(startMs);
  const e = new Date(end * 1000);
  const vars: Record<string, string> = {
    utc: String(start),
    start: String(start),
    timestamp: String(start),
    utcend: String(end),
    end: String(end),
    lutc: String(now),
    now: String(now),
    duration: String(durSec),
    offset: String(now - start),
    Y: String(d.getFullYear()),
    m: pad(d.getMonth() + 1),
    d: pad(d.getDate()),
    H: pad(d.getHours()),
    M: pad(d.getMinutes()),
    S: pad(d.getSeconds()),
  };
  return template
    .replace(/\$?\{(utc|utcend|lutc|start|end|now|timestamp|duration|offset):?([^}]*)\}/g, (_m, key: string, fmt: string) => {
      if ((key === "utc" || key === "start") && fmt) return formatDate(d, fmt);
      if ((key === "utcend" || key === "end") && fmt) return formatDate(e, fmt);
      if (key === "duration" && fmt) return String(Math.round(durSec / Number(fmt || 1)));
      return vars[key];
    })
    .replace(/\{(Y|m|d|H|M|S)\}/g, (_m, k: string) => vars[k])
    .replace(/\$\{(Y|m|d|H|M|S)\}/g, (_m, k: string) => vars[k]);
}

function formatDate(d: Date, fmt: string): string {
  return fmt.replace(/Y|m|d|H|M|S/g, (k) =>
    k === "Y" ? String(d.getFullYear()) : k === "m" ? pad(d.getMonth() + 1) : k === "d" ? pad(d.getDate()) : k === "H" ? pad(d.getHours()) : k === "M" ? pad(d.getMinutes()) : pad(d.getSeconds()),
  );
}

export function buildCatchupUrl(liveUrl: string, spec: CatchupSpec, startMs: number, durationMin: number, nowMs = Date.now()): string | null {
  const type = spec.type.toLowerCase();
  const join = (base: string, q: string) => base + (base.includes("?") ? "&" : "?") + q;
  if (type === "shift" || type === "timeshift") {
    return join(liveUrl, `utc=${Math.floor(startMs / 1000)}&lutc=${Math.floor(nowMs / 1000)}`);
  }
  if (type === "flussonic" || type === "flussonic-hls" || type === "fs") {
    const start = Math.floor(startMs / 1000);
    const dur = Math.round(durationMin * 60);
    if (/\/(index|video|mono)\.m3u8/.test(liveUrl)) return liveUrl.replace(/\/(index|video|mono)\.m3u8/, `/$1-${start}-${dur}.m3u8`);
    if (/\/mpegts/.test(liveUrl)) return liveUrl.replace(/\/mpegts/, `/timeshift_abs-${start}.ts`);
    return null;
  }
  if (!spec.source) return type === "append" || type === "default" ? null : null;
  const filled = fillCatchupTemplate(spec.source, startMs, durationMin, nowMs);
  if (type === "append") return liveUrl + filled;
  return filled;
}
