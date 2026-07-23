import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "dark";
}) {
  const tones = {
    neutral: "border-[var(--border)] bg-[var(--secondary)] text-[var(--steel)]",
    accent:
      "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--obsidian)]",
    success:
      "border-[var(--success-soft)] bg-[var(--success-soft)] text-[var(--success)]",
    warning:
      "border-[var(--warning-soft)] bg-[var(--warning-soft)] text-[var(--warning)]",
    danger:
      "border-[var(--destructive-soft)] bg-[var(--destructive-soft)] text-[var(--destructive)]",
    dark: "border-[var(--iron)] bg-[var(--graphite)] text-[var(--snow)]"
  };
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-[var(--radius-pill)] border px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em]",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
