import { describe, expect, it } from "vitest";
import { fillParams, pathParams, statusTone, uniqueName, validatePath, mockUrl } from "../lib/http";
import { formatJsonTemplate, jsonErrorPosition, validateJsonTemplate } from "../lib/template";
import { transportUrl, validateUrl } from "../lib/tester";
import { replayableHeaders, toCurl } from "../lib/curl";
import { formatBytes, formatMs, formatPercent, prettyJson, timeAgo } from "../lib/format";

describe("validatePath", () => {
  it.each(["/users", "/users/:id", "/users/{id}/orders", "/", "v1/health"])("accepts %s", (p) => {
    expect(validatePath(p)).toBeNull();
  });
  it.each([
    ["", "required"],
    ["/users?x=1", "query"],
    ["/a//b", "empty"],
    ["/a/../b", "'..'"],
    ["/u/:id/:id", "Duplicate"],
    ["/x{y}", "Invalid segment"],
    ["/a b", "unsupported"],
  ])("rejects %s", (p, msg) => {
    expect(validatePath(p)).toContain(msg);
  });
});

describe("path helpers", () => {
  it("fills and lists params", () => {
    expect(fillParams("/users/:id/orders/:orderId", "7")).toBe("/users/7/orders/7");
    expect(pathParams("/users/:id/x/{other}")).toEqual(["id", "other"]);
  });
  it("builds mock urls", () => {
    expect(mockUrl("http://h/mock", "shop", "/")).toBe("http://h/mock/shop");
    expect(mockUrl("http://h/mock", "shop", "/a")).toBe("http://h/mock/shop/a");
  });
  it("makes unique names", () => {
    expect(uniqueName("Success", ["success", "Success 2"])).toBe("Success 3");
    expect(uniqueName("New", [])).toBe("New");
  });
  it("classifies statuses", () => {
    expect([200, 302, 404, 503].map(statusTone)).toEqual(["ok", "redirect", "warn", "err"]);
  });
});

describe("template-aware JSON", () => {
  it("accepts bare and quoted placeholders", () => {
    expect(validateJsonTemplate('{"id": {{params.id}}, "n": "{{body.name}}"}')).toBeNull();
    expect(validateJsonTemplate("")).toBeNull();
  });
  it("rejects broken JSON and unknown bare placeholders", () => {
    expect(validateJsonTemplate('{"a": 1,}')).not.toBeNull();
    expect(validateJsonTemplate('{"a": {{nope}}}')).not.toBeNull();
  });
  it("formats while preserving placeholders", () => {
    expect(formatJsonTemplate('{"id":{{params.id}},"tags":["{{query.t}}"]}')).toBe(
      '{\n  "id": {{params.id}},\n  "tags": [\n    "{{query.t}}"\n  ]\n}',
    );
  });
  it("locates errors in the original text", () => {
    const body = '{\n  "id": {{params.id}},\n  "x": oops\n}';
    const err = jsonErrorPosition(body);
    expect(err).not.toBeNull();
    expect(body.slice(err!.offset, err!.offset + 4)).toBe("oops");
    expect(jsonErrorPosition('{"id": {{params.id}}}')).toBeNull();
    expect(jsonErrorPosition('{"a": [1, 2,]}')?.message).toBe("Trailing comma");
    expect(jsonErrorPosition('{"a": "x\\q"}')?.message).toBe("Invalid escape sequence");
    expect(jsonErrorPosition('[1] 2')?.message).toMatch(/after the JSON value/);
    expect(jsonErrorPosition('{"a": -0.5e+3, "b": "\\u00e9", "c": [true, false, null]}')).toBeNull();
  });
});

describe("tester helpers", () => {
  const base = "http://127.0.0.1:8000/mock";
  it("routes same-server URLs through the same origin", () => {
    expect(transportUrl("http://127.0.0.1:8000/mock/shop/a?x=1", base, "http://127.0.0.1:5173")).toBe("/mock/shop/a?x=1");
    expect(transportUrl("http://127.0.0.1:8000/mock/shop/a", base, "http://127.0.0.1:8000")).toBe("http://127.0.0.1:8000/mock/shop/a");
    expect(transportUrl("https://api.example.com/x", base, "http://127.0.0.1:5173")).toBe("https://api.example.com/x");
    expect(transportUrl("/mock/shop", base)).toBe("/mock/shop");
  });
  it("validates urls", () => {
    expect(validateUrl("")).toMatch(/Enter a URL/);
    expect(validateUrl("ftp://x")).toMatch(/http/);
    expect(validateUrl("not a url")).toMatch(/valid URL/);
    expect(validateUrl("/mock/shop")).toBeNull();
  });
  it("builds curl commands without credentials", () => {
    const h = replayableHeaders({ authorization: "Bearer [REDACTED]", "x-a": "1", host: "h", "user-agent": "ua" });
    expect(h).toEqual({ "x-a": "1" });
    expect(toCurl("POST", "http://h/x", h, `{"a":"it's"}`)).toBe(
      `curl -X POST 'http://h/x' \\\n  -H 'x-a: 1' \\\n  --data '{"a":"it'\\''s"}'`,
    );
  });
});

describe("formatting", () => {
  it("formats values", () => {
    expect(formatMs(0.5)).toBe("0.50 ms");
    expect(formatMs(250)).toBe("250 ms");
    expect(formatMs(2500)).toBe("2.50 s");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatPercent(0.25)).toBe("25%");
    expect(formatPercent(0.031)).toBe("3.1%");
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("plain")).toBe("plain");
    expect(timeAgo(new Date(Date.now() - 120_000).toISOString())).toBe("2m ago");
  });
});
