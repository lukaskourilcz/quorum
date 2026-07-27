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
    neutral: "border-[var(--slate)] bg-transparent text-[var(--ash)]",
    accent:
      "border-[var(--accent)] bg-[var(--accent)] text-[var(--obsidian)]",
    success:
      "border-[var(--success-soft)] bg-[var(--success-soft)] text-[var(--success)]",
    warning:
      "border-[var(--warning-soft)] bg-[var(--warning-soft)] text-[var(--warning)]",
    danger:
      "border-[var(--destructive-soft)] bg-[var(--destructive-soft)] text-[var(--destructive)]",
    dark: "border-[var(--slate)] bg-transparent text-[var(--paper)]"
  };
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-[var(--radius-pill)] border px-3 py-1 font-mono text-[0.65625rem] font-medium uppercase tracking-[0.14em]",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
