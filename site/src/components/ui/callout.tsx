import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Callout({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "accent" | "warning" | "danger";
}) {
  const tones = {
    neutral: "border-[var(--border)] bg-[var(--card)]",
    accent: "border-[var(--accent)] bg-[var(--surface-raised)]",
    warning: "border-[var(--warning)] bg-[var(--warning-soft)]",
    danger: "border-[var(--destructive)] bg-[var(--destructive-soft)]"
  };
  return (
    <div
      className={cn(
        "rounded-[var(--radius-button)] border border-l-[3px] p-5 text-sm leading-6",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
