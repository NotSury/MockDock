import * as DM from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" | "center" }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-[190px] rounded-lg border border-ink-600 bg-ink-800 p-1 shadow-2xl shadow-black/50 animate-scale-in"
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({
  children,
  icon,
  onSelect,
  danger,
  shortcut,
  disabled,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  shortcut?: string;
  disabled?: boolean;
}) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2 text-[12.5px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-3.5",
        danger
          ? "text-err data-[highlighted]:bg-err/10"
          : "text-fg-muted data-[highlighted]:bg-ink-700 data-[highlighted]:text-fg",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="font-mono text-[10.5px] text-fg-faint">{shortcut}</span>}
    </DM.Item>
  );
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-ink-700" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">{children}</DM.Label>;
}
