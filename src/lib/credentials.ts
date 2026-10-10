import { invoke } from "./ipc";
import { isTauri } from "./platform";
import type { SourceSecrets } from "@/sources/types";

const SERVICE = "app.velox.player";
const WEB_PREFIX = "velox.secret.";
const WEB_KEY_NAME = "velox.secret.__key";

async function webKey(): Promise<CryptoKey> {
  let raw = localStorage.getItem(WEB_KEY_NAME);
  if (!raw) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    raw = btoa(String.fromCharCode(...bytes));
    localStorage.setItem(WEB_KEY_NAME, raw);
  }
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function webEncrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await webKey(), new TextEncoder().encode(plain));
  const out = new Uint8Array(iv.length + data.byteLength);
  out.set(iv);
  out.set(new Uint8Array(data), iv.length);
  return btoa(String.fromCharCode(...out));
}

async function webDecrypt(blob: string): Promise<string> {
  const bytes = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await webKey(), bytes.slice(12));
  return new TextDecoder().decode(plain);
}

export async function saveSecrets(sourceId: string, secrets: SourceSecrets): Promise<void> {
  const payload = JSON.stringify(secrets);
  if (isTauri()) {
    await invoke("credentials_set", { service: SERVICE, account: sourceId, secret: payload });
    return;
  }
  localStorage.setItem(WEB_PREFIX + sourceId, await webEncrypt(payload));
}

export async function loadSecrets(sourceId: string): Promise<SourceSecrets> {
  try {
    if (isTauri()) {
      const raw = await invoke<string | null>("credentials_get", { service: SERVICE, account: sourceId });
      return raw ? (JSON.parse(raw) as SourceSecrets) : {};
    }
    const blob = localStorage.getItem(WEB_PREFIX + sourceId);
    return blob ? (JSON.parse(await webDecrypt(blob)) as SourceSecrets) : {};
  } catch (err) {
    console.warn("[velox] failed to load credentials", err);
    return {};
  }
}

export async function deleteSecrets(sourceId: string): Promise<void> {
  if (isTauri()) {
    await invoke("credentials_delete", { service: SERVICE, account: sourceId });
    return;
  }
  localStorage.removeItem(WEB_PREFIX + sourceId);
}
