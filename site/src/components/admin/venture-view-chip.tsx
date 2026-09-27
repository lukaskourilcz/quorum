import Link from "next/link";

/**
 * One chip in a workspace's view switcher.
 *
 * The tint resolves against the current Admin surface rather than the old near-black canvas, so
 * the same brand signal reads in both themes while the shared foreground token keeps the label
 * legible. `small` is the archive's second row, which is subordinate to the two above it.
 */
export function VentureViewChip({
  brand,
  current,
  href,
  label,
  on,
  small = false
}: {
  brand: string;
  /**
   * Whether this chip is the page the reader is on.
   *
   * Separate from `on`, which is only the tint. `Archive` is lit while the reader is inside it and
   * points at its first view, so marking it current put `aria-current="page"` on two links with
   * the same href — the group's chip and the view's own. The view's is the true one.
   */
  current?: boolean;
  href: string;
  label: string;
  on: boolean;
  small?: boolean;
}) {
  return (
    <Link
      aria-current={(current ?? on) ? "page" : undefined}
      className={`admin-focus-ring min-h-[var(--admin-touch-target)] rounded-[var(--admin-radius)] border px-3 py-2 font-semibold uppercase tracking-[var(--admin-tracking-label)] transition-colors duration-[var(--admin-motion-fast)] md:min-h-[var(--admin-control-height)] ${small ? "text-[length:var(--admin-type-micro)]" : "text-[length:var(--admin-type-label)]"}`}
      data-admin-view-chip={label}
      href={href}
      scroll={false}
      style={{
        borderColor: on ? brand : "var(--admin-border-strong)",
        background: on
          ? `color-mix(in srgb, ${brand} 15%, var(--admin-surface-secondary))`
          : "var(--admin-surface-secondary)",
        color: "var(--admin-foreground)"
      }}
    >
      {label}
    </Link>
  );
}
