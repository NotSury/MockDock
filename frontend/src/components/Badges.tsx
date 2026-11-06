import { cn } from "../lib/cn";
import { methodStyle, statusText, statusTone, type StatusTone } from "../lib/http";
import { Tooltip } from "./Tooltip";

export function MethodBadge({
  method,
  className,
  variant = "soft",
}: {
  method: string;
  className?: string;
  variant?: "soft" | "text";
}) {
  const s = methodStyle(method);
  const label = method.toUpperCase() === "DELETE" ? "DEL" : method.toUpperCase();
  if (variant === "text") {
    return (
      <span className={cn("inline-block w-[38px] shrink-0 font-mono text-[10.5px] font-bold tracking-wide", s.text, className)}>
        {label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 w-[46px] shrink-0 items-center justify-center rounded-[5px] font-mono text-[10px] font-bold tracking-wider ring-1 ring-inset",
        s.text,
        s.bg,
        s.ring,
        className,
      )}
    >
      {label}
    </span>
  );
}

export const TONE_CLASSES: Record<StatusTone, { text: string; bg: string; dot: string; ring: string }> = {
  ok: { text: "text-ok", bg: "bg-ok/10", dot: "bg-ok", ring: "ring-ok/25" },
  redirect: { text: "text-redirect", bg: "bg-redirect/10", dot: "bg-redirect", ring: "ring-redirect/25" },
  warn: { text: "text-warn", bg: "bg-warn/10", dot: "bg-warn", ring: "ring-warn/25" },
  err: { text: "text-err", bg: "bg-err/10", dot: "bg-err", ring: "ring-err/25" },
  neutral: { text: "text-fg-muted", bg: "bg-ink-700", dot: "bg-fg-subtle", ring: "ring-ink-500" },
};

export function StatusBadge({
  status,
  showText = false,
  className,
}: {
  status: number;
  showText?: boolean;
  className?: string;
}) {
  const t = TONE_CLASSES[statusTone(status)];
  const text = statusText(status);
  const badge = (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-[5px] px-1.5 font-mono text-[11px] font-semibold tabular-nums ring-1 ring-inset",
        t.text,
        t.bg,
        t.ring,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", t.dot)} />
      {status}
      {showText && text && <span className="font-sans font-medium opacity-80">{text}</span>}
    </span>
  );
  return showText || !text ? badge : <Tooltip content={text}>{badge}</Tooltip>;
}

export function LatencyText({ ms, className }: { ms: number; className?: string }) {
  const tone = ms >= 1000 ? "text-err" : ms >= 300 ? "text-warn" : "text-fg-muted";
  return (
    <span className={cn("font-mono text-[11.5px] tabular-nums", tone, className)}>
      {ms < 1 ? ms.toFixed(1) : Math.round(ms).toLocaleString()}
      <span className="ml-0.5 text-fg-faint">ms</span>
    </span>
  );
}
