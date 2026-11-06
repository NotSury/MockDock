import type { EndpointInput, HttpMethod, ScenarioInput } from "../api/types";

export const STATUS_TEXT: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 205: "Reset Content",
  301: "Moved Permanently", 302: "Found", 304: "Not Modified", 307: "Temporary Redirect", 308: "Permanent Redirect",
  400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found",
  405: "Method Not Allowed", 406: "Not Acceptable", 408: "Request Timeout", 409: "Conflict", 410: "Gone",
  413: "Payload Too Large", 415: "Unsupported Media Type", 418: "I'm a teapot", 422: "Unprocessable Entity",
  429: "Too Many Requests", 500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway",
  503: "Service Unavailable", 504: "Gateway Timeout",
};

export const COMMON_STATUSES = [200, 201, 204, 301, 304, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504];

export const statusText = (code: number) => STATUS_TEXT[code] ?? "";

export type StatusTone = "ok" | "redirect" | "warn" | "err" | "neutral";

export function statusTone(code: number): StatusTone {
  if (code >= 500) return "err";
  if (code >= 400) return "warn";
  if (code >= 300) return "redirect";
  if (code >= 200) return "ok";
  return "neutral";
}

export const METHOD_STYLES: Record<HttpMethod, { text: string; bg: string; ring: string; dot: string }> = {
  GET: { text: "text-get", bg: "bg-get/10", ring: "ring-get/25", dot: "bg-get" },
  POST: { text: "text-post", bg: "bg-post/10", ring: "ring-post/25", dot: "bg-post" },
  PUT: { text: "text-put", bg: "bg-put/10", ring: "ring-put/25", dot: "bg-put" },
  PATCH: { text: "text-patch", bg: "bg-patch/10", ring: "ring-patch/25", dot: "bg-patch" },
  DELETE: { text: "text-delete", bg: "bg-delete/10", ring: "ring-delete/25", dot: "bg-delete" },
};

export const methodStyle = (m: string) => METHOD_STYLES[(m.toUpperCase() as HttpMethod)] ?? {
  text: "text-fg-muted", bg: "bg-ink-700", ring: "ring-ink-500", dot: "bg-fg-subtle",
};

export const methodHasBody = (m: string) => ["POST", "PUT", "PATCH", "DELETE"].includes(m.toUpperCase());

/** Absolute URL of the mock server root, e.g. http://127.0.0.1:8000/mock */
export function mockBaseUrl(infoBase?: string): string {
  if (infoBase) return infoBase.replace(/\/$/, "");
  return `${window.location.origin}/mock`;
}

export function mockUrl(base: string, slug: string, path: string): string {
  return `${base}/${slug}${path === "/" ? "" : path}`;
}

/** Replace `:param` segments with sample values so the URL can be sent. */
export function fillParams(path: string, value = "1"): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, () => value);
}

/** Parse ":id" / "{id}" parameter names from a path. */
export function pathParams(path: string): string[] {
  const names: string[] = [];
  for (const m of path.matchAll(/(?::([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})/g)) {
    names.push(m[1] ?? m[2]);
  }
  return names;
}

/** Client-side mirror of the backend's path validation, for instant feedback. */
export function validatePath(raw: string): string | null {
  const path = raw.trim();
  if (!path) return "Path is required.";
  if (/[?#]/.test(path)) return "Leave out the query string — query values are available as {{query.name}}.";
  if (path.includes("//")) return "Path must not contain empty segments.";
  if (path.length > 512) return "Path is too long.";
  const segs = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const seen = new Set<string>();
  for (const s of segs) {
    if (s === "." || s === "..") return "Path must not contain '.' or '..'.";
    const p = s.match(/^(?::([A-Za-z_]\w*)|\{([A-Za-z_]\w*)\})$/);
    if (p) {
      const name = p[1] ?? p[2];
      if (seen.has(name)) return `Duplicate parameter :${name}.`;
      seen.add(name);
      continue;
    }
    if (/[:{}]/.test(s)) return `Invalid segment "${s}". Parameters look like :id or {id}.`;
    if (!/^[A-Za-z0-9._~\-@!$&'()+,;=]+$/.test(s)) return `Segment "${s}" has unsupported characters.`;
  }
  return null;
}

export function newScenario(name = "Success", status = 200): ScenarioInput {
  return {
    name,
    status_code: status,
    headers: [],
    body_type: status === 204 ? "none" : "json",
    body: status === 204 ? "" : '{\n  "message": "Hello from MockDock"\n}',
    delay_ms: 0,
  };
}

export function newEndpoint(method: HttpMethod = "GET", path = "/resource"): EndpointInput {
  return {
    method,
    path,
    name: "",
    description: "",
    enabled: true,
    scenarios: [newScenario()],
    active_scenario: "Success",
    failure_rate: 0,
    failure_status: 500,
    failure_body: "",
  };
}

export function uniqueName(base: string, taken: string[]): string {
  const set = new Set(taken.map((t) => t.toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const c = `${base} ${i}`;
    if (!set.has(c.toLowerCase())) return c;
  }
}
