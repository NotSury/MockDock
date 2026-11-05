import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, toQuery } from "../api/client";

afterEach(() => vi.restoreAllMocks());

const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

describe("api client", () => {
  it("returns parsed JSON", async () => {
    respond(200, [{ id: 1, name: "A" }]);
    await expect(api.listProjects()).resolves.toEqual([{ id: 1, name: "A" }]);
  });

  it("turns error envelopes into ApiError with field details", async () => {
    respond(422, { error: { code: "validation_error", message: "name: required", details: [{ field: "name", message: "required" }] } });
    const err = await api.createProject({ name: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe("validation_error");
    expect(err.fieldErrors).toEqual([{ field: "name", message: "required" }]);
  });

  it("reports network failures clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api.health().catch((e) => e);
    expect(err.code).toBe("network_error");
    expect(err.message).toMatch(/backend/);
  });

  it("handles 204", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.deleteProject(1)).resolves.toBeUndefined();
  });

  it("builds query strings skipping empty values", () => {
    expect(toQuery({ a: 1, b: undefined, c: "", d: false, e: "x y" })).toBe("?a=1&d=false&e=x+y");
    expect(toQuery({})).toBe("");
  });
});
