import { invoke } from "./ipc";
import { isTauri } from "./platform";
import { useSettings } from "@/store/settings";

export interface FetchOptions {
  headers?: Record<string, string>;
  userAgent?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 30_000;

function webProxied(url: string): string {
  const proxy = useSettings.getState().webCorsProxy.trim();
  if (!proxy) return url;
  return proxy.includes("{url}") ? proxy.replace("{url}", encodeURIComponent(url)) : proxy + url;
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  if (isTauri()) {
    const task = invoke<string>("http_get_text", {
      url,
      headers: opts.headers ?? {},
      userAgent: opts.userAgent ?? null,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT,
    });
    if (!opts.signal) return task;
    return new Promise<string>((resolve, reject) => {
      const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
      opts.signal!.addEventListener("abort", onAbort, { once: true });
      task.then(resolve, reject).finally(() => opts.signal!.removeEventListener("abort", onAbort));
    });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
  opts.signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(webProxied(url), { headers: opts.headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${new URL(url).host}`);
  }
}
