import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, Clapperboard, Download, Heart, Home, Layers, LayoutGrid, Search, Settings, Tv } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/live", label: "Live TV", icon: Tv },
  { to: "/guide", label: "TV Guide", icon: CalendarDays },
  { to: "/movies", label: "Movies", icon: Clapperboard },
  { to: "/series", label: "Series", icon: Layers },
  { to: "/favorites", label: "Favorites", icon: Heart },
  { to: "/search", label: "Search", icon: Search },
  { to: "/downloads", label: "Downloads", icon: Download },
  { to: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV = [
  ...NAV.filter((n) => ["/", "/live", "/movies", "/series", "/favorites"].includes(n.to)),
  { to: "/more", label: "More", icon: LayoutGrid, end: false },
];

export function AppShell() {
  return (
    <div className="flex min-h-full">
      <div data-tauri-drag-region className="titlebar-drag fixed inset-x-0 top-0 z-50 hidden h-7" />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 p-3 md:block">
        <nav className="sidebar-nav glass flex h-full flex-col gap-1 rounded-glass-xl p-3 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div data-tauri-drag-region className="mb-4 flex items-center gap-2.5 px-2">
            <img src="./velox.svg" alt="" className="h-8 w-8 rounded-[10px] shadow-glass-sm" />
            <span className="text-lg font-bold tracking-tight">Velox</span>
          </div>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ease-spring",
                  isActive ? "bg-accent text-accent-contrast shadow-accent-glow" : "text-ink-muted hover:bg-glass-strong/60 hover:text-ink",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          <div className="flex-1" />
          <NavLink to="/sources" className="btn-glass justify-start rounded-xl text-ink-muted">
            Sources & Accounts
          </NavLink>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pb-10 md:pt-8">
        <Outlet />
      </main>

      <nav className="glass-strong fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 flex justify-around gap-0.5 rounded-full px-1.5 py-1.5 md:hidden">
        {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] font-medium transition-all duration-200 ease-spring active:scale-90",
                isActive ? "bg-accent/15 text-accent" : "text-ink-faint",
              )
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
