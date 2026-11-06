export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
export type BodyType = "json" | "text" | "none";

export interface Project {
  id: number;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
  endpoint_count: number;
  request_count: number;
  mock_base_path: string;
}

export interface HeaderPair {
  key: string;
  value: string;
}

export interface ScenarioInput {
  name: string;
  status_code: number;
  headers: HeaderPair[];
  body_type: BodyType;
  body: string;
  delay_ms: number;
}

export interface Scenario extends ScenarioInput {
  id: number;
}

export interface EndpointInput {
  method: HttpMethod;
  path: string;
  name: string;
  description: string;
  enabled: boolean;
  scenarios: ScenarioInput[];
  active_scenario: string | null;
  failure_rate: number;
  failure_status: number;
  failure_body: string;
}

export interface Endpoint extends Omit<EndpointInput, "scenarios" | "active_scenario"> {
  id: number;
  project_id: number;
  active_scenario: string;
  scenarios: Scenario[];
  created_at: string;
  updated_at: string;
  mock_path: string;
}

export interface LogSummary {
  id: number;
  created_at: string;
  project_id: number | null;
  project_slug: string;
  endpoint_id: number | null;
  endpoint_path: string;
  method: string;
  path: string;
  query_string: string;
  response_status: number;
  duration_ms: number;
  scenario_name: string;
  matched: boolean;
  simulated_failure: boolean;
}

export interface LogDetail extends LogSummary {
  request_headers: Record<string, string>;
  request_body: string;
  response_headers: Record<string, string>;
  response_body: string;
  client: string;
}

export interface LogPage {
  items: LogSummary[];
  total: number;
}

export type StatsRange = "1h" | "24h" | "7d";

export interface StatsBucket {
  start: string;
  total: number;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
}

export interface Stats {
  range: StatsRange;
  projects: number;
  endpoints: number;
  enabled_endpoints: number;
  requests_total: number;
  requests_in_range: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_rate: number;
  unmatched: number;
  status_classes: Record<string, number>;
  methods: Record<string, number>;
  timeline: StatsBucket[];
  top_endpoints: {
    endpoint_id: number;
    method: string;
    path: string;
    project_slug: string;
    hits: number;
  }[];
  recent: LogSummary[];
}

export interface ProjectExport {
  mockdock_version: number;
  exported_at?: string;
  project: {
    name: string;
    slug?: string | null;
    description?: string;
    endpoints: EndpointInput[];
  };
}

export interface ServerInfo {
  name: string;
  version: string;
  mock_base_url: string;
  scenario_header: string;
}
