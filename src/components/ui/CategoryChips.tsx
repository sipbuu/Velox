import type { Category } from "@/types/media";
import { cn } from "@/lib/cn";

interface Props {
  categories: Category[];
  value?: string;
  onChange: (id?: string) => void;
}

export function CategoryChips({ categories, value, onChange }: Props) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <Chip active={!value} onClick={() => onChange(undefined)}>
        All
      </Chip>
      {categories.map((c) => (
        <Chip key={`${c.sourceId}::${c.id}`} active={value === `${c.sourceId}::${c.id}`} onClick={() => onChange(`${c.sourceId}::${c.id}`)}>
          {c.name}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 ease-spring active:scale-95",
        active ? "bg-ink text-canvas shadow-glass-sm" : "glass-pill text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
