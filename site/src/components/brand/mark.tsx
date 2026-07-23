import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-grid size-8 grid-cols-2 gap-0.5 rounded-[0.45rem] bg-[var(--obsidian)] p-1.5",
        className
      )}
    >
      <span className="rounded-[0.12rem] bg-[var(--snow)]" />
      <span className="rounded-[0.12rem] bg-[var(--accent)]" />
      <span className="col-span-2 rounded-[0.12rem] bg-[var(--snow)]" />
    </span>
  );
}

export function ConfettiMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 rotate-12 rounded-sm bg-[var(--magenta-spark)]"
    />
  );
}
