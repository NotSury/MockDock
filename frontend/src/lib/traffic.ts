import { api } from "../api/client";
import { fillParams, methodHasBody } from "./http";

/** Send a burst of real requests to a project's endpoints (dashboard demo action). */
export async function generateTraffic(projectId: number, slug: string, count = 16): Promise<number> {
  const endpoints = (await api.listEndpoints(projectId)).filter((e) => e.enabled);
  if (!endpoints.length) return 0;
  const sample = { name: "Desk Lamp", price: 39, email: "demo@example.com", status: "shipped", items: [{ product_id: 101, quantity: 1 }] };
  const jobs = Array.from({ length: count }, (_, i) => {
    const e = endpoints[i % endpoints.length];
    const url = `/mock/${slug}${e.path === "/" ? "" : fillParams(e.path, String(100 + (i % 5)))}`;
    return fetch(url, {
      method: e.method,
      headers: methodHasBody(e.method) ? { "Content-Type": "application/json" } : undefined,
      body: methodHasBody(e.method) ? JSON.stringify(sample) : undefined,
    }).catch(() => null);
  });
  await Promise.all(jobs);
  return count;
}
