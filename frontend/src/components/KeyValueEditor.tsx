import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import type { HeaderPair } from "../api/types";
import { cn } from "../lib/cn";
import { IconButton } from "./ui";

export interface KeyValueRow extends HeaderPair {
  enabled?: boolean;
}

/** Editable list of header-like key/value pairs. Always shows a trailing blank row. */
export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "Header",
  valuePlaceholder = "Value",
  suggestions = [],
  withToggles = false,
  className,
}: {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  suggestions?: string[];
  withToggles?: boolean;
  className?: string;
}) {
  const listId = useId();
  const display = [...rows, { key: "", value: "", enabled: true }];

  const update = (i: number, patch: Partial<KeyValueRow>) => {
    const next = display.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next.filter((r, idx) => idx < next.length - 1 || r.key || r.value));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className={cn("overflow-hidden rounded-lg border border-ink-700", className)}>
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <div
        className={cn(
          "grid border-b border-ink-700 bg-ink-800/60 text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint",
          withToggles ? "grid-cols-[28px_1fr_1.4fr_32px]" : "grid-cols-[1fr_1.4fr_32px]",
        )}
      >
        {withToggles && <span />}
        <span className="px-3 py-1.5">Key</span>
        <span className="border-l border-ink-700 px-3 py-1.5">Value</span>
        <span />
      </div>
      {display.map((row, i) => {
        const isGhost = i === display.length - 1;
        return (
          <div
            key={i}
            className={cn(
              "group grid border-b border-ink-700/70 last:border-b-0",
              withToggles ? "grid-cols-[28px_1fr_1.4fr_32px]" : "grid-cols-[1fr_1.4fr_32px]",
              row.enabled === false && "opacity-50",
            )}
          >
            {withToggles && (
              <label className="grid place-items-center">
                {!isGhost && (
                  <input
                    type="checkbox"
                    aria-label={`Enable ${row.key || "row"}`}
                    checked={row.enabled !== false}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                    className="size-3.5 accent-brand-400"
                  />
                )}
              </label>
            )}
            <input
              value={row.key}
              list={suggestions.length ? listId : undefined}
              onChange={(e) => update(i, { key: e.target.value })}
              placeholder={isGhost ? `Add ${keyPlaceholder.toLowerCase()}` : keyPlaceholder}
              aria-label={`${keyPlaceholder} ${i + 1}`}
              spellCheck={false}
              className="h-8 min-w-0 bg-transparent px-3 font-mono text-[12px] text-fg outline-none placeholder:text-fg-faint focus:bg-ink-800"
            />
            <input
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder={valuePlaceholder}
              aria-label={`${valuePlaceholder} ${i + 1}`}
              spellCheck={false}
              className="h-8 min-w-0 border-l border-ink-700/70 bg-transparent px-3 font-mono text-[12px] text-fg outline-none placeholder:text-fg-faint focus:bg-ink-800"
            />
            <div className="grid place-items-center">
              {isGhost ? (
                <Plus className="size-3.5 text-fg-faint" aria-hidden />
              ) : (
                <IconButton
                  label={`Remove ${row.key || "row"}`}
                  size="xs"
                  onClick={() => remove(i)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="size-3" />
                </IconButton>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
