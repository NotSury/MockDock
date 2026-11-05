/**
 * Client-side mirror of the backend's template-aware JSON validation
 * (backend/app/mock/templating.py). Placeholders like {{params.id}} may appear
 * bare (`"id": {{params.id}}`) or inside strings.
 */
const PLACEHOLDER = /^\{\{\s*([A-Za-z_][A-Za-z0-9_\-.]*)\s*\}\}/;
const ROOTS = new Set(["params", "query", "headers", "body"]);
const BUILTINS = new Set(["now", "timestamp", "uuid"]);

export function isKnownExpr(expr: string): boolean {
  const [root, ...rest] = expr.split(".");
  return BUILTINS.has(expr) || (ROOTS.has(root) && rest.length > 0 && rest.join(".") !== "");
}

export function replaceBarePlaceholders(source: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; ) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    }
    if (ch === "{" && source.startsWith("{{", i)) {
      const m = source.slice(i).match(PLACEHOLDER);
      if (m && isKnownExpr(m[1])) {
        out += inString ? "x" : "0";
        i += m[0].length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/** Returns an error message, or null if the body is valid (templated) JSON. */
export function validateJsonTemplate(body: string): string | null {
  if (!body.trim()) return null;
  try {
    JSON.parse(replaceBarePlaceholders(body));
    return null;
  } catch (e) {
    return (e as Error).message.replace(/^JSON\.parse: /, "");
  }
}

/** Pretty-print templated JSON by temporarily swapping out bare placeholders. */
export function formatJsonTemplate(body: string): string {
  const bare: string[] = [];
  let inString = false;
  let escaped = false;
  let masked = "";
  for (let i = 0; i < body.length; ) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    if (!inString && ch === "{" && body.startsWith("{{", i)) {
      const m = body.slice(i).match(PLACEHOLDER);
      if (m && isKnownExpr(m[1])) {
        masked += `"__MD_BARE_${bare.length}__"`;
        bare.push(m[0]);
        i += m[0].length;
        continue;
      }
    }
    masked += ch;
    i++;
  }
  const pretty = JSON.stringify(JSON.parse(masked), null, 2);
  return pretty.replace(/"__MD_BARE_(\d+)__"/g, (_, n) => bare[Number(n)]);
}

export const TEMPLATE_VARIABLES = [
  { expr: "{{params.id}}", desc: "Route parameter from the path, e.g. /users/:id" },
  { expr: "{{query.page}}", desc: "Query-string value, e.g. ?page=2" },
  { expr: "{{body.name}}", desc: "Field from the JSON request body (dot paths: body.items.0.sku)" },
  { expr: "{{headers.x-user}}", desc: "Request header (case-insensitive)" },
  { expr: "{{now}}", desc: "Current time, ISO 8601 (UTC)" },
  { expr: "{{timestamp}}", desc: "Current Unix time in milliseconds" },
  { expr: "{{uuid}}", desc: "A random UUID v4" },
];
