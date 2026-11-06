import { ChevronDown } from "lucide-react";
import { HTTP_METHODS, type HttpMethod } from "../../api/types";
import { cn } from "../../lib/cn";
import { methodStyle } from "../../lib/http";
import { Menu, MenuContent, MenuTrigger } from "../Menu";
import * as DM from "@radix-ui/react-dropdown-menu";

export function MethodSelect({
  value,
  onChange,
  className,
}: {
  value: HttpMethod;
  onChange: (m: HttpMethod) => void;
  className?: string;
}) {
  const s = methodStyle(value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={`HTTP method: ${value}`}
          className={cn(
            "flex h-9 w-[104px] shrink-0 items-center justify-between gap-1 rounded-l-lg border border-r-0 border-ink-600 bg-ink-800 pl-3 pr-2 font-mono text-[12.5px] font-bold tracking-wide transition-colors hover:bg-ink-750",
            s.text,
            className,
          )}
        >
          {value}
          <ChevronDown className="size-3.5 text-fg-subtle" />
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        {HTTP_METHODS.map((m) => (
          <DM.Item
            key={m}
            onSelect={() => onChange(m)}
            className={cn(
              "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 font-mono text-[12px] font-bold outline-none data-[highlighted]:bg-ink-700",
              methodStyle(m).text,
            )}
          >
            <span className={cn("size-1.5 rounded-full", methodStyle(m).dot)} />
            {m}
          </DM.Item>
        ))}
      </MenuContent>
    </Menu>
  );
}
