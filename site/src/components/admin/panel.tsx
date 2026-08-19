import type { CSSProperties } from "react";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminMetric,
  AdminSectionHeading,
} from "./admin-primitives";

/** Compatibility wrappers for panels migrated to the shared Admin foundation. */

export function Tile({
  label,
  value,
  foot,
  percent,
  brand
}: {
  label: string;
  value: string;
  foot: string;
  percent: number;
  brand: string;
}) {
  return (
    <AdminMetric
      label={label}
      note={foot}
      progress={percent}
      style={{ "--admin-section-accent": brand } as CSSProperties}
      value={value}
    />
  );
}

export function Panel({
  title,
  note,
  children
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminSectionHeading
          actions={note ? (
            <span className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{note}</span>
          ) : undefined}
          title={title}
        />
      </AdminCardHeader>
      <AdminCardContent>{children}</AdminCardContent>
    </AdminCard>
  );
}
