import * as RD from "@radix-ui/react-dialog";
import { useQueries } from "@tanstack/react-query";
import { CornerDownLeft, FileJson, FlaskConical, FolderKanban, LayoutDashboard, Plus, ScrollText, Search } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { qk, useProjects } from "../api/hooks";
import { cn } from "../lib/cn";
import { MethodBadge } from "./Badges";
import { useProjectDialogs } from "./ProjectDialogs";

interface PaletteCtx {
  open: () => void;
}
const Ctx = createContext<PaletteCtx>({ open() {} });
export const useCommandPalette = () => useContext(Ctx);

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const dialogs = useProjectDialogs();
  const projects = useProjects();
  const endpointQueries = useQueries({
    queries: (projects.data ?? []).map((p) => ({
      queryKey: qk.endpoints(p.id),
      queryFn: () => api.listEndpoints(p.id),
    })),
  });
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const go = (to: string) => () => {
    onClose();
    navigate(to);
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [
      { id: "nav-dash", group: "Navigate", label: "Dashboard", icon: <LayoutDashboard />, run: go("/") },
      { id: "nav-proj", group: "Navigate", label: "Projects", icon: <FolderKanban />, run: go("/projects") },
      { id: "nav-test", group: "Navigate", label: "API Tester", icon: <FlaskConical />, run: go("/tester") },
      { id: "nav-insp", group: "Navigate", label: "Request Inspector", icon: <ScrollText />, keywords: "logs history", run: go("/inspector") },
      { id: "act-new", group: "Actions", label: "Create project", icon: <Plus />, run: () => { onClose(); dialogs.openNew(); } },
      { id: "act-imp", group: "Actions", label: "Import project from JSON", icon: <FileJson />, run: () => { onClose(); dialogs.openImport(); } },
    ];
    for (const p of projects.data ?? []) {
      out.push({
        id: `p-${p.id}`,
        group: "Projects",
        label: p.name,
        hint: `/mock/${p.slug}`,
        icon: <FolderKanban />,
        keywords: p.slug,
        run: go(`/projects/${p.id}`),
      });
    }
    endpointQueries.forEach((eq, i) => {
      const p = projects.data?.[i];
      if (!p) return;
      for (const e of eq.data ?? []) {
        out.push({
          id: `e-${e.id}`,
          group: "Endpoints",
          label: e.path,
          hint: e.name || p.name,
          icon: <MethodBadge method={e.method} variant="text" />,
          keywords: `${e.method} ${p.slug} ${p.name}`,
          run: go(`/projects/${p.id}/endpoints/${e.id}`),
        });
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data, endpointQueries.map((e) => e.dataUpdatedAt).join()]);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return items.filter((i) => i.group !== "Endpoints").concat(items.filter((i) => i.group === "Endpoints").slice(0, 8));
    return items.filter((i) => {
      const hay = `${i.label} ${i.hint ?? ""} ${i.keywords ?? ""} ${i.group}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [items, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";
  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="flex items-center gap-3 border-b border-ink-700 px-4">
        <Search className="size-4 text-fg-subtle" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              filtered[active]?.run();
            }
          }}
          placeholder="Search projects, endpoints, pages…"
          aria-label="Command search"
          className="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-faint"
        />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && <div className="px-3 py-8 text-center text-[12.5px] text-fg-subtle">No results for “{q}”</div>}
        {filtered.map((item, idx) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <div key={item.id}>
              {header && <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">{header}</div>}
              <button
                data-index={idx}
                onMouseMove={() => setActive(idx)}
                onClick={item.run}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[13px] [&>svg]:size-4",
                  idx === active ? "bg-ink-700 text-fg" : "text-fg-muted",
                )}
              >
                <span className="grid w-[38px] shrink-0 place-items-center text-fg-subtle [&_svg]:size-4">{item.icon}</span>
                <span className={cn("min-w-0 truncate", item.group === "Endpoints" && "font-mono text-[12.5px]")}>{item.label}</span>
                {item.hint && <span className="ml-auto truncate pl-3 text-[11.5px] text-fg-faint">{item.hint}</span>}
                {idx === active && <CornerDownLeft className="ml-2 size-3.5 shrink-0 text-fg-subtle" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <RD.Root open={open} onOpenChange={setOpen}>
        <RD.Portal>
          <RD.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] animate-fade-in" />
          <RD.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-ink-600 bg-ink-800 shadow-2xl shadow-black/60 animate-scale-in focus:outline-none">
            <RD.Title className="sr-only">Command palette</RD.Title>
            <RD.Description className="sr-only">Search and jump to pages, projects and endpoints</RD.Description>
            {open && <Palette onClose={() => setOpen(false)} />}
          </RD.Content>
        </RD.Portal>
      </RD.Root>
    </Ctx.Provider>
  );
}
