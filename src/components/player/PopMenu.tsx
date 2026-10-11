import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  label: string;
  icon: ReactNode;
  active?: boolean;
  badge?: string;
  children: (close: () => void) => ReactNode;
}

export function PopMenu({ label, icon, active, badge, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={label}
        className={cn("relative grid h-9 w-9 place-items-center rounded-full hover:bg-white/10", active && "text-accent")}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {badge && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-accent px-1 text-[9px] font-bold leading-4 text-white">{badge}</span>}
      </button>
      {open && (
        <div className="glass-dark absolute bottom-12 right-0 z-20 max-h-[60vh] w-56 overflow-y-auto rounded-glass p-2 text-sm animate-fade-up">
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-white/50">{label}</p>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuRow({ label, hint, active, onClick }: { label: string; hint?: string; active?: boolean; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10" onClick={onClick}>
      <Check size={14} className={active ? "opacity-100" : "opacity-0"} />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[11px] text-white/40">{hint}</span>}
    </button>
  );
}
