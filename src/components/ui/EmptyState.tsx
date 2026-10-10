import type { ReactNode } from "react";
import { GlassPanel } from "./GlassPanel";

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <GlassPanel className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 p-8 text-center animate-fade-up">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="text-sm text-ink-muted">{body}</p>}
      {action}
    </GlassPanel>
  );
}
