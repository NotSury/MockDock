import { AlignLeft, Radio, Timer, Trash2 } from "lucide-react";
import type { BodyType, ScenarioInput } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatJsonTemplate, validateJsonTemplate } from "../../lib/template";
import { CodeEditor } from "../CodeEditor";
import { KeyValueEditor } from "../KeyValueEditor";
import { Tooltip } from "../Tooltip";
import { Button, SegmentedControl } from "../ui";
import { StatusCodeInput } from "./StatusCodeInput";
import { TemplateHelp } from "./TemplateHelp";

const HEADER_SUGGESTIONS = [
  "Content-Type", "Cache-Control", "Location", "Retry-After", "Set-Cookie", "WWW-Authenticate",
  "X-Request-Id", "X-Total-Count", "ETag", "Access-Control-Allow-Origin", "Link", "Vary",
];
const DELAY_PRESETS = [0, 300, 1000, 3000];

export function ScenarioEditor({
  scenario,
  onChange,
  isLive,
  onMakeLive,
  onDelete,
  canDelete,
  onSave,
  nameError,
}: {
  scenario: ScenarioInput;
  onChange: (s: ScenarioInput) => void;
  isLive: boolean;
  onMakeLive: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onSave: () => void;
  nameError?: string | null;
}) {
  const set = (patch: Partial<ScenarioInput>) => onChange({ ...scenario, ...patch });
  const jsonError = scenario.body_type === "json" ? validateJsonTemplate(scenario.body) : null;
  const noBodyStatus = [204, 205, 304].includes(scenario.status_code);

  const format = () => {
    try {
      set({ body: formatJsonTemplate(scenario.body) });
    } catch {
      /* invalid JSON: leave as-is, the error is already shown */
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <label className="label" htmlFor="sc-name">
            Scenario name
          </label>
          <input
            id="sc-name"
            className={cn("field", nameError && "border-err/60")}
            value={scenario.name}
            maxLength={60}
            onChange={(e) => set({ name: e.target.value })}
          />
          {nameError && <p className="mt-1 text-[11px] text-err">{nameError}</p>}
        </div>
        <div>
          <label className="label" htmlFor="sc-status">
            Status code
          </label>
          <StatusCodeInput
            id="sc-status"
            value={scenario.status_code}
            onChange={(v) => set({ status_code: v, ...([204, 205, 304].includes(v) ? { body_type: "none" as BodyType } : {}) })}
          />
        </div>
        <div>
          <label className="label flex items-center gap-1.5" htmlFor="sc-delay">
            <Timer className="size-3" /> Delay
          </label>
          <div className="flex h-8 items-center rounded-md border border-ink-600 bg-ink-900 focus-within:border-brand-500/70">
            <input
              id="sc-delay"
              type="number"
              min={0}
              max={30000}
              step={50}
              value={scenario.delay_ms}
              onChange={(e) => set({ delay_ms: Math.max(0, Math.min(30000, parseInt(e.target.value || "0", 10))) })}
              className="h-full w-full min-w-0 bg-transparent px-2.5 font-mono text-[13px] text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="pr-2.5 text-[11.5px] text-fg-faint">ms</span>
          </div>
        </div>
      </div>

      <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          type="range"
          min={0}
          max={5000}
          step={50}
          value={Math.min(scenario.delay_ms, 5000)}
          onChange={(e) => set({ delay_ms: parseInt(e.target.value, 10) })}
          aria-label="Delay slider"
          className="h-1 min-w-[160px] flex-1 cursor-pointer accent-brand-400"
        />
        <div className="flex gap-1">
          {DELAY_PRESETS.map((d) => (
            <button
              key={d}
              onClick={() => set({ delay_ms: d })}
              className={cn(
                "h-6 rounded-md border px-2 font-mono text-[11px] transition-colors",
                scenario.delay_ms === d ? "border-brand-400/50 bg-brand-400/10 text-brand-300" : "border-ink-600 text-fg-subtle hover:text-fg-muted",
              )}
            >
              {d === 0 ? "none" : d >= 1000 ? `${d / 1000}s` : `${d}ms`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-[12.5px] font-semibold text-fg">Response body</span>
            <SegmentedControl<BodyType>
              size="xs"
              ariaLabel="Body type"
              value={scenario.body_type}
              onChange={(v) => set({ body_type: v })}
              options={[
                { value: "json", label: "JSON" },
                { value: "text", label: "Text" },
                { value: "none", label: "Empty" },
              ]}
            />
          </div>
          {scenario.body_type !== "none" && (
            <div className="flex items-center gap-1">
              <TemplateHelp />
              {scenario.body_type === "json" && (
                <Tooltip content="Pretty-print JSON">
                  <Button size="xs" variant="ghost" icon={<AlignLeft className="size-3" />} onClick={format} disabled={!!jsonError}>
                    Format
                  </Button>
                </Tooltip>
              )}
            </div>
          )}
        </div>
        {scenario.body_type === "none" ? (
          <div className="grid h-24 place-items-center rounded-lg border border-dashed border-ink-600 bg-ink-900 text-[12px] text-fg-subtle">
            {noBodyStatus ? `Status ${scenario.status_code} never carries a body.` : "The response will have an empty body."}
          </div>
        ) : (
          <>
            <CodeEditor
              value={scenario.body}
              onChange={(v) => set({ body: v })}
              language={scenario.body_type === "json" ? "json" : "plaintext"}
              height={320}
              onSave={onSave}
              highlightTemplates
              ariaLabel="Response body editor"
              className={cn(jsonError && "border-err/50")}
            />
            <div className="mt-1.5 flex h-4 items-center text-[11px]">
              {jsonError ? (
                <span className="text-err">⚠ {jsonError}</span>
              ) : (
                <span className="text-fg-faint">
                  {scenario.body_type === "json" ? "Valid JSON" : "Plain text"} · {scenario.body.length.toLocaleString()} chars
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-fg">Response headers</span>
          <span className="text-[11px] text-fg-faint">Content-Type is set automatically from the body type</span>
        </div>
        <KeyValueEditor
          rows={scenario.headers}
          onChange={(rows) => set({ headers: rows.map(({ key, value }) => ({ key, value })) })}
          suggestions={HEADER_SUGGESTIONS}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700 pt-4">
        {isLive ? (
          <span className="flex items-center gap-2 text-[12px] text-brand-300">
            <Radio className="size-3.5" /> This scenario is live — the mock server returns it.
          </span>
        ) : (
          <Button size="sm" variant="outline" icon={<Radio className="size-3.5" />} onClick={onMakeLive}>
            Make this scenario live
          </Button>
        )}
        <Tooltip content={canDelete ? "Delete scenario" : "An endpoint needs at least one scenario"}>
          <span>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={onDelete} disabled={!canDelete}>
              Delete scenario
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
