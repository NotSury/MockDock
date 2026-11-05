import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  FileJson,
  FlaskConical,
  Gauge,
  Plus,
  Radio,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useInfo, useProjects, useRestoreSample, useStats } from "../api/hooks";
import type { Stats, StatsRange } from "../api/types";
import { ActivityChart, ChartLegend, STATUS_SERIES } from "../components/ActivityChart";
import { LatencyText, MethodBadge, StatusBadge } from "../components/Badges";
import { projectColor } from "../components/Layout";
import { useProjectDialogs } from "../components/ProjectDialogs";
import { Tooltip } from "../components/Tooltip";
import { Button, EmptyState, PageHeader, SegmentedControl, Skeleton } from "../components/ui";
import { cn } from "../lib/cn";
import { formatMs, formatNumber, formatPercent, timeAgo } from "../lib/format";
import { generateTraffic } from "../lib/traffic";

function StatTile({
  label,
  value,
  sub,
  icon,
  tooltip,
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  tooltip?: string;
  loading?: boolean;
}) {
  return (
    <div className="panel group relative overflow-hidden p-4 transition-colors hover:border-ink-600">
      <div className="flex items-center justify-between">
        <Tooltip content={tooltip}>
          <span className="text-[12px] font-medium text-fg-subtle">{label}</span>
        </Tooltip>
        <span className="text-fg-faint transition-colors group-hover:text-brand-400 [&_svg]:size-4">{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-20" />
      ) : (
        <div className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] text-fg tabular-nums animate-fade-in">
          {value}
        </div>
      )}
      <div className="mt-2 h-4 text-[11.5px] text-fg-faint">{sub}</div>
    </div>
  );
}

function StatusBreakdown({ stats }: { stats: Stats }) {
  const total = Object.values(stats.status_classes).reduce((a, b) => a + b, 0);
  const methods = Object.entries(stats.methods).sort((a, b) => b[1] - a[1]);
  const methodTotal = methods.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2.5 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-ink-700">
          {total > 0 &&
            STATUS_SERIES.map((s) => {
              const v = stats.status_classes[s.label] ?? 0;
              return v ? (
                <Tooltip key={s.key} content={`${s.label}: ${v} (${formatPercent(v / total)})`}>
                  <div className="h-full transition-all duration-500" style={{ width: `${(v / total) * 100}%`, background: s.color }} />
                </Tooltip>
              ) : null;
            })}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {STATUS_SERIES.map((s) => {
            const v = stats.status_classes[s.label] ?? 0;
            return (
              <div key={s.key} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2 text-fg-subtle">
                  <span className="size-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-mono tabular-nums text-fg-muted">
                  {v}
                  <span className="ml-1.5 text-fg-faint">{total ? formatPercent(v / total) : "—"}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2.5">By method</div>
        {methods.length === 0 && <div className="text-[12px] text-fg-faint">No traffic in this window.</div>}
        <div className="space-y-2">
          {methods.map(([m, v]) => (
            <div key={m} className="flex items-center gap-3">
              <MethodBadge method={m} />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full bg-fg-subtle/60 transition-all duration-500" style={{ width: `${(v / methodTotal) * 100}%` }} />
              </div>
              <span className="w-8 text-right font-mono text-[11.5px] tabular-nums text-fg-muted">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  description,
  onClick,
  loading,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-all hover:border-ink-600 hover:bg-ink-800 disabled:opacity-60"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-ink-600 bg-ink-800 text-fg-muted transition-colors group-hover:border-brand-400/40 group-hover:text-brand-400 [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium text-fg">{title}</span>
        <span className="block truncate text-[11.5px] text-fg-subtle">{description}</span>
      </span>
      <ArrowRight className="size-3.5 text-fg-faint opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
    </button>
  );
}

export function DashboardPage() {
  const [range, setRange] = useState<StatsRange>("24h");
  const stats = useStats(range);
  const projects = useProjects();
  const info = useInfo();
  const dialogs = useProjectDialogs();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const restore = useRestoreSample();
  const [generating, setGenerating] = useState(false);
  const s = stats.data;

  const firstProject = projects.data?.find((p) => p.endpoint_count > 0);

  const runTraffic = async () => {
    if (!firstProject) return toast.error("Create an endpoint first — there's nothing to call yet.");
    setGenerating(true);
    const n = await generateTraffic(firstProject.id, firstProject.slug);
    setGenerating(false);
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["logs"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    toast.success(`Sent ${n} requests to ${firstProject.name}`, { description: "Watch them land in the inspector." });
  };

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-7 sm:px-8 animate-slide-up">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description={
          <>
            Live traffic across every project, served from{" "}
            <span className="font-mono text-fg-muted">{info.data?.mock_base_url ?? "…"}</span>
          </>
        }
        actions={
          <>
            <SegmentedControl
              ariaLabel="Time range"
              value={range}
              onChange={setRange}
              options={[
                { value: "1h", label: "1h" },
                { value: "24h", label: "24h" },
                { value: "7d", label: "7d" },
              ]}
            />
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={dialogs.openNew}>
              New project
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Requests"
          icon={<Radio />}
          loading={!s}
          value={s ? formatNumber(s.requests_in_range) : ""}
          sub={s && `${formatNumber(s.requests_total)} retained in total`}
          tooltip="Mock requests received in the selected window"
        />
        <StatTile
          label="Avg latency"
          icon={<Gauge />}
          loading={!s}
          value={s ? formatMs(s.avg_latency_ms) : ""}
          sub={s && `p95 ${formatMs(s.p95_latency_ms)}`}
          tooltip="Server-side time to answer, including simulated delays"
        />
        <StatTile
          label="Error rate"
          icon={<ShieldAlert />}
          loading={!s}
          value={s ? formatPercent(s.error_rate) : ""}
          sub={s && `${s.unmatched} unmatched request${s.unmatched === 1 ? "" : "s"}`}
          tooltip="Share of 4xx and 5xx responses, including simulated errors"
        />
        <StatTile
          label="Endpoints"
          icon={<Boxes />}
          loading={!s}
          value={s ? s.endpoints : ""}
          sub={s && `${s.enabled_endpoints} live · ${s.projects} project${s.projects === 1 ? "" : "s"}`}
          tooltip="Configured mock endpoints"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_320px]">
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[13.5px] font-semibold text-fg">API activity</h2>
              <p className="text-[11.5px] text-fg-subtle">Requests per interval, stacked by response class</p>
            </div>
            <ChartLegend />
          </div>
          {s ? <ActivityChart buckets={s.timeline} range={range} /> : <Skeleton className="h-[200px]" />}
        </section>
        <section className="panel p-5">
          <h2 className="mb-4 text-[13.5px] font-semibold text-fg">HTTP responses</h2>
          {s ? <StatusBreakdown stats={s} /> : <Skeleton className="h-40" />}
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_320px]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[13.5px] font-semibold text-fg">Recent requests</h2>
              <span className="flex items-center gap-1.5 rounded-full bg-brand-400/10 px-2 py-0.5 text-[10.5px] font-medium text-brand-300">
                <span className="size-1.5 rounded-full bg-brand-400 animate-pulse-dot" /> Live
              </span>
            </div>
            <Link to="/inspector" className="flex items-center gap-1 text-[12px] text-fg-subtle hover:text-fg">
              Open inspector <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          {!s ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7" />
              ))}
            </div>
          ) : s.recent.length === 0 ? (
            <EmptyState
              compact
              icon={<Zap />}
              title="No requests yet"
              description="Call any mock URL, use the API tester, or generate some demo traffic."
              action={
                <Button size="sm" icon={<Sparkles className="size-3.5" />} onClick={runTraffic} loading={generating}>
                  Generate demo traffic
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {s.recent.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => navigate(`/inspector?log=${r.id}`)}
                    className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-ink-800/70"
                  >
                    <MethodBadge method={r.method} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg-muted">
                      <span className="text-fg-faint">/{r.project_slug}</span>
                      {r.path}
                      {r.query_string && <span className="text-fg-faint">?{r.query_string}</span>}
                    </span>
                    {r.simulated_failure && (
                      <Tooltip content="Random failure simulation triggered">
                        <span className="rounded bg-err/10 px-1.5 py-0.5 text-[10px] font-medium text-err">simulated</span>
                      </Tooltip>
                    )}
                    <StatusBadge status={r.response_status} />
                    <LatencyText ms={r.duration_ms} className="hidden w-16 text-right sm:block" />
                    <span className="hidden w-16 text-right text-[11px] text-fg-faint md:block">{timeAgo(r.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-3">
          <section className="panel p-2">
            <div className="px-3 pb-1 pt-2.5 eyebrow">Quick actions</div>
            <QuickAction icon={<Plus />} title="Create a project" description="Group endpoints under one URL prefix" onClick={dialogs.openNew} />
            <QuickAction icon={<FlaskConical />} title="Open API tester" description="Send a real request to any mock" onClick={() => navigate("/tester")} />
            <QuickAction icon={<Sparkles />} title="Generate demo traffic" description="Fire a burst of requests at a project" onClick={runTraffic} loading={generating} />
            <QuickAction icon={<FileJson />} title="Import a project" description="Load a .mockdock.json export" onClick={dialogs.openImport} />
          </section>

          {s && s.top_endpoints.length > 0 && (
            <section className="panel p-4">
              <h2 className="mb-3 text-[13px] font-semibold text-fg">Busiest endpoints</h2>
              <ol className="space-y-2">
                {s.top_endpoints.map((t) => (
                  <li key={t.endpoint_id} className="flex items-center gap-2.5">
                    <MethodBadge method={t.method} variant="text" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-muted">{t.path}</span>
                    <span className="font-mono text-[11.5px] tabular-nums text-fg-subtle">{t.hits}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-fg">Projects</h2>
          <Link to="/projects" className="flex items-center gap-1 text-[12px] text-fg-subtle hover:text-fg">
            View all <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {projects.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : projects.data?.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<Boxes />}
              title="No projects yet"
              description="Create a project to start mocking, or bring back the Acme Shop sample API."
              action={
                <div className="flex gap-2">
                  <Button variant="primary" onClick={dialogs.openNew}>
                    New project
                  </Button>
                  <Button
                    loading={restore.isPending}
                    onClick={() => restore.mutate(undefined, { onSuccess: (p) => navigate(`/projects/${p.id}`) })}
                  >
                    Restore sample
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data?.slice(0, 6).map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="panel group relative overflow-hidden p-4 transition-all hover:-translate-y-px hover:border-ink-600"
              >
                <div className="absolute inset-x-0 top-0 h-px opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${projectColor(p.id)}, transparent)` }} />
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: projectColor(p.id) }} />
                  <span className="truncate text-[13.5px] font-semibold text-fg">{p.name}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[11.5px] text-fg-subtle">/mock/{p.slug}</div>
                <div className={cn("mt-4 flex items-center gap-4 text-[11.5px] text-fg-subtle")}>
                  <span>
                    <span className="font-semibold text-fg-muted">{p.endpoint_count}</span> endpoints
                  </span>
                  <span>
                    <span className="font-semibold text-fg-muted">{formatNumber(p.request_count)}</span> requests
                  </span>
                  <ArrowRight className="ml-auto size-3.5 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
