import { useMemo } from "react";
import { cn } from "../lib/cn";
import { prettyJson } from "../lib/format";

const TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Lightweight read-only code view with JSON syntax highlighting (no Monaco). */
export function CodeView({ text, className, maxHeight = 360 }: { text: string; className?: string; maxHeight?: number }) {
  const pretty = useMemo(() => prettyJson(text), [text]);
  const isJson = pretty !== text || /^\s*[[{]/.test(text);

  const nodes = useMemo(() => {
    if (!isJson) return [pretty];
    const out: React.ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const m of pretty.matchAll(TOKEN_RE)) {
      const idx = m.index ?? 0;
      if (idx > last) out.push(pretty.slice(last, idx));
      const [full, str, colon, kw, num] = m;
      if (str) {
        out.push(
          <span key={i++} className={colon ? "text-[#8fb8ff]" : "text-[#7af0dc]"}>
            {str}
          </span>,
        );
        if (colon) out.push(<span key={i++} className="text-fg-faint">{colon}</span>);
      } else if (kw) out.push(<span key={i++} className="text-[#d19cff]">{kw}</span>);
      else if (num) out.push(<span key={i++} className="text-[#fbbf77]">{num}</span>);
      else out.push(full);
      last = idx + full.length;
    }
    out.push(pretty.slice(last));
    return out;
  }, [pretty, isJson]);

  return (
    <pre
      className={cn(
        "overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-3.5 font-mono text-[12px] leading-[1.65] text-fg-muted",
        className,
      )}
      style={{ maxHeight }}
    >
      <code>{nodes}</code>
    </pre>
  );
}
