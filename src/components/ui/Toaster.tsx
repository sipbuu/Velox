import { X } from "lucide-react";
import { useUi } from "@/store/ui";

export function Toaster() {
  const { toasts, dismissToast } = useUi();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[80] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <div key={t.id} className="glass-strong pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-glass p-3 pl-4 animate-fade-up">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{t.title}</p>
            {t.body && <p className="truncate text-xs text-ink-muted">{t.body}</p>}
          </div>
          {t.action && (
            <button
              className="btn-primary !px-3 !py-1.5"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button aria-label="Dismiss" className="grid h-7 w-7 place-items-center rounded-full hover:bg-ink/10" onClick={() => dismissToast(t.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
