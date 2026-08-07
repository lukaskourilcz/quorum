import type { CSSProperties, ReactNode } from "react";

/**
 * One section's backdrop: a 16:9 photographic plate, oversized so it covers any viewport.
 *
 * Two things here were real bugs and must not come back.
 *
 * The plate is centred with `left/top: 50%` plus `translate(-50%, -50%)` and never with grid
 * centring: an oversized grid item is start-aligned in Chrome, so `place-items: center` put the
 * left edge of a 2.4×-viewport image at the left edge of the screen and the room was never in
 * frame. And every decorative layer carries `pointer-events: none`, because in section 05 the
 * mood tint sits *after* the content in DOM order — that is what dims the room light around the
 * lit screen — and without the rule it swallowed every click on the wallboard. The "Full KPIs"
 * button looked live and did nothing.
 *
 * The images are served as AVIF with a WebP fallback and no `next/image` in between. They are
 * already 3–40 KB at their native 1376×768, so a resize pipeline would add a request and a
 * transformation to save nothing. Only the intro plate loads eagerly; the rest are `lazy`, which
 * lets the browser start them from its own viewport-proximity margin as the visitor walks down.
 */
export function OfficePlate({
  image,
  alt,
  width,
  filter,
  plateY,
  eager = false,
  children
}: {
  /** Base name under `/office`, without extension. */
  image: string;
  alt: string;
  /** The plate's CSS width, e.g. `max(168vw, 300svh)`. */
  width: string;
  /** The photographic treatment, e.g. `saturate(.7) brightness(.7)`. */
  filter: string;
  /** Extra vertical offset applied before the parallax translate, e.g. `10.2%`. */
  plateY?: string;
  eager?: boolean;
  /** Drawn inside the plate, so it tracks the photograph — the wallboard uses this. */
  children?: ReactNode;
}) {
  // No `will-change: transform` here, deliberately. Seven plates, each 2,000–2,700 CSS pixels wide
  // and scaled 1.07, is seven permanently promoted compositor layers; together with the header's
  // and the panels' `backdrop-filter` that was enough to exhaust the GPU layer budget, and Chrome
  // answered by painting whole frames black — every section below the first rendered as an empty
  // dark rectangle while the DOM underneath was perfectly correct. The transform still gets its
  // own layer for the duration of the scroll; it just does not hold one for the life of the page.
  const style: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%)${plateY ? ` translateY(${plateY})` : ""}`,
    width,
    aspectRatio: "1376 / 768"
  };
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div data-plate-inner data-plate-y={plateY} style={style}>
        <picture>
          <source srcSet={`/office/${image}.avif`} type="image/avif" />
          <img
            alt={alt}
            className="absolute inset-0 size-full object-cover"
            decoding="async"
            fetchPriority={eager ? "high" : "auto"}
            height={768}
            loading={eager ? "eager" : "lazy"}
            src={`/office/${image}.webp`}
            style={{ filter }}
            width={1376}
          />
        </picture>
        {children}
      </div>
    </div>
  );
}

/** The time-of-day wash. Sits over the photograph and under the content, and never takes a click. */
export function OfficeMood({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className ?? ""}`}
      style={{ background: "var(--bai-tint)" }}
    />
  );
}
