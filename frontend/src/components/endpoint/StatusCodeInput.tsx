import * as DM from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import { COMMON_STATUSES, statusText, statusTone } from "../../lib/http";
import { TONE_CLASSES } from "../Badges";
import { Menu, MenuContent, MenuTrigger } from "../Menu";

export function StatusCodeInput({
  value,
  onChange,
  min = 200,
  id,
  codes = COMMON_STATUSES,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  id?: string;
  codes?: number[];
}) {
  const tone = TONE_CLASSES[statusTone(value)];
  const invalid = !Number.isInteger(value) || value < min || value > 599;
  return (
    <div className={cn("flex h-8 items-center rounded-md border bg-ink-900 focus-within:border-brand-500/70", invalid ? "border-err/60" : "border-ink-600")}>
      <span className={cn("ml-2.5 size-2 shrink-0 rounded-full", tone.dot)} />
      <input
        id={id}
        type="number"
        min={min}
        max={599}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="h-full w-14 min-w-0 bg-transparent px-2 font-mono text-[13px] font-semibold text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        aria-label="Status code"
      />
      <span className="min-w-0 flex-1 truncate text-[12px] text-fg-subtle">{statusText(value)}</span>
      <Menu>
        <MenuTrigger asChild>
          <button type="button" aria-label="Choose status code" className="grid h-full w-7 place-items-center border-l border-ink-700 text-fg-subtle hover:text-fg">
            <ChevronDown className="size-3.5" />
          </button>
        </MenuTrigger>
        <MenuContent>
          <div className="max-h-72 overflow-y-auto">
            {codes.filter((c) => c >= min).map((c) => (
              <DM.Item
                key={c}
                onSelect={() => onChange(c)}
                className="flex h-7 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[12px] outline-none data-[highlighted]:bg-ink-700"
              >
                <span className={cn("size-1.5 rounded-full", TONE_CLASSES[statusTone(c)].dot)} />
                <span className="w-8 font-mono font-semibold text-fg">{c}</span>
                <span className="text-fg-subtle">{statusText(c)}</span>
              </DM.Item>
            ))}
          </div>
        </MenuContent>
      </Menu>
    </div>
  );
}
