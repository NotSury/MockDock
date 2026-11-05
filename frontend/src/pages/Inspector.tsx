import { ArrowUpRight, Eraser, FlaskConical, Pause, Play, ScrollText, Search, Terminal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useClearLogs, useInfo, useLog, useLogs, useProjects } from "../api/hooks";
import type { LogDetail } from "../api/types";
import { LatencyText, MethodBadge, StatusBadge } from "../components/Badges";
import { CodeView } from "../components/CodeView";
import { useConfirm } from "../components/Confirm";
import { CopyButton } from "../components/CopyButton";
import { Tooltip } from "../components/Tooltip";
import { Button, EmptyState, IconButton, Skeleton } from "../components/ui";
import { cn } from "../lib/cn";
import { replayableHeaders, toCurl } from "../lib/curl";
import { formatDateTime, formatTime, timeAgo } from "../lib/format";
import { HTTP_METHODS } from "../api/types";
import { mockBaseUrl, methodStyle } from "../lib/http";

const STATUS_FILTERS = ["2xx", "3xx", "4xx", "5xx"] as const;

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function HeaderTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (!entries.length) return <p className="text-[12px] text-fg-faint">No headers</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-ink-700">
      <table className="w-full text-[11.5px]">
        <tbody className="divide-y divide-ink-700/70">
          {entries.map(([k, v]) => (
            <tr key={k} className="hover:bg-ink-800/50">
              <td className={cn("w-[38%] px-3 py-1.5 align-top font-mono", k.startsWith("x-mockdock") ? "text-brand-300" : "text-fg-subtle")}>{k}</td>
              <td className={cn("break-all px-3 py-1.5 font-mono", v.includes("[REDACTED]") ? "text-warn" : "text-fg-muted")}>
                {v}
                {v.includes("[REDACTED]") && (
                  <Tooltip content="Sensitive values are never stored">
                    <span className="ml-2 rounded bg-warn/10 px-1 py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide text-warn">redacted</span>
                  </Tooltip>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="eyebrow">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function LogDetailPanel({ log, base, onClose }: { log: LogDetail; base: string; onClose: () => void }) {
  const navigate = useNavigate();
  const fullUrl = `${base}/${log.project_slug}${log.path === "/" ? "" : log.path}${log.query_string ? `?${log.query_string}` : ""}`;
  const replayHeaders = replayableHeaders(log.request_headers);
  const curl = toCurl(log.method, fullUrl, replayHeaders, log.request_body);

  return (
    <div className="flex h-full min-h-0 flex-col animate-fade-in">
      <div className="border-b border-ink-700 px-5 py-4">
        <div className="flex items-start gap-3">
          <MethodBadge method={log.method} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="break-all font-mono text-[13px] text-fg">
              <span className="text-fg-faint">/mock/{log.project_slug}</span>
              {log.path}
              {log.query_string && <span className="text-fg-subtle">?{log.query_string}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <StatusBadge status={log.response_status} showText />
              <LatencyText ms={log.duration_ms} />
              {log.simulated_failure && <span className="rounded bg-err/10 px-1.5 py-0.5 text-[10.5px] font-medium text-err">Simulated failure</span>}
              {!log.matched && <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[10.5px] font-medium text-warn">No matching endpoint</span>}
            </div>
          </div>
          <IconButton label="Close details" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<FlaskConical className="size-3.5" />}
            onClick={() =>
              navigate("/tester", {
                state: {
                  method: log.method,
                  url: fullUrl,
                  headers: Object.entries(replayHeaders).map(([key, value]) => ({ key, value, enabled: true })),
                  body: log.request_body,
                },
              })
            }
          >
            Replay in tester
          </Button>
          <CopyAsCurl curl={curl} />
          {log.endpoint_id && log.project_id && (
            <Link to={`/projects/${log.project_id}/endpoints/${log.endpoint_id}`}>
              <Button size="sm" variant="ghost" icon={<ArrowUpRight className="size-3.5" />}>
                Edit endpoint
              </Button>
            </Link>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-ink-700 bg-ink-850 p-4 text-[12px] sm:grid-cols-3">
          {[
            ["Received", formatDateTime(log.created_at)],
            ["Project", log.project_slug],
            ["Matched route", log.endpoint_path || "—"],
            ["Scenario", log.scenario_name || "—"],
            ["Duration", `${log.duration_ms.toFixed(2)} ms`],
            ["Client", log.client || "—"],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] text-fg-faint">{k}</dt>
              <dd className="truncate font-mono text-fg-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <Section title="Request headers">
          <HeaderTable headers={log.request_headers} />
        </Section>
        <Section title="Request body" aside={log.request_body && <CopyButton value={log.request_body} size="xs" label="Copy request body" />}>
          {log.request_body ? <CodeView text={log.request_body} /> : <p className="text-[12px] text-fg-faint">No body</p>}
        </Section>
        <Section title="Response headers">
          <HeaderTable headers={log.response_headers} />
        </Section>
        <Section title="Response body" aside={log.response_body && <CopyButton value={log.response_body} size="xs" label="Copy response body" />}>
          {log.response_body ? <CodeView text={log.response_body} /> : <p className="text-[12px] text-fg-faint">Empty response</p>}
        </Section>
      </div>
    </div>
  );
}

function CopyAsCurl({ curl }: { curl: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<Terminal className="size-3.5" />}
      onClick={async () => {
        await navigator.clipboard?.writeText(curl).catch(() => {});
        toast.success("cURL command copied");
      }}
    >
      Copy as cURL
    </Button>
  );
}

export function InspectorPage() {
  const [params, setParams] = useSearchParams();
  const info = useInfo();
  const base = mockBaseUrl(info.data?.mock_base_url);
  const projects = useProjects();
  const confirm = useConfirm();
  const clear = useClearLogs();

  const [q, setQ] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState(false);
  const [live, setLive] = useState(true);
  const [limit, setLimit] = useState(100);
  const projectId = params.get("project") ? Number(params.get("project")) : undefined;
  const selectedId = params.get("log") ? Number(params.get("log")) : null;
  const dq = useDebounced(q);

  const query = useMemo(
    () => ({ project_id: projectId, method: method ?? undefined, status: status ?? undefined, q: dq || undefined, matched: unmatched ? false : undefined, limit }),
    [projectId, method, status, dq, unmatched, limit],
  );
  const logs = useLogs(query, live);
  const detail = useLog(selectedId);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const filtersActive = !!(q || method || status || unmatched || projectId);
  const items = logs.data?.items ?? [];

  const onClear = async () => {
    const scope = projectId ? projects.data?.find((p) => p.id === projectId)?.name : null;
    const ok = await confirm({
      title: scope ? `Clear request history for ${scope}?` : "Clear all request history?",
      description: "Logged requests are permanently removed. Endpoint configuration isn't affected.",
      confirmLabel: "Clear history",
      danger: true,
    });
    if (!ok) return;
    await clear.mutateAsync(projectId);
    setParam("log", null);
    toast.success("Request history cleared");
  };

  return (
    <div className="flex h-full min-h-0 flex-col animate-fade-in">
      <div className="border-b border-ink-700/70 px-5 pb-3 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-fg">Request Inspector</h1>
            <p className="text-[12px] text-fg-subtle">
              Every request to <span className="font-mono">/mock/*</span>, with credentials redacted.{" "}
              {logs.data && <span className="text-fg-faint">{logs.data.total.toLocaleString()} matching</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content={live ? "Pause live updates" : "Resume live updates"}>
              <Button size="sm" variant={live ? "outline" : "secondary"} onClick={() => setLive(!live)} icon={live ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}>
                {live ? (
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-brand-400 animate-pulse-dot" /> Live
                  </span>
                ) : (
                  "Paused"
                )}
              </Button>
            </Tooltip>
            <Button size="sm" variant="danger" icon={<Eraser className="size-3.5" />} onClick={onClear} disabled={!items.length && !filtersActive} loading={clear.isPending}>
              Clear
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search path, query or body" aria-label="Search requests" className="field pl-8" />
          </div>
          <select
            aria-label="Filter by project"
            value={projectId ?? ""}
            onChange={(e) => setParam("project", e.target.value || null)}
            className="field w-auto max-w-[180px] cursor-pointer pr-7"
          >
            <option value="">All projects</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1" role="group" aria-label="Filter by method">
            {HTTP_METHODS.map((m) => (
              <button
                key={m}
                aria-pressed={method === m}
                onClick={() => setMethod(method === m ? null : m)}
                className={cn(
                  "h-7 rounded-md px-2 font-mono text-[10.5px] font-bold ring-1 ring-inset transition-all",
                  method === m ? cn(methodStyle(m).text, methodStyle(m).bg, methodStyle(m).ring) : "text-fg-faint ring-ink-600 hover:text-fg-subtle",
                )}
              >
                {m === "DELETE" ? "DEL" : m}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                aria-pressed={status === s}
                onClick={() => setStatus(status === s ? null : s)}
                className={cn(
                  "h-7 rounded-md px-2 font-mono text-[11px] font-semibold ring-1 ring-inset transition-all",
                  status === s ? "bg-ink-600 text-fg ring-ink-500" : "text-fg-faint ring-ink-600 hover:text-fg-subtle",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <label className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-[12px] text-fg-subtle ring-1 ring-inset ring-ink-600 hover:text-fg-muted">
            <input type="checkbox" checked={unmatched} onChange={(e) => setUnmatched(e.target.checked)} className="size-3.5 accent-brand-400" />
            Unmatched only
          </label>
          {filtersActive && (
            <button
              onClick={() => {
                setQ("");
                setMethod(null);
                setStatus(null);
                setUnmatched(false);
                setParam("project", null);
              }}
              className="text-[12px] text-fg-subtle hover:text-fg"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={cn("min-w-0 flex-1 overflow-y-auto", selectedId !== null && "hidden lg:block")}>
          {logs.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<ScrollText />}
              title={filtersActive ? "No requests match these filters" : "No requests recorded yet"}
              description={
                filtersActive ? (
                  "Try widening the filters."
                ) : (
                  <>
                    Call any mock URL — for example{" "}
                    <span className="font-mono text-fg-muted">curl {base}/shop/products</span> — and it appears here instantly.
                  </>
                )
              }
              action={
                !filtersActive && (
                  <Link to="/tester">
                    <Button variant="primary" icon={<FlaskConical className="size-3.5" />}>
                      Open API tester
                    </Button>
                  </Link>
                )
              }
            />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur">
                <tr className="border-b border-ink-700 text-left text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
                  <th className="w-[96px] px-4 py-2 font-semibold">Time</th>
                  <th className="w-[64px] py-2 font-semibold">Method</th>
                  <th className="py-2 font-semibold">Path</th>
                  <th className="w-[80px] py-2 font-semibold">Status</th>
                  <th className="hidden w-[90px] py-2 text-right font-semibold sm:table-cell">Duration</th>
                  <th className="hidden w-[150px] py-2 pl-5 pr-4 font-semibold xl:table-cell">Scenario</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setParam("log", String(r.id))}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setParam("log", String(r.id))}
                    aria-selected={r.id === selectedId}
                    className={cn(
                      "cursor-pointer border-b border-ink-700/50 outline-none transition-colors focus-visible:bg-ink-800",
                      r.id === selectedId ? "bg-ink-750" : "hover:bg-ink-800/70",
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-fg-subtle">
                      <Tooltip content={`${formatDateTime(r.created_at)} · ${timeAgo(r.created_at)}`}>
                        <span>{formatTime(r.created_at)}</span>
                      </Tooltip>
                    </td>
                    <td className="py-2">
                      <MethodBadge method={r.method} />
                    </td>
                    <td className="max-w-0 py-2 pr-3">
                      <div className="truncate font-mono text-[12px] text-fg-muted">
                        <span className="text-fg-faint">/{r.project_slug}</span>
                        {r.path}
                        {r.query_string && <span className="text-fg-faint">?{r.query_string}</span>}
                      </div>
                    </td>
                    <td className="py-2">
                      <StatusBadge status={r.response_status} />
                    </td>
                    <td className="hidden py-2 text-right sm:table-cell">
                      <LatencyText ms={r.duration_ms} />
                    </td>
                    <td className="hidden max-w-0 py-2 pl-5 pr-4 xl:table-cell">
                      <span className={cn("block truncate text-[11.5px]", r.simulated_failure ? "text-err" : r.matched ? "text-fg-subtle" : "text-warn")}>
                        {r.matched ? r.scenario_name : "unmatched"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {logs.data && logs.data.total > items.length && (
            <div className="p-4 text-center">
              <Button size="sm" variant="outline" onClick={() => setLimit((l) => Math.min(500, l + 100))} disabled={limit >= 500}>
                {limit >= 500 ? "Showing the latest 500 — narrow the filters to see older" : `Load more (${(logs.data.total - items.length).toLocaleString()} older)`}
              </Button>
            </div>
          )}
        </div>

        {selectedId !== null && (
          <aside className="w-full min-w-0 border-l border-ink-700/70 bg-ink-950/30 lg:w-[480px] xl:w-[560px]">
            {detail.isPending ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-24" />
                <Skeleton className="h-40" />
              </div>
            ) : detail.isError ? (
              <EmptyState title="Request not found" description="It may have been cleared or pruned." action={<Button size="sm" onClick={() => setParam("log", null)}>Close</Button>} />
            ) : (
              <LogDetailPanel log={detail.data} base={base} onClose={() => setParam("log", null)} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
