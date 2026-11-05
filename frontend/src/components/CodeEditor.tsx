import { lazy, Suspense } from "react";
import { cn } from "../lib/cn";

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: "json" | "plaintext";
  readOnly?: boolean;
  height?: number | string;
  onSave?: () => void;
  onSubmit?: () => void;
  highlightTemplates?: boolean;
  ariaLabel?: string;
  lineNumbers?: boolean;
  className?: string;
}

// Monaco is large, so it's loaded on demand the first time an editor appears.
const MonacoEditor = lazy(() => import("./MonacoEditor"));

export function CodeEditor({ className, height = 280, ...props }: CodeEditorProps) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-ink-700 bg-ink-900", className)}
      style={{ height }}
    >
      <Suspense fallback={<div className="skeleton h-full w-full rounded-none opacity-60" />}>
        <MonacoEditor height="100%" {...props} />
      </Suspense>
    </div>
  );
}
