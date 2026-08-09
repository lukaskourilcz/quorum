"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A tooltip in the house style, built the way everything else under `ui/` is built.
 *
 * shadcn's tooltip is a thin skin over Radix, and this repository carries no Radix — the whole of
 * `ui/` is hand-rolled against the brand tokens. So this is the same component with the same
 * behaviour and the same surface, written against `clsx` and `tailwind-merge` like its neighbours,
 * and costing no new dependency.
 *
 * It replaces the native `title` attribute, which is where these sentences used to live. A `title`
 * cannot be styled, cannot wrap where you want it to, waits about a second before appearing, never
 * appears at all on touch, and is read out twice by some screen readers. This one shows on hover
 * and on focus, dismisses on Escape, and carries the sentence in the accessible tree exactly once
 * through `aria-describedby`.
 *
 * ## Why it is a portal
 *
 * It used to be an absolutely-positioned child of its trigger, which is fine until the trigger
 * lives inside something that scrolls or paints over it. On the calendar it does both: the row
 * block is `overflow-y-auto`, so a tooltip on the first two rows was clipped at the block's top
 * edge, and the header row of days and dates sits above it in the same stacking context, so
 * whatever survived the clip went behind the dates. No z-index fixes either of those — an
 * ancestor's `overflow` is not a stacking question — so the bubble is rendered into the document
 * body and positioned from the trigger's own rectangle. It then also flips below the trigger when
 * there is not room above, which is what makes a top-row tooltip readable rather than merely
 * unclipped.
 */

interface Placement {
  left: number;
  top: number;
  side: "top" | "bottom";
}

/**
 * Where the room above a trigger actually runs out.
 *
 * The viewport is the wrong answer. A trigger on the calendar's first row has half a screen above
 * it and no room at all: the row block clips at its own top edge, and the header row of days and
 * dates paints immediately above that. So the ceiling is the nearest scrolling ancestor's top,
 * and the viewport's only where there is no such ancestor.
 */
function ceilingAbove(node: HTMLElement | null): number {
  for (let element = node?.parentElement ?? null; element; element = element.parentElement) {
    const overflow = getComputedStyle(element).overflowY;
    if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") {
      return element.getBoundingClientRect().top;
    }
  }
  return 0;
}

/** Where the bubble goes, measured from the trigger and clamped to the viewport. */
function placeFor(rect: DOMRect, preferred: "top" | "bottom", ceiling: number): Placement {
  // 96px is a comfortable bubble at the calendar's two-line copy; anything less and the flip is
  // the honest answer. Measured against the trigger rather than assumed from the row index, so a
  // panel that has been scrolled gets the same treatment as one that has not.
  const room = 96;
  const side = preferred === "top" && rect.top - ceiling < room ? "bottom" : preferred;
  const margin = 12;
  const half = Math.min(320, Math.round(window.innerWidth * 0.6)) / 2;
  return {
    left: Math.min(Math.max(rect.left + rect.width / 2, half + margin), window.innerWidth - half - margin),
    top: side === "top" ? rect.top - 8 : rect.bottom + 8,
    side
  };
}

export function Tooltip({
  children,
  content,
  label,
  className,
  side = "top"
}: {
  /** The element the tooltip describes. It must be able to take a ref and DOM handlers. */
  children: ReactNode;
  /** The body of the tooltip. */
  content: ReactNode;
  /** An optional heading above the body — the slot's hour and room, typically. */
  label?: ReactNode;
  className?: string;
  side?: "top" | "bottom";
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const anchor = useRef<HTMLSpanElement | null>(null);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    // Short enough to feel immediate, long enough that sweeping the pointer across a week of
    // cells does not flash a tooltip over every one of them.
    timer.current = setTimeout(() => {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect) setPlacement(placeFor(rect, side, ceilingAbove(anchor.current)));
    }, 120);
  }, [side]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPlacement(null);
  }, []);

  /*
   * A fixed bubble does not travel with its trigger, so it is dismissed rather than left behind.
   * Subscribing to scroll and resize is what an effect is for; the state change happens in the
   * callback, not in the effect body.
   */
  useEffect(() => {
    if (!placement) return;
    const dismiss = () => hide();
    window.addEventListener("scroll", dismiss, { capture: true, passive: true });
    window.addEventListener("resize", dismiss, { passive: true });
    return () => {
      window.removeEventListener("scroll", dismiss, { capture: true });
      window.removeEventListener("resize", dismiss);
    };
  }, [placement, hide]);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onBlur={hide}
      onFocus={show}
      onKeyDown={(event) => {
        if (event.key === "Escape") hide();
      }}
      data-tooltip-anchor
      onPointerEnter={show}
      onPointerLeave={hide}
      ref={anchor}
    >
      <span aria-describedby={placement ? id : undefined} className="contents">
        {children}
      </span>
      {placement
        ? createPortal(
            <span
              className={cn(
                "pointer-events-none fixed z-[100] w-max max-w-[min(320px,60vw)] -translate-x-1/2",
                "rounded-lg border border-[#3f3f46] bg-[#101013] px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,.65)]",
                "[animation:bai-tip_120ms_ease-out]",
                placement.side === "top" ? "-translate-y-full" : ""
              )}
              data-tooltip-side={placement.side}
              id={id}
              role="tooltip"
              style={{ left: `${placement.left}px`, top: `${placement.top}px` }}
            >
              {label ? (
                <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">
                  {label}
                </span>
              ) : null}
              <span className="block text-[12px] leading-[1.5] text-[#e4e4e7]">{content}</span>
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
