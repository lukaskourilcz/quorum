import { cn } from "@/lib/utils";

export function Progress({
  value,
  max = 100,
  className
}: {
  value: number;
  max?: number;
  className?: string;
}) {
  const width = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      aria-label={`${value} of ${max}`}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={value}
      className={cn(
        "h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--border)]",
        className
      )}
      role="progressbar"
    >
      <div
        className="h-full rounded-[var(--radius-pill)] bg-[var(--accent)]"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
