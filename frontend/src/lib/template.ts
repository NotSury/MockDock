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

/**
 * Where the first JSON syntax error is, as an offset into the *original* text.
 * Placeholders are swapped for same-length filler so offsets line up.
 */
export function jsonErrorPosition(body: string): { offset: number; message: string } | null {
  if (!body.trim()) return null;
  let masked = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < body.length; ) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    if (ch === "{" && body.startsWith("{{", i)) {
      const m = body.slice(i).match(PLACEHOLDER);
      if (m && isKnownExpr(m[1])) {
        masked += inString ? "x".repeat(m[0].length) : "1" + "0".repeat(m[0].length - 1);
        i += m[0].length;
        continue;
      }
    }
    masked += ch;
    i++;
  }
  return findJsonError(masked);
}

/**
 * Minimal JSON syntax checker that reports *where* the first error is.
 * (Browsers' JSON.parse messages often omit the position.)
 */
export function findJsonError(src: string): { offset: number; message: string } | null {
  let i = 0;
  const fail = (message: string): never => {
    throw { offset: i, message };
  };
  const ws = () => {
    while (i < src.length && " \t\n\r".includes(src[i])) i++;
  };
  const lit = (word: string) => {
    if (src.startsWith(word, i)) i += word.length;
    else fail(`Unexpected token ${src[i] ? `'${src[i]}'` : "end of input"}`);
  };
  const str = () => {
    i++; // opening quote
    while (i < src.length) {
      const c = src[i];
      if (c === '"') {
        i++;
        return;
      }
      if (c === "\\") {
        i++;
        if (src[i] === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(src.slice(i + 1, i + 5))) fail("Invalid unicode escape");
          i += 5;
        } else if ('"\\/bfnrt'.includes(src[i] ?? "")) i++;
        else fail("Invalid escape sequence");
        continue;
      }
      if (c === "\n") fail("Unterminated string");
      i++;
    }
    fail("Unterminated string");
  };
  const num = () => {
    const m = src.slice(i).match(/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/);
    if (!m || !m[0] || m[0] === "-") fail(`Unexpected token ${src[i] ? `'${src[i]}'` : "end of input"}`);
    i += m![0].length;
  };
  const value = (): void => {
    ws();
    const c = src[i];
    if (c === "{") {
      i++;
      ws();
      if (src[i] === "}") return void i++;
      for (;;) {
        ws();
        if (src[i] !== '"') fail(src[i] === "}" ? "Trailing comma" : "Expected a property name in double quotes");
        str();
        ws();
        if (src[i] !== ":") fail("Expected ':' after property name");
        i++;
        value();
        ws();
        if (src[i] === ",") {
          i++;
          continue;
        }
        if (src[i] === "}") return void i++;
        fail("Expected ',' or '}'");
      }
    } else if (c === "[") {
      i++;
      ws();
      if (src[i] === "]") return void i++;
      for (;;) {
        ws();
        if (src[i] === "]") fail("Trailing comma");
        value();
        ws();
        if (src[i] === ",") {
          i++;
          continue;
        }
        if (src[i] === "]") return void i++;
        fail("Expected ',' or ']'");
      }
    } else if (c === '"') str();
    else if (c === "t") lit("true");
    else if (c === "f") lit("false");
    else if (c === "n") lit("null");
    else if (c === "-" || (c >= "0" && c <= "9")) num();
    else fail(c === undefined ? "Unexpected end of input" : `Unexpected token '${c}'`);
  };
  try {
    value();
    ws();
    if (i < src.length) fail(`Unexpected '${src[i]}' after the JSON value`);
    return null;
  } catch (e) {
    if (typeof e === "object" && e && "offset" in e) return e as { offset: number; message: string };
    throw e;
  }
}
