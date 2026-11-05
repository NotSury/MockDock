import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "xs" | "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-400 text-ink-950 font-semibold hover:bg-brand-300 shadow-[0_0_0_1px_rgb(45_212_191/0.4),0_6px_20px_-6px_rgb(45_212_191/0.45)] disabled:bg-brand-400/40 disabled:shadow-none",
  secondary:
    "bg-ink-700 text-fg hover:bg-ink-600 border border-ink-600 hover:border-ink-500 disabled:opacity-50",
  outline: "border border-ink-600 text-fg-muted hover:text-fg hover:border-ink-500 hover:bg-ink-750 disabled:opacity-50",
  ghost: "text-fg-muted hover:text-fg hover:bg-ink-700/70 disabled:opacity-40",
  danger:
    "bg-err/10 text-err border border-err/25 hover:bg-err/20 hover:border-err/40 disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  xs: "h-6 px-2 text-[11.5px] gap-1 rounded-md",
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5 rounded-md",
  md: "h-8 px-3.5 text-[13px] gap-2 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 active:scale-[0.98]",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { className, label, size = "sm", variant = "ghost", children, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      variant={variant}
      size={size}
      className={cn(size === "xs" ? "w-6 px-0" : size === "sm" ? "w-7 px-0" : "w-8 px-0", className)}
      {...rest}
    >
      {children}
    </Button>
  );
});

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-ink-500/70 bg-ink-750 px-1 font-mono text-[10px] font-medium text-fg-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-fg-subtle", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center animate-fade-in",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-16",
        className,
      )}
    >
      {icon && (
        <div className="relative mb-1">
          <div className="absolute inset-0 rounded-2xl bg-brand-400/10 blur-xl" />
          <div className="relative grid size-11 place-items-center rounded-xl border border-ink-600 bg-ink-800 text-fg-muted [&_svg]:size-5">
            {icon}
          </div>
        </div>
      )}
      <div className="text-[14px] font-semibold text-fg">{title}</div>
      {description && <div className="max-w-sm text-[12.5px] leading-relaxed text-fg-subtle">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: "xs" | "sm";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-lg border border-ink-600 bg-ink-900 p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 font-medium transition-all duration-150",
            size === "xs" ? "h-5 text-[11px]" : "h-6 text-[12px]",
            value === o.value
              ? "bg-ink-600 text-fg shadow-[0_1px_2px_rgb(0_0_0/0.4)]"
              : "text-fg-subtle hover:text-fg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: ReactNode; badge?: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-1 border-b border-ink-700", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "relative -mb-px flex h-9 items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors",
            value === t.value ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
          )}
        >
          {t.label}
          {t.badge}
          <span
            className={cn(
              "absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-brand-400 transition-all duration-200",
              value === t.value ? "opacity-100" : "scale-x-50 opacity-0",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function CountBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-600 px-1 text-[10px] font-semibold tabular-nums text-fg-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-fg-subtle">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
