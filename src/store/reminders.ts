import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { kvStorage } from "@/lib/kv";
import type { MediaItem } from "@/types/media";

export interface Reminder {
  id: string;
  channel: MediaItem;
  title: string;
  start: number;
  end: number;
}

interface RemindersState {
  reminders: Reminder[];
  add: (r: Omit<Reminder, "id">) => void;
  remove: (id: string) => void;
  has: (channelUid: string, start: number) => boolean;
}

export const reminderId = (channelUid: string, start: number) => `${channelUid}@${start}`;

export const useReminders = create<RemindersState>()(
  persist(
    (set, get) => ({
      reminders: [],
      add: (r) => set((s) => ({ reminders: [...s.reminders.filter((x) => x.id !== reminderId(r.channel.uid, r.start)), { ...r, id: reminderId(r.channel.uid, r.start) }].sort((a, b) => a.start - b.start) })),
      remove: (id) => set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),
      has: (channelUid, start) => get().reminders.some((r) => r.id === reminderId(channelUid, start)),
    }),
    { name: "velox.reminders", version: 1, storage: createJSONStorage(() => kvStorage) },
  ),
);
