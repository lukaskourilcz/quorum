import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-left text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHead({
  className,
  ...props
}: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-[var(--border)] px-4 py-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted-foreground)] first:pl-0 last:pr-0",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-[var(--border)] px-4 py-4 align-top first:pl-0 last:pr-0",
        className
      )}
      {...props}
    />
  );
}
