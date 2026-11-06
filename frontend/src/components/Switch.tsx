import * as RS from "@radix-ui/react-switch";
import { cn } from "../lib/cn";

export function Switch({
  checked,
  onCheckedChange,
  label,
  size = "md",
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  return (
    <RS.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "relative shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-50",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        checked ? "border-brand-400/50 bg-brand-400/90" : "border-ink-500 bg-ink-700",
      )}
    >
      <RS.Thumb
        className={cn(
          "block rounded-full shadow-sm transition-transform duration-200",
          size === "sm" ? "size-3 translate-x-[1px] data-[state=checked]:translate-x-[13px]" : "size-4 translate-x-[1px] data-[state=checked]:translate-x-[17px]",
          checked ? "bg-ink-950" : "bg-fg-subtle",
        )}
      />
    </RS.Root>
  );
}
