import {
  AlertTriangle,
  Copy as CopyIcon,
  FlaskConical,
  MoreHorizontal,
  Plus,
  Save,
  Shuffle,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ApiError } from "../../api/client";
import { useCreateEndpoint, useDeleteEndpoint, useDuplicateEndpoint, useUpdateEndpoint } from "../../api/hooks";
import type { Endpoint, EndpointInput, Project, ScenarioInput } from "../../api/types";
import { cn } from "../../lib/cn";
import { newScenario, statusTone, uniqueName, validatePath } from "../../lib/http";
import { validateJsonTemplate } from "../../lib/template";
import { TONE_CLASSES } from "../Badges";
import { CodeEditor } from "../CodeEditor";
import { useConfirm } from "../Confirm";
import { CopyButton } from "../CopyButton";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../Menu";
import { Switch } from "../Switch";
import { Tooltip } from "../Tooltip";
import { Button, CountBadge, IconButton, Kbd, Tabs } from "../ui";
import { MethodSelect } from "./MethodSelect";
import { ScenarioEditor } from "./ScenarioEditor";
import { StatusCodeInput } from "./StatusCodeInput";

type Tab = "responses" | "simulation" | "details";

const SCENARIO_PRESETS: { label: string; make: () => ScenarioInput }[] = [
  { label: "200 · Success", make: () => newScenario("Success", 200) },
  { label: "201 · Created", make: () => ({ ...newScenario("Created", 201), body: '{\n  "id": "{{uuid}}",\n  "created_at": "{{now}}"\n}' }) },
  { label: "204 · No content", make: () => newScenario("No content", 204) },
  { label: "400 · Bad request", make: () => ({ ...newScenario("Bad request", 400), body: '{\n  "error": {\n    "code": "bad_request",\n    "message": "The request was invalid."\n  }\n}' }) },
  { label: "401 · Unauthorized", make: () => ({ ...newScenario("Unauthorized", 401), body: '{\n  "error": {\n    "code": "unauthorized",\n    "message": "Missing or invalid credentials."\n  }\n}' }) },
  { label: "404 · Not found", make: () => ({ ...newScenario("Not found", 404), body: '{\n  "error": {\n    "code": "not_found",\n    "message": "Resource not found."\n  }\n}' }) },
  { label: "429 · Rate limited", make: () => ({ ...newScenario("Rate limited", 429), headers: [{ key: "Retry-After", value: "30" }], body: '{\n  "error": {\n    "code": "rate_limited",\n    "message": "Slow down."\n  }\n}' }) },
  { label: "500 · Server error", make: () => ({ ...newScenario("Server error", 500), body: '{\n  "error": {\n    "code": "internal_error",\n    "message": "Something went wrong."\n  }\n}' }) },
  { label: "Slow 200 (3s delay)", make: () => ({ ...newScenario("Slow response", 200), delay_ms: 3000 }) },
];

const FAILURE_STATUSES = [400, 401, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504];

export function toInput(e: Endpoint): EndpointInput {
  return {
    method: e.method,
    path: e.path,
    name: e.name,
    description: e.description,
    enabled: e.enabled,
    active_scenario: e.active_scenario,
    failure_rate: e.failure_rate,
    failure_status: e.failure_status,
    failure_body: e.failure_body,
    scenarios: e.scenarios.map(({ name, status_code, headers, body_type, body, delay_ms }) => ({
      name,
      status_code,
      headers: headers.map((h) => ({ key: h.key, value: h.value })),
      body_type,
      body,
      delay_ms,
    })),
  };
}

export function EndpointEditor({
  project,
  endpoint,
  initial,
  mockBase,
  onDirtyChange,
}: {
  project: Project;
  endpoint: Endpoint | null;
  initial: EndpointInput;
  mockBase: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const create = useCreateEndpoint(project.id);
  const update = useUpdateEndpoint();
  const remove = useDeleteEndpoint();
  const duplicate = useDuplicateEndpoint();

  const [saved, setSaved] = useState<EndpointInput>(initial);
  const [draft, setDraft] = useState<EndpointInput>(initial);
  const [tab, setTab] = useState<Tab>("responses");
  const [selected, setSelected] = useState(() =>
    Math.max(0, initial.scenarios.findIndex((s) => s.name === initial.active_scenario)),
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Keep in sync when the endpoint changes elsewhere (e.g. toggled in the list) and we have no local edits.
  useEffect(() => {
    if (!endpoint || dirty) return;
    const fresh = toInput(endpoint);
    if (JSON.stringify(fresh) !== JSON.stringify(saved)) {
      setSaved(fresh);
      setDraft(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint?.updated_at, endpoint?.enabled]);

  const set = (patch: Partial<EndpointInput>) => setDraft((d) => ({ ...d, ...patch }));
  const scenario = draft.scenarios[Math.min(selected, draft.scenarios.length - 1)];
  const sIndex = draft.scenarios.indexOf(scenario);

  const updateScenario = (i: number, s: ScenarioInput) => {
    setDraft((d) => {
      const prevName = d.scenarios[i].name;
      const scenarios = d.scenarios.map((x, idx) => (idx === i ? s : x));
      return { ...d, scenarios, active_scenario: d.active_scenario === prevName ? s.name : d.active_scenario };
    });
  };

  const addScenario = (make: () => ScenarioInput) => {
    const s = make();
    s.name = uniqueName(s.name, draft.scenarios.map((x) => x.name));
    setDraft((d) => ({ ...d, scenarios: [...d.scenarios, s] }));
    setSelected(draft.scenarios.length);
    setTab("responses");
  };

  const deleteScenario = (i: number) => {
    setDraft((d) => {
      const removed = d.scenarios[i];
      const scenarios = d.scenarios.filter((_, idx) => idx !== i);
      return { ...d, scenarios, active_scenario: d.active_scenario === removed.name ? scenarios[0].name : d.active_scenario };
    });
    setSelected(Math.max(0, i - 1));
  };

  // ---- validation (mirrors the backend for instant feedback) ----
  const pathError = validatePath(draft.path);
  const names = draft.scenarios.map((s) => s.name.trim().toLowerCase());
  const scenarioErrors = draft.scenarios.map((s, i) => {
    if (!s.name.trim()) return "Name is required.";
    if (names.indexOf(s.name.trim().toLowerCase()) !== i) return "Names must be unique.";
    if (!Number.isInteger(s.status_code) || s.status_code < 200 || s.status_code > 599) return "Status must be 200–599.";
    if (s.body_type === "json" && validateJsonTemplate(s.body)) return "Body is not valid JSON.";
    return null;
  });
  const firstScenarioError = scenarioErrors.findIndex(Boolean);
  const failureStatusInvalid = draft.failure_status < 400 || draft.failure_status > 599 || Number.isNaN(draft.failure_status);
  const canSave = !pathError && firstScenarioError === -1 && !failureStatusInvalid;

  const save = useCallback(async () => {
    if (!canSave) {
      if (firstScenarioError !== -1) {
        setTab("responses");
        setSelected(firstScenarioError);
      }
      toast.error("Fix the highlighted problems before saving");
      return;
    }
    setServerError(null);
    const body: EndpointInput = {
      ...draft,
      scenarios: draft.scenarios.map((s) => ({ ...s, name: s.name.trim(), headers: s.headers.filter((h) => h.key.trim()) })),
      active_scenario: draft.active_scenario?.trim() ?? null,
    };
    try {
      if (endpoint) {
        const res = await update.mutateAsync({ id: endpoint.id, body });
        const fresh = toInput(res);
        setSaved(fresh);
        setDraft(fresh);
        toast.success("Saved — live immediately", { description: `${res.method} ${res.mock_path}` });
      } else {
        const res = await create.mutateAsync(body);
        toast.success("Endpoint created", { description: `${res.method} ${res.mock_path}` });
        onDirtyChange(false);
        navigate(`/projects/${project.id}/endpoints/${res.id}`, { replace: true });
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Save failed";
      setServerError(msg);
      toast.error("Couldn't save endpoint", { description: msg });
    }
  }, [canSave, draft, endpoint, firstScenarioError, navigate, onDirtyChange, project.id, update, create]);

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const doDelete = async () => {
    if (!endpoint) return navigate(`/projects/${project.id}`);
    const ok = await confirm({
      title: `Delete ${endpoint.method} ${endpoint.path}?`,
      description: "The route stops responding immediately. This can't be undone.",
      confirmLabel: "Delete endpoint",
      danger: true,
    });
    if (!ok) return;
    await remove.mutateAsync(endpoint.id);
    onDirtyChange(false);
    toast.success("Endpoint deleted");
    navigate(`/projects/${project.id}`, { replace: true });
  };

  const doDuplicate = async (method?: string) => {
    if (!endpoint) return;
    try {
      const copy = await duplicate.mutateAsync({ id: endpoint.id, method });
      toast.success("Endpoint duplicated", { description: `${copy.method} ${copy.path}` });
      navigate(`/projects/${project.id}/endpoints/${copy.id}`);
    } catch (err) {
      toast.error("Couldn't duplicate", { description: (err as Error).message });
    }
  };

  const fullUrl = `${mockBase}/${project.slug}${draft.path.trim() === "/" ? "" : "/" + draft.path.trim().replace(/^\/+/, "")}`;
  const openInTester = () =>
    navigate("/tester", {
      state: {
        method: draft.method,
        url: fullUrl.replace(/:([A-Za-z_]\w*)/g, "1").replace(/\{([A-Za-z_]\w*)\}/g, "1"),
        body: ["POST", "PUT", "PATCH"].includes(draft.method) ? '{\n  "name": "Example"\n}' : "",
      },
    });

  const failurePct = Math.round(draft.failure_rate * 100);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Request line */}
      <div className="border-b border-ink-700 bg-ink-900/60 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1">
            <MethodSelect value={draft.method} onChange={(m) => set({ method: m })} />
            <div
              className={cn(
                "flex h-9 min-w-0 flex-1 items-center rounded-r-lg border bg-ink-900 focus-within:border-brand-500/70 focus-within:ring-2 focus-within:ring-brand-400/15",
                pathError ? "border-err/60" : "border-ink-600",
              )}
            >
              <span className="hidden shrink-0 pl-3 font-mono text-[12.5px] text-fg-faint sm:inline">/mock/{project.slug}</span>
              <input
                value={draft.path}
                onChange={(e) => set({ path: e.target.value })}
                placeholder="/users/:id"
                spellCheck={false}
                aria-label="Endpoint path"
                aria-invalid={!!pathError}
                className="h-full min-w-0 flex-1 bg-transparent px-1.5 font-mono text-[13px] text-fg outline-none placeholder:text-fg-faint sm:pl-0.5"
              />
            </div>
          </div>
          <Tooltip content="Save changes" shortcut="⌘S">
            <Button variant="primary" onClick={save} loading={create.isPending || update.isPending} disabled={!dirty && !!endpoint} icon={<Save className="size-3.5" />} className="h-9">
              {endpoint ? "Save" : "Create"}
            </Button>
          </Tooltip>
          <Menu>
            <MenuTrigger asChild>
              <IconButton label="More endpoint actions" size="md" variant="outline" className="h-9 w-9">
                <MoreHorizontal className="size-[18px]" strokeWidth={2.25} />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<FlaskConical />} onSelect={openInTester}>
                Open in API tester
              </MenuItem>
              {dirty && endpoint && (
                <MenuItem icon={<Undo2 />} onSelect={() => setDraft(saved)}>
                  Discard changes
                </MenuItem>
              )}
              {endpoint && (
                <>
                  <MenuSeparator />
                  <MenuLabel>Duplicate</MenuLabel>
                  <MenuItem icon={<CopyIcon />} onSelect={() => doDuplicate()}>
                    Duplicate endpoint
                  </MenuItem>
                  {(["GET", "POST", "PUT", "PATCH", "DELETE"] as const)
                    .filter((m) => m !== endpoint.method)
                    .map((m) => (
                      <MenuItem key={m} icon={<Shuffle />} onSelect={() => doDuplicate(m)}>
                        Duplicate as {m}
                      </MenuItem>
                    ))}
                </>
              )}
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} danger onSelect={doDelete}>
                {endpoint ? "Delete endpoint" : "Discard new endpoint"}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
        <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1">
          {pathError ? (
            <span className="text-[11.5px] text-err">{pathError}</span>
          ) : (
            <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-fg-subtle">
              <span className="truncate font-mono">{fullUrl}</span>
              <CopyButton value={fullUrl} label="Copy URL" size="xs" />
            </span>
          )}
          <span className="flex-1" />
          {dirty && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-warn animate-fade-in">
              <span className="size-1.5 rounded-full bg-warn" /> Unsaved changes
              <Kbd className="ml-1">⌘S</Kbd>
            </span>
          )}
          <label className="flex items-center gap-2 text-[11.5px] text-fg-subtle">
            <Switch size="sm" checked={draft.enabled} onCheckedChange={(v) => set({ enabled: v })} label="Endpoint enabled" />
            {draft.enabled ? "Enabled" : "Disabled"}
          </label>
        </div>
        {serverError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-[12px] text-err animate-fade-in">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {serverError}
          </div>
        )}
      </div>

      <Tabs
        className="px-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "responses", label: "Responses", badge: <CountBadge>{draft.scenarios.length}</CountBadge> },
          {
            value: "simulation",
            label: "Failure simulation",
            badge: failurePct > 0 ? <CountBadge className="bg-err/15 text-err">{failurePct}%</CountBadge> : undefined,
          },
          { value: "details", label: "Details" },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "responses" && (
          <div className="p-5">
            <div className="mb-5 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Scenarios">
              {draft.scenarios.map((s, i) => {
                const live = s.name === draft.active_scenario;
                const tone = TONE_CLASSES[statusTone(s.status_code)];
                return (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={i === sIndex}
                    onClick={() => setSelected(i)}
                    className={cn(
                      "group flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[12px] font-medium transition-all",
                      i === sIndex ? "border-ink-500 bg-ink-750 text-fg" : "border-ink-700 text-fg-subtle hover:border-ink-600 hover:text-fg-muted",
                      scenarioErrors[i] && "border-err/50",
                    )}
                  >
                    <span className={cn("font-mono text-[11px] font-semibold", tone.text)}>{s.status_code || "—"}</span>
                    <span className="max-w-[140px] truncate">{s.name || "Untitled"}</span>
                    {s.delay_ms > 0 && <span className="font-mono text-[10px] text-fg-faint">{s.delay_ms}ms</span>}
                    {live && (
                      <Tooltip content="Live: the mock server returns this scenario">
                        <span className="flex items-center gap-1 rounded bg-brand-400/15 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-brand-300">
                          <span className="size-1 rounded-full bg-brand-400" />
                          Live
                        </span>
                      </Tooltip>
                    )}
                  </button>
                );
              })}
              <Menu>
                <MenuTrigger asChild>
                  <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} className="h-8" disabled={draft.scenarios.length >= 20}>
                    Add scenario
                  </Button>
                </MenuTrigger>
                <MenuContent align="start">
                  <MenuLabel>Start from</MenuLabel>
                  {SCENARIO_PRESETS.map((p) => (
                    <MenuItem key={p.label} onSelect={() => addScenario(p.make)}>
                      {p.label}
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem icon={<CopyIcon />} onSelect={() => addScenario(() => ({ ...scenario, headers: [...scenario.headers], name: `${scenario.name} copy` }))}>
                    Copy of “{scenario.name}”
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
            <ScenarioEditor
              key={sIndex}
              scenario={scenario}
              onChange={(s) => updateScenario(sIndex, s)}
              isLive={scenario.name === draft.active_scenario}
              onMakeLive={() => set({ active_scenario: scenario.name })}
              onDelete={() => deleteScenario(sIndex)}
              canDelete={draft.scenarios.length > 1}
              onSave={save}
              nameError={scenarioErrors[sIndex] && scenarioErrors[sIndex]!.startsWith("Name") ? scenarioErrors[sIndex] : null}
            />
            <p className="mt-5 rounded-lg border border-ink-700 bg-ink-850 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-fg-subtle">
              Tip: request any scenario on demand without changing the live one by sending the header{" "}
              <code className="font-mono text-fg-muted">X-MockDock-Scenario: {scenario.name || "<name>"}</code> or the query
              parameter <code className="font-mono text-fg-muted">?__scenario=…</code>
            </p>
          </div>
        )}

        {tab === "simulation" && (
          <div className="max-w-2xl space-y-6 p-5 animate-fade-in">
            <div className="panel p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[13.5px] font-semibold text-fg">Random failures</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-fg-subtle">
                    Make a share of requests fail to test retries, error toasts and resilience. Failures still honour the
                    scenario's delay.
                  </p>
                </div>
                <div className={cn("font-mono text-[26px] font-semibold tabular-nums", failurePct > 0 ? "text-err" : "text-fg-faint")}>
                  {failurePct}%
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={failurePct}
                onChange={(e) => set({ failure_rate: parseInt(e.target.value, 10) / 100 })}
                aria-label="Failure probability"
                className="mt-4 w-full cursor-pointer accent-[#fb7185]"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-faint">
                <span>never</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>always</span>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Failure status</label>
                  <StatusCodeInput value={draft.failure_status} onChange={(v) => set({ failure_status: v })} min={400} codes={FAILURE_STATUSES} />
                  {failureStatusInvalid && <p className="mt-1 text-[11px] text-err">Use a 4xx or 5xx status.</p>}
                </div>
                <div className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-[12px] leading-relaxed text-fg-subtle">
                  {failurePct === 0
                    ? "Failures are off. Every request gets the live scenario."
                    : failurePct === 100
                      ? `Every request fails with ${draft.failure_status}.`
                      : `About 1 in ${Math.max(1, Math.round(100 / failurePct))} requests will fail with ${draft.failure_status}.`}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-fg">Failure body</span>
                <span className="text-[11px] text-fg-faint">Leave empty for a default JSON error</span>
              </div>
              <CodeEditor
                value={draft.failure_body}
                onChange={(v) => set({ failure_body: v })}
                height={180}
                onSave={save}
                highlightTemplates
                ariaLabel="Failure body editor"
              />
            </div>
          </div>
        )}

        {tab === "details" && (
          <div className="max-w-2xl space-y-4 p-5 animate-fade-in">
            <div>
              <label className="label" htmlFor="ep-name">
                Display name
              </label>
              <input id="ep-name" className="field" value={draft.name} maxLength={120} placeholder="e.g. List users" onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="ep-desc">
                Notes
              </label>
              <textarea
                id="ep-desc"
                className="field h-28 resize-y py-2"
                value={draft.description}
                maxLength={2000}
                placeholder="What is this endpoint for? Anything teammates should know?"
                onChange={(e) => set({ description: e.target.value })}
              />
            </div>
            {endpoint && (
              <dl className="grid grid-cols-2 gap-3 rounded-lg border border-ink-700 bg-ink-850 p-4 text-[12px]">
                <div>
                  <dt className="text-fg-faint">Created</dt>
                  <dd className="text-fg-muted">{new Date(endpoint.created_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-fg-faint">Last updated</dt>
                  <dd className="text-fg-muted">{new Date(endpoint.updated_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-fg-faint">Endpoint ID</dt>
                  <dd className="font-mono text-fg-muted">{endpoint.id}</dd>
                </div>
                <div>
                  <dt className="text-fg-faint">Response header</dt>
                  <dd className="font-mono text-fg-muted">X-MockDock-Endpoint: {endpoint.id}</dd>
                </div>
              </dl>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
