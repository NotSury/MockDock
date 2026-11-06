import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { copyText } from "../lib/format";
import { Tooltip } from "./Tooltip";

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "xs" | "sm";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied!" : label}>
      <button
        type="button"
        aria-label={label}
        onClick={async (e) => {
          e.stopPropagation();
          if (await copyText(value)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }
        }}
        className={cn(
          "grid shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-ink-700 hover:text-fg",
          size === "xs" ? "size-5" : "size-7",
          className,
        )}
      >
        {copied ? (
          <Check className={cn("text-ok animate-scale-in", size === "xs" ? "size-3" : "size-3.5")} />
        ) : (
          <Copy className={size === "xs" ? "size-3" : "size-3.5"} />
        )}
      </button>
    </Tooltip>
  );
}
