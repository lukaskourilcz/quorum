import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function StatusPill({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--steel)] bg-[var(--surface)] px-3.5 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--foreground)]",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="status-pulse size-1.5 rounded-full bg-[var(--accent)]"
      />
      {children}
    </span>
  );
}
