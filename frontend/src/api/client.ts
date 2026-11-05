import type {
  Endpoint,
  EndpointInput,
  LogDetail,
  LogPage,
  Project,
  ProjectExport,
  ServerInfo,
  Stats,
  StatsRange,
} from "./types";

export interface FieldError {
  field: string;
  message: string;
}

/** Error thrown for any non-2xx response from the management API. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get fieldErrors(): FieldError[] {
    return Array.isArray(this.details) ? (this.details as FieldError[]) : [];
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the MockDock server. Is the backend running?");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? `Request failed with status ${res.status}`,
      err?.details,
    );
  }
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  info: () => request<ServerInfo>("/api/info"),
  health: () => request<{ status: string; version: string }>("/api/health"),

  listProjects: () => request<Project[]>("/api/projects"),
  getProject: (id: number) => request<Project>(`/api/projects/${id}`),
  createProject: (body: { name: string; slug?: string; description?: string }) =>
    request<Project>("/api/projects", { method: "POST", body: json(body) }),
  updateProject: (id: number, body: Partial<Pick<Project, "name" | "slug" | "description">>) =>
    request<Project>(`/api/projects/${id}`, { method: "PATCH", body: json(body) }),
  deleteProject: (id: number) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  exportProject: (id: number) => request<ProjectExport>(`/api/projects/${id}/export`),
  importProject: (doc: unknown) =>
    request<Project>("/api/projects/import", { method: "POST", body: json(doc) }),
  restoreSample: () => request<Project>("/api/sample", { method: "POST" }),

  listEndpoints: (projectId: number) => request<Endpoint[]>(`/api/projects/${projectId}/endpoints`),
  getEndpoint: (id: number) => request<Endpoint>(`/api/endpoints/${id}`),
  createEndpoint: (projectId: number, body: EndpointInput) =>
    request<Endpoint>(`/api/projects/${projectId}/endpoints`, { method: "POST", body: json(body) }),
  updateEndpoint: (id: number, body: Partial<EndpointInput>) =>
    request<Endpoint>(`/api/endpoints/${id}`, { method: "PATCH", body: json(body) }),
  deleteEndpoint: (id: number) => request<void>(`/api/endpoints/${id}`, { method: "DELETE" }),
  duplicateEndpoint: (id: number, body: { project_id?: number; method?: string; path?: string } = {}) =>
    request<Endpoint>(`/api/endpoints/${id}/duplicate`, { method: "POST", body: json(body) }),

  listLogs: (params: LogQuery = {}) => request<LogPage>(`/api/logs${toQuery({ ...params })}`),
  getLog: (id: number) => request<LogDetail>(`/api/logs/${id}`),
  clearLogs: (projectId?: number) =>
    request<void>(`/api/logs${toQuery({ project_id: projectId })}`, { method: "DELETE" }),

  stats: (range: StatsRange, projectId?: number) =>
    request<Stats>(`/api/stats${toQuery({ range, project_id: projectId })}`),
};

export type LogQuery = {
  project_id?: number;
  method?: string;
  status?: string;
  q?: string;
  matched?: boolean;
  limit?: number;
  offset?: number;
};

export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
