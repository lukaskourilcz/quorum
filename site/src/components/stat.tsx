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
    <div className="border-t border-[var(--border)] pt-5">
      <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
        {label}
      </p>
      <p className="mt-3 text-[2.375rem] font-semibold tracking-[-0.05em]">{value}</p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-[var(--fog)]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
