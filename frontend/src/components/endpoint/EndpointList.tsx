import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useUpdateEndpoint } from "../../api/hooks";
import { HTTP_METHODS, type Endpoint } from "../../api/types";
import { cn } from "../../lib/cn";
import { methodStyle } from "../../lib/http";
import { MethodBadge, TONE_CLASSES } from "../Badges";
import { Switch } from "../Switch";
import { Tooltip } from "../Tooltip";
import { Button, EmptyState, Skeleton } from "../ui";
import { PathText } from "./PathText";
import { statusTone } from "../../lib/http";

function groupKey(path: string) {
  const first = path.split("/").filter(Boolean)[0];
  return first && !first.startsWith(":") ? first : "/";
}

export function EndpointList({
  endpoints,
  loading,
  selectedId,
  creating,
  onSelect,
  onNew,
}: {
  endpoints: Endpoint[] | undefined;
  loading: boolean;
  selectedId: number | null;
  creating: boolean;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const update = useUpdateEndpoint();

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = (endpoints ?? []).filter(
      (e) =>
        (!method || e.method === method) &&
        (!term || `${e.method} ${e.path} ${e.name}`.toLowerCase().includes(term)),
    );
    const map = new Map<string, Endpoint[]>();
    for (const e of filtered) {
      const k = groupKey(e.path);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [endpoints, q, method]);

  const toggle = (e: Endpoint, enabled: boolean) =>
    update.mutate(
      { id: e.id, body: { enabled } },
      {
        onSuccess: () => toast.success(`${e.method} ${e.path} ${enabled ? "enabled" : "disabled"}`),
        onError: (err) => toast.error(err.message),
      },
    );

  const methodsPresent = new Set(endpoints?.map((e) => e.method));

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-ink-700 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter endpoints"
            aria-label="Filter endpoints"
            className="field pl-8 pr-7"
          />
          {q && (
            <button aria-label="Clear filter" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {HTTP_METHODS.filter((m) => methodsPresent.has(m)).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(method === m ? null : m)}
              aria-pressed={method === m}
              className={cn(
                "h-5 rounded px-1.5 font-mono text-[10px] font-bold tracking-wide ring-1 ring-inset transition-all",
                method === m ? cn(methodStyle(m).text, methodStyle(m).bg, methodStyle(m).ring) : "text-fg-faint ring-ink-600 hover:text-fg-subtle",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="mx-1 my-2 h-9" />)}
        {creating && (
          <div className="mb-2 flex h-11 items-center gap-2.5 rounded-lg border border-brand-400/40 bg-brand-400/5 px-2.5 text-[12.5px] text-brand-300 animate-fade-in">
            <Plus className="size-3.5" /> New endpoint (unsaved)
          </div>
        )}
        {!loading && endpoints?.length === 0 && !creating && (
          <EmptyState
            compact
            title="No endpoints"
            description="Add your first route, e.g. GET /users"
            action={
              <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={onNew}>
                New endpoint
              </Button>
            }
          />
        )}
        {!loading && endpoints && endpoints.length > 0 && groups.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-fg-subtle">No endpoints match.</div>
        )}
        {groups.map(([group, items]) => (
          <div key={group} className="mb-2">
            <div className="flex items-center gap-2 px-2.5 pb-1 pt-2">
              <span className="font-mono text-[10.5px] font-medium text-fg-faint">/{group === "/" ? "" : group}</span>
              <span className="h-px flex-1 bg-ink-700/70" />
            </div>
            {items.map((e) => {
              const active = e.scenarios.find((s) => s.name === e.active_scenario) ?? e.scenarios[0];
              const tone = TONE_CLASSES[statusTone(active?.status_code ?? 200)];
              const selected = e.id === selectedId;
              return (
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(e.id)}
                  onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onSelect(e.id))}
                  className={cn(
                    "group relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400/40",
                    selected ? "bg-ink-750" : "hover:bg-ink-800",
                    !e.enabled && "opacity-55",
                  )}
                >
                  {selected && <span className="absolute -left-2 top-2 h-[calc(100%-16px)] w-[3px] rounded-r-full bg-brand-400" />}
                  <MethodBadge method={e.method} />
                  <div className="min-w-0 flex-1">
                    <PathText path={e.path} className="block truncate text-[12px] text-fg" />
                    <div className="flex items-center gap-1.5 truncate text-[11px] text-fg-subtle">
                      <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
                      <span className="font-mono">{active?.status_code}</span>
                      <span className="truncate">{e.active_scenario}</span>
                      {e.failure_rate > 0 && (
                        <Tooltip content={`${Math.round(e.failure_rate * 100)}% random failures`}>
                          <span className="rounded bg-err/10 px-1 font-mono text-[9.5px] text-err">{Math.round(e.failure_rate * 100)}%</span>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  <Tooltip content={e.enabled ? "Live — click to disable" : "Disabled — returns 404"}>
                    <span>
                      <Switch size="sm" checked={e.enabled} onCheckedChange={(v) => toggle(e, v)} label={`Enable ${e.method} ${e.path}`} />
                    </span>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
