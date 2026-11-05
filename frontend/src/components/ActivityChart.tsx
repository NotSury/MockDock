import { useMemo, useState } from "react";
import type { StatsBucket, StatsRange } from "../api/types";
import { useElementWidth } from "../lib/useElementWidth";

/** Chart-mark colours for status classes, validated for the dark surface. */
export const STATUS_SERIES = [
  { key: "s2xx", label: "2xx", color: "#25a95c" },
  { key: "s3xx", label: "3xx", color: "#3b82f6" },
  { key: "s4xx", label: "4xx", color: "#c4870c" },
  { key: "s5xx", label: "5xx", color: "#e5485f" },
] as const;

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

function bucketLabel(iso: string, range: StatsRange): string {
  const d = new Date(iso);
  if (range === "7d") return d.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit" });
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function ActivityChart({ buckets, range }: { buckets: StatsBucket[]; range: StatsRange }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(0, ...buckets.map((b) => b.total))), [buckets]);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const slot = buckets.length ? innerW / buckets.length : 0;
  const barW = Math.max(2, Math.min(24, slot - 3));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.max(1, Math.floor(innerW / 70))));
  const hovered = hover !== null ? buckets[hover] : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="Requests over time by status class">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#1d222b" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" className="fill-fg-faint font-mono text-[10px]">
                {Number.isInteger(t) ? t.toLocaleString() : t.toFixed(1)}
              </text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            let acc = 0;
            const segs = STATUS_SERIES.map((s) => ({ ...s, v: b[s.key] })).filter((s) => s.v > 0);
            return (
              <g key={b.start} opacity={hover === null || hover === i ? 1 : 0.45} className="transition-opacity">
                {segs.map((s, si) => {
                  const top = y(acc + s.v);
                  const bottom = y(acc);
                  acc += s.v;
                  const isTop = si === segs.length - 1;
                  // 2px surface gap between stacked segments
                  const h = Math.max(1, bottom - top - (si > 0 ? 2 : 0));
                  const r = isTop ? Math.min(4, h / 2, barW / 2) : 0;
                  const x0 = cx - barW / 2;
                  const yTop = top;
                  const d = `M${x0},${yTop + h} L${x0},${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} L${x0 + barW - r},${yTop} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} L${x0 + barW},${yTop + h} Z`;
                  return <path key={s.key} d={d} fill={s.color} />;
                })}
                {i % labelEvery === 0 && (
                  <text x={cx} y={HEIGHT - 6} textAnchor="middle" className="fill-fg-faint text-[10px]">
                    {bucketLabel(b.start, range)}
                  </text>
                )}
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-lg border border-ink-600 bg-ink-800/95 px-3 py-2 text-[11.5px] shadow-xl shadow-black/40 backdrop-blur animate-fade-in"
          style={{
            left: Math.min(Math.max(0, PAD.left + slot * hover + slot / 2 - 70), Math.max(0, width - 150)),
          }}
        >
          <div className="mb-1.5 flex items-center justify-between gap-3 text-fg-muted">
            <span>{bucketLabel(hovered.start, range)}</span>
            <span className="font-mono font-semibold text-fg">{hovered.total}</span>
          </div>
          {STATUS_SERIES.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 text-fg-subtle">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-mono text-fg-muted">{hovered[s.key]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="flex items-center gap-3">
      {STATUS_SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
          <span className="size-2 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
