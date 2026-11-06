const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function toCurl(method: string, url: string, headers: Record<string, string>, body: string): string {
  const parts = [`curl -X ${method} ${shellQuote(url)}`];
  for (const [k, v] of Object.entries(headers)) parts.push(`-H ${shellQuote(`${k}: ${v}`)}`);
  if (body) parts.push(`--data ${shellQuote(body)}`);
  return parts.join(" \\\n  ");
}

/** Headers worth replaying: drop transport/browser-managed and redacted ones. */
export function replayableHeaders(headers: Record<string, string>): Record<string, string> {
  const skip = new Set([
    "host", "content-length", "connection", "accept-encoding", "user-agent", "origin", "referer",
    "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
    "accept-language", "cookie", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "priority",
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([k, v]) => !skip.has(k.toLowerCase()) && !v.includes("[REDACTED]")),
  );
}
