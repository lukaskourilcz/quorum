import type { CSSProperties } from "react";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminMetric,
  AdminSectionHeading,
} from "./admin-primitives";

/** Compatibility wrappers for panels that migrate to the shared foundation in #368. */

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

/**
 * Several panels below predate this shell and bring their own page gutters — `mx-auto`,
 * `max-w-[var(--container)]`, `px-5`, `pb-20`. Inside a 1,180px body those are a second set of
 * margins on top of the body's own. Neutralising them here keeps one layout owner without
 * rewriting six working panels that are correct about everything except where they sit.
 *
 * It targets direct `<section>` children only, so a panel that does not wrap one is unaffected.
 */
const UNWRAP =
  "[&>section]:mx-0 [&>section]:mt-0 [&>section]:max-w-none [&>section]:px-0 [&>section]:pb-0";

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
      <AdminCardContent className={UNWRAP}>{children}</AdminCardContent>
    </AdminCard>
  );
}
