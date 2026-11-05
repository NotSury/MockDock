import {
  Activity,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  Menu as MenuIcon,
  Plus,
  ScrollText,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useHealth, useInfo, useProjects } from "../api/hooks";
import { cn } from "../lib/cn";
import { Logo } from "./Logo";
import { Tooltip } from "./Tooltip";
import { useCommandPalette } from "./CommandPalette";
import { Kbd } from "./ui";
import { useNewProjectDialog } from "./ProjectDialogs";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tester", label: "API Tester", icon: FlaskConical },
  { to: "/inspector", label: "Request Inspector", icon: ScrollText },
];

const PROJECT_COLORS = ["#2dd4bf", "#60a5fa", "#c084fc", "#fbbf24", "#fb7185", "#4ade80", "#f472b6", "#38bdf8"];
export const projectColor = (id: number) => PROJECT_COLORS[id % PROJECT_COLORS.length];

function ServerStatus() {
  const health = useHealth();
  const info = useInfo();
  const online = health.isSuccess;
  const host = info.data?.mock_base_url.replace(/^https?:\/\//, "").replace(/\/mock$/, "");
  return (
    <Tooltip
      side="right"
      content={online ? `Mock server reachable at ${info.data?.mock_base_url ?? ""}` : "Backend unreachable — run the API server"}
    >
      <div className="flex items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            online ? "bg-brand-400 animate-pulse-dot" : health.isPending ? "bg-fg-faint" : "bg-err",
          )}
        />
        <div className="min-w-0 leading-tight">
          <div className="text-[11.5px] font-medium text-fg-muted">
            {online ? "Mock server live" : health.isPending ? "Connecting…" : "Server offline"}
          </div>
          <div className="truncate font-mono text-[10.5px] text-fg-faint">{host ?? "—"}</div>
        </div>
      </div>
    </Tooltip>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const projects = useProjects();
  const openNewProject = useNewProjectDialog();
  const palette = useCommandPalette();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={palette.open}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 text-[12.5px] text-fg-subtle transition-colors hover:border-ink-600 hover:text-fg-muted"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" strokeLinecap="round" />
          </svg>
          <span className="flex-1 text-left">Search & jump…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav className="space-y-0.5 px-3 py-2" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                isActive ? "bg-ink-750 text-fg" : "text-fg-subtle hover:bg-ink-800 hover:text-fg-muted",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-3 top-1.5 h-5 w-[3px] rounded-r-full bg-brand-400" />}
                <Icon className={cn("size-4", isActive ? "text-brand-400" : "text-fg-faint group-hover:text-fg-subtle")} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-3 flex items-center justify-between px-5 pb-1.5">
        <span className="eyebrow">Projects</span>
        <Tooltip content="New project">
          <button
            onClick={openNewProject}
            aria-label="New project"
            className="grid size-5 place-items-center rounded text-fg-faint hover:bg-ink-700 hover:text-fg"
          >
            <Plus className="size-3.5" />
          </button>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {projects.isPending &&
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton mx-1 my-1.5 h-5" />)}
        {projects.data?.map((p) => (
          <NavLink
            key={p.id}
            to={`/projects/${p.id}`}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] transition-colors",
                isActive ? "bg-ink-750 text-fg" : "text-fg-subtle hover:bg-ink-800 hover:text-fg-muted",
              )
            }
          >
            <span className="size-2 shrink-0 rounded-[3px]" style={{ background: projectColor(p.id) }} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="font-mono text-[10.5px] tabular-nums text-fg-faint">{p.endpoint_count}</span>
          </NavLink>
        ))}
        {projects.data?.length === 0 && (
          <button
            onClick={openNewProject}
            className="w-full rounded-lg border border-dashed border-ink-600 px-3 py-3 text-left text-[12px] text-fg-subtle hover:border-ink-500 hover:text-fg-muted"
          >
            No projects yet. <span className="text-brand-400">Create one →</span>
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-ink-700/70 p-3">
        <ServerStatus />
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-[248px] shrink-0 border-r border-ink-700/70 bg-ink-950/60 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[264px] border-r border-ink-700 bg-ink-900 animate-slide-up">
            <button
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3.5 grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-ink-700"
            >
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-700/70 px-4 lg:hidden">
          <button
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-ink-700"
          >
            <MenuIcon className="size-4" />
          </button>
          <Logo />
          <div className="flex-1" />
          <Activity className="size-4 text-fg-faint" />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
