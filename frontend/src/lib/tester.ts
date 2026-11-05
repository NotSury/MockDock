import type { KeyValueRow } from "../components/KeyValueEditor";

export interface TesterRequest {
  method: string;
  url: string;
  headers: KeyValueRow[];
  body: string;
}

export interface TesterResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  durationMs: number;
  size: number;
  url: string;
}

export interface HistoryEntry {
  id: string;
  at: string;
  request: TesterRequest;
  status: number | null;
  durationMs: number | null;
}

const HISTORY_KEY = "mockdock.tester.history";

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 30)));
  } catch {
    /* storage unavailable (private mode) — history just won't persist */
  }
}

/**
 * Decide which URL to actually fetch. If the target is the MockDock server
 * itself but on another origin (e.g. UI on :5173, API on :8000), use a
 * same-origin path so the dev proxy carries it and every header is readable.
 */
export function transportUrl(raw: string, mockBase: string, origin = window.location.origin): string {
  const url = raw.trim();
  if (url.startsWith("/")) return url;
  try {
    const target = new URL(url);
    const backend = new URL(mockBase);
    if (target.origin === backend.origin && target.origin !== origin && target.pathname.startsWith("/mock/")) {
      return target.pathname + target.search;
    }
    return target.toString();
  } catch {
    return url;
  }
}

export function validateUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return "Enter a URL to send the request to.";
  if (url.startsWith("/")) return null;
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return "Only http:// and https:// URLs are supported.";
    return null;
  } catch {
    return "That doesn't look like a valid URL.";
  }
}

export async function sendRequest(
  req: TesterRequest,
  mockBase: string,
  signal: AbortSignal,
): Promise<TesterResponse> {
  const headers = new Headers();
  for (const h of req.headers) {
    if (h.enabled === false || !h.key.trim()) continue;
    headers.append(h.key.trim(), h.value);
  }
  const hasBody = !["GET", "HEAD"].includes(req.method) && req.body.trim() !== "";
  if (hasBody && !headers.has("content-type")) headers.set("Content-Type", "application/json");
  const target = transportUrl(req.url, mockBase);
  const started = performance.now();
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    signal,
    cache: "no-store",
  });
  const buf = await res.arrayBuffer();
  const durationMs = performance.now() - started;
  const body = new TextDecoder().decode(buf);
  return {
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()],
    body,
    durationMs,
    size: buf.byteLength,
    url: target,
  };
}
