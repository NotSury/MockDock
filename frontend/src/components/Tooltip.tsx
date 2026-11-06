import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RT.Provider delayDuration={350} skipDelayDuration={150}>
      {children}
    </RT.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "top",
  shortcut,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  shortcut?: string;
}) {
  if (!content) return <>{children}</>;
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          className="z-[60] flex max-w-xs items-center gap-2 rounded-md border border-ink-600 bg-ink-750 px-2 py-1 text-[11.5px] text-fg shadow-xl shadow-black/40 animate-scale-in"
        >
          {content}
          {shortcut && (
            <span className="rounded border border-ink-500 px-1 font-mono text-[10px] text-fg-subtle">{shortcut}</span>
          )}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
