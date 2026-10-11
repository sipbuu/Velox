import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Download, Layers3, Search, Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";

const LINKS = [
  { to: "/search", label: "Search", icon: Search },
  { to: "/guide", label: "TV Guide", icon: CalendarDays },
  { to: "/downloads", label: "Downloads", icon: Download },
  { to: "/sources", label: "Sources & Accounts", icon: Layers3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function MorePage() {
  return (
    <div className="animate-fade-up">
      <PageHeader title="More" />
      <GlassPanel className="divide-y divide-ink/5 overflow-hidden">
        {LINKS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex items-center gap-3 px-4 py-3.5 active:bg-ink/5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
              <Icon size={17} />
            </span>
            <span className="flex-1 font-medium">{label}</span>
            <ChevronRight size={18} className="text-ink-faint" />
          </Link>
        ))}
      </GlassPanel>
    </div>
  );
}
