import * as Popover from "@radix-ui/react-dialog";
import { Braces } from "lucide-react";
import { useState } from "react";
import { TEMPLATE_VARIABLES } from "../../lib/template";
import { CopyButton } from "../CopyButton";
import { Button } from "../ui";

/** Small reference sheet for {{template}} variables. */
export function TemplateHelp() {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="xs" variant="ghost" icon={<Braces className="size-3" />}>
          Variables
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay className="fixed inset-0 z-50 bg-black/40 animate-fade-in" />
        <Popover.Content className="fixed left-1/2 top-[15vh] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-ink-600 bg-ink-800 p-5 shadow-2xl animate-scale-in focus:outline-none">
          <Popover.Title className="text-[14px] font-semibold text-fg">Response templating</Popover.Title>
          <Popover.Description className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
            Use placeholders in bodies and header values; they're filled from the incoming request. Inside a string they
            become text; written bare (<span className="font-mono text-fg-muted">"id": {"{{params.id}}"}</span>) they become a
            JSON value.
          </Popover.Description>
          <ul className="mt-4 divide-y divide-ink-700 rounded-lg border border-ink-700">
            {TEMPLATE_VARIABLES.map((v) => (
              <li key={v.expr} className="flex items-center gap-3 px-3 py-2">
                <code className="w-40 shrink-0 font-mono text-[12px] text-[#fbbf77]">{v.expr}</code>
                <span className="flex-1 text-[12px] text-fg-subtle">{v.desc}</span>
                <CopyButton value={v.expr} size="xs" />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Popover.Close asChild>
              <Button size="sm">Got it</Button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
