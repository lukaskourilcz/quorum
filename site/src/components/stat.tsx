import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  detail
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="border-t border-[var(--border)] pt-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.045em]">{value}</p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
