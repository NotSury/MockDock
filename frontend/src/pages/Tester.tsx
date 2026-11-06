import { useQueries } from "@tanstack/react-query";
import { ChevronDown, Clock, History, Loader2, Send, Square, Trash2, Wand2, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/client";
import { qk, useInfo, useProjects } from "../api/hooks";
import type { HttpMethod } from "../api/types";
import { LatencyText, MethodBadge, StatusBadge } from "../components/Badges";
import { CodeEditor } from "../components/CodeEditor";
import { CopyButton } from "../components/CopyButton";
import { MethodSelect } from "../components/endpoint/MethodSelect";
import { KeyValueEditor, type KeyValueRow } from "../components/KeyValueEditor";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "../components/Menu";
import { Tooltip } from "../components/Tooltip";
import { Button, CountBadge, EmptyState, IconButton, Kbd, Tabs } from "../components/ui";
import { cn } from "../lib/cn";
import { formatBytes, formatMs, isJson, prettyJson, timeAgo } from "../lib/format";
import { fillParams, methodHasBody, mockBaseUrl, statusText } from "../lib/http";
import {
  loadHistory,
  saveHistory,
  sendRequest,
  validateUrl,
  type HistoryEntry,
  type TesterRequest,
  type TesterResponse,
} from "../lib/tester";

type ReqTab = "headers" | "body";
type ResTab = "body" | "headers";

interface PrefillState {
  method?: string;
  url?: string;
  headers?: KeyValueRow[];
  body?: string;
}

export function TesterPage() {
  const info = useInfo();
  const base = mockBaseUrl(info.data?.mock_base_url);
  const location = useLocation();
  const prefill = (location.state ?? {}) as PrefillState;

  const [method, setMethod] = useState<HttpMethod>((prefill.method as HttpMethod) ?? "GET");
  const [url, setUrl] = useState(prefill.url ?? "");
  const [headers, setHeaders] = useState<KeyValueRow[]>(
    prefill.headers ?? [{ key: "Accept", value: "application/json", enabled: true }],
  );
  const [body, setBody] = useState(prefill.body ?? "");
  const [reqTab, setReqTab] = useState<ReqTab>(prefill.body ? "body" : "headers");
  const [resTab, setResTab] = useState<ResTab>("body");
  const [response, setResponse] = useState<TesterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const abortRef = useRef<AbortController | null>(null);

  // Apply prefill when navigated here again with new state.
  useEffect(() => {
    if (!location.state) return;
    const s = location.state as PrefillState;
    if (s.method) setMethod(s.method as HttpMethod);
    if (s.url) setUrl(s.url);
    if (s.headers) setHeaders(s.headers);
    if (s.body !== undefined) {
      setBody(s.body);
      if (s.body) setReqTab("body");
    }
    setResponse(null);
  }, [location.key, location.state]);

  // Default URL once the server's base is known.
  useEffect(() => {
    if (!url && info.data && !prefill.url) setUrl(`${base}/shop/products`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.data]);

  const projects = useProjects();
  const endpointQueries = useQueries({
    queries: (projects.data ?? []).map((p) => ({ queryKey: qk.endpoints(p.id), queryFn: () => api.listEndpoints(p.id) })),
  });

  const urlError = url ? validateUrl(url) : null;
  const bodyIsInvalidJson = methodHasBody(method) && body.trim() !== "" && !isJson(body);

  const send = async () => {
    const problem = validateUrl(url);
    if (problem) return setError(problem);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60_000);
    setSending(true);
    setError(null);
    const req: TesterRequest = { method, url: url.trim(), headers, body: methodHasBody(method) ? body : "" };
    let entry: HistoryEntry = { id: crypto.randomUUID?.() ?? String(Date.now()), at: new Date().toISOString(), request: req, status: null, durationMs: null };
    try {
      const res = await sendRequest(req, base, controller.signal);
      setResponse(res);
      entry = { ...entry, status: res.status, durationMs: res.durationMs };
    } catch (e) {
      setResponse(null);
      const aborted = (e as Error).name === "AbortError";
      setError(aborted ? "Request cancelled or timed out after 60 s." : `Network error: ${(e as Error).message}. Is the URL reachable, and does it allow CORS?`);
    } finally {
      clearTimeout(timeout);
      setSending(false);
      setHistory((h) => {
        const next = [entry, ...h].slice(0, 30);
        saveHistory(next);
        return next;
      });
    }
  };

  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        sendRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadEntry = (h: HistoryEntry) => {
    setMethod(h.request.method as HttpMethod);
    setUrl(h.request.url);
    setHeaders(h.request.headers);
    setBody(h.request.body);
  };

  const responseIsJson = useMemo(() => !!response && isJson(response.body), [response]);
  const activeHeaders = headers.filter((h) => h.enabled !== false && h.key).length;

  return (
    <div className="flex h-full min-h-0 flex-col animate-fade-in">
      <div className="border-b border-ink-700/70 px-5 pb-4 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-fg">API Tester</h1>
            <p className="text-[12px] text-fg-subtle">Send real HTTP requests to your mocks and inspect exactly what comes back.</p>
          </div>
          <Menu>
            <MenuTrigger asChild>
              <Button size="sm" variant="outline" icon={<Wand2 className="size-3.5" />}>
                Pick an endpoint <ChevronDown className="size-3.5 text-fg-faint" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <div className="max-h-[60vh] overflow-y-auto">
                {projects.data?.length === 0 && <div className="px-3 py-2 text-[12px] text-fg-subtle">No projects yet.</div>}
                {projects.data?.map((p, i) => (
                  <div key={p.id}>
                    <MenuLabel>{p.name}</MenuLabel>
                    {endpointQueries[i]?.data?.map((e) => (
                      <MenuItem
                        key={e.id}
                        onSelect={() => {
                          setMethod(e.method);
                          setUrl(`${base}/${p.slug}${e.path === "/" ? "" : fillParams(e.path, "1")}`);
                          if (methodHasBody(e.method) && !body) {
                            setBody('{\n  "name": "Example"\n}');
                            setReqTab("body");
                          }
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <MethodBadge method={e.method} variant="text" />
                          <span className="font-mono text-[11.5px]">{e.path}</span>
                        </span>
                      </MenuItem>
                    ))}
                  </div>
                ))}
              </div>
            </MenuContent>
          </Menu>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="flex min-w-0 flex-1">
            <MethodSelect value={method} onChange={setMethod} />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={`${base}/shop/products`}
              aria-label="Request URL"
              spellCheck={false}
              className={cn(
                "h-9 min-w-0 flex-1 rounded-r-lg border bg-ink-900 px-3 font-mono text-[13px] text-fg outline-none placeholder:text-fg-faint focus:border-brand-500/70 focus:ring-2 focus:ring-brand-400/15",
                urlError ? "border-err/60" : "border-ink-600",
              )}
            />
          </div>
          {sending ? (
            <Button type="button" className="h-9 w-[96px]" onClick={() => abortRef.current?.abort()} icon={<Square className="size-3" />}>
              Cancel
            </Button>
          ) : (
            <Tooltip content="Send request" shortcut="⌘↵">
              <Button type="submit" variant="primary" className="h-9 w-[96px]" icon={<Send className="size-3.5" />}>
                Send
              </Button>
            </Tooltip>
          )}
        </form>
        {urlError && <p className="mt-1.5 text-[11.5px] text-err">{urlError}</p>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_240px]">
        {/* Request */}
        <section className="flex min-h-[320px] min-w-0 flex-col border-b border-ink-700/70 xl:border-b-0 xl:border-r">
          <Tabs
            className="px-4"
            value={reqTab}
            onChange={setReqTab}
            tabs={[
              { value: "headers", label: "Headers", badge: activeHeaders ? <CountBadge>{activeHeaders}</CountBadge> : undefined },
              {
                value: "body",
                label: "Body",
                badge: methodHasBody(method) && body.trim() ? <span className="size-1.5 rounded-full bg-brand-400" /> : undefined,
              },
            ]}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            {reqTab === "headers" ? (
              <div className="space-y-3">
                <KeyValueEditor
                  rows={headers}
                  onChange={setHeaders}
                  withToggles
                  suggestions={["Accept", "Authorization", "Content-Type", "X-MockDock-Scenario", "X-Request-Id", "Cache-Control"]}
                />
                <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                  Add <code className="font-mono text-fg-muted">X-MockDock-Scenario</code> to request a specific scenario.
                  Authorization headers are redacted in the request log.
                </p>
              </div>
            ) : methodHasBody(method) ? (
              <div className="flex min-h-[300px] flex-1 flex-col gap-2">
                <CodeEditor value={body} onChange={setBody} height="100%" className="flex-1" onSubmit={send} ariaLabel="Request body editor" />
                {bodyIsInvalidJson && <p className="text-[11.5px] text-warn">Body isn't valid JSON — it will be sent as-is.</p>}
              </div>
            ) : (
              <EmptyState compact title={`${method} requests don't send a body`} description="Switch to POST, PUT, PATCH or DELETE to add a JSON body." />
            )}
          </div>
        </section>

        {/* Response */}
        <section className="flex min-h-[360px] min-w-0 flex-col border-b border-ink-700/70 xl:border-b-0 xl:border-r">
          <div className="flex h-9 items-center gap-3 border-b border-ink-700 px-4">
            <span className="text-[12.5px] font-medium text-fg">Response</span>
            {response && (
              <div className="flex items-center gap-3 animate-fade-in">
                <StatusBadge status={response.status} showText />
                <span className="flex items-center gap-1 text-[11.5px] text-fg-subtle">
                  <Clock className="size-3" /> <LatencyText ms={response.durationMs} />
                </span>
                <span className="font-mono text-[11.5px] text-fg-subtle">{formatBytes(response.size)}</span>
              </div>
            )}
          </div>
          {sending ? (
            <div className="grid flex-1 place-items-center">
              <div className="flex flex-col items-center gap-3 text-fg-subtle">
                <Loader2 className="size-6 animate-spin text-brand-400" />
                <span className="text-[12px]">Waiting for response…</span>
              </div>
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="rounded-lg border border-err/30 bg-err/10 px-4 py-3 text-[12.5px] text-err">{error}</div>
            </div>
          ) : !response ? (
            <EmptyState
              className="flex-1"
              icon={<Zap />}
              title="Send a request to see the response"
              description={
                <>
                  Press <Kbd>⌘</Kbd> <Kbd>↵</Kbd> anywhere on this page.
                </>
              }
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col animate-fade-in">
              <Tabs
                className="px-4"
                value={resTab}
                onChange={setResTab}
                tabs={[
                  { value: "body", label: "Body" },
                  { value: "headers", label: "Headers", badge: <CountBadge>{response.headers.length}</CountBadge> },
                ]}
              />
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
                {resTab === "body" ? (
                  response.body ? (
                    <div className="relative flex min-h-[340px] flex-1 flex-col">
                      <div className="absolute right-2 top-2 z-10">
                        <CopyButton value={response.body} label="Copy body" />
                      </div>
                      <CodeEditor
                        value={responseIsJson ? prettyJson(response.body) : response.body}
                        language={responseIsJson ? "json" : "plaintext"}
                        readOnly
                        height="100%"
                        className="flex-1"
                        ariaLabel="Response body"
                      />
                    </div>
                  ) : (
                    <EmptyState compact title="Empty body" description={`${response.status} ${statusText(response.status)} returned no content.`} />
                  )
                ) : (
                  <table className="w-full text-[12px]">
                    <tbody className="divide-y divide-ink-700/70">
                      {response.headers.map(([k, v]) => (
                        <tr key={k}>
                          <td className={cn("w-[40%] py-1.5 pr-3 align-top font-mono", k.startsWith("x-mockdock") ? "text-brand-300" : "text-fg-muted")}>{k}</td>
                          <td className="break-all py-1.5 font-mono text-fg">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </section>

        {/* History */}
        <aside className="flex min-h-[200px] min-w-0 flex-col">
          <div className="flex h-9 items-center justify-between border-b border-ink-700 px-4">
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
              <History className="size-3.5 text-fg-subtle" /> History
            </span>
            {history.length > 0 && (
              <IconButton
                label="Clear history"
                size="xs"
                onClick={() => {
                  setHistory([]);
                  saveHistory([]);
                }}
              >
                <Trash2 className="size-3" />
              </IconButton>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {history.length === 0 && <p className="px-2 py-4 text-center text-[11.5px] text-fg-faint">Requests you send appear here.</p>}
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => loadEntry(h)}
                className="group w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink-800"
              >
                <div className="flex items-center gap-2">
                  <MethodBadge method={h.request.method} variant="text" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
                    {h.request.url.replace(/^https?:\/\/[^/]+/, "")}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 pl-[46px] text-[10.5px] text-fg-faint">
                  {h.status !== null ? <span className="font-mono">{h.status}</span> : <span className="text-err">failed</span>}
                  {h.durationMs !== null && <span>{formatMs(h.durationMs)}</span>}
                  <span className="ml-auto">{timeAgo(h.at)}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

