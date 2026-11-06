import { cn } from "../../lib/cn";

/** Renders a route path with :params highlighted. */
export function PathText({ path, className }: { path: string; className?: string }) {
  const parts = path.split(/(:[A-Za-z_][A-Za-z0-9_]*)/g);
  return (
    <span className={cn("font-mono", className)}>
      {parts.map((p, i) =>
        p.startsWith(":") ? (
          <span key={i} className="text-put/90">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}
