import { useEffect } from "react";
import { useReminders } from "@/store/reminders";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { notify } from "@/lib/notify";
import { formatTime } from "@/lib/format";

export function useReminderScheduler() {
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const { reminders, remove } = useReminders.getState();
      for (const r of reminders) {
        if (r.end < now) {
          remove(r.id);
          continue;
        }
        if (r.start - 60_000 > now) continue;
        remove(r.id);
        void notify(`${r.title} is starting`, `${r.channel.title} · ${formatTime(r.start)}`);
        useUi.getState().pushToast(
          { title: `${r.title} is starting`, body: `${r.channel.title} · ${formatTime(r.start)}`, action: { label: "Watch", run: () => void usePlayer.getState().play(r.channel) } },
          60_000,
        );
      }
    };
    tick();
    const t = window.setInterval(tick, 15_000);
    return () => window.clearInterval(t);
  }, []);
}
