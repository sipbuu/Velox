import { isTauri } from "./platform";

export async function notify(title: string, body: string) {
  try {
    if (isTauri()) {
      const n = await import("@tauri-apps/plugin-notification");
      let granted = await n.isPermissionGranted();
      if (!granted) granted = (await n.requestPermission()) === "granted";
      if (granted) n.sendNotification({ title, body });
      return;
    }
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission === "granted") new Notification(title, { body, icon: "./velox.svg" });
  } catch (e) {
    console.warn("[velox] notification failed", e);
  }
}
