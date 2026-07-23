import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid size-8 place-items-center rounded-[0.45rem] bg-[var(--obsidian)] p-1 text-[var(--snow)]",
        className
      )}
    >
      <svg
        className="size-full"
        fill="currentColor"
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M4 6a2 2 0 0 1 2-2h8v6h-4v4H4V6Z" />
        <path d="M19 4h7a2 2 0 0 1 2 2v6h-6V10h-3V4Z" />
        <path d="M22 18h6v8a2 2 0 0 1-2 2h-8v-6h4v-4Z" />
        <path d="M4 19h6v3h4v6H6a2 2 0 0 1-2-2v-7Z" />
      </svg>
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
