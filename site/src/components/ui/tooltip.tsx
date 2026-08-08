"use client";

import { useCallback, useId, useRef, useState } from "react";
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
 */
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
  const [open, setOpen] = useState(false);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    // Short enough to feel immediate, long enough that sweeping the pointer across a week of
    // cells does not flash a tooltip over every one of them.
    timer.current = setTimeout(() => setOpen(true), 120);
  }, []);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }, []);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onBlur={hide}
      onFocus={show}
      onKeyDown={(event) => {
        if (event.key === "Escape") hide();
      }}
      onPointerEnter={show}
      onPointerLeave={hide}
    >
      <span aria-describedby={open ? id : undefined} className="contents">
        {children}
      </span>
      {open ? (
        <span
          className={cn(
            "pointer-events-none absolute left-1/2 z-50 w-max max-w-[min(320px,60vw)] -translate-x-1/2",
            "rounded-lg border border-[#3f3f46] bg-[#101013] px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,.65)]",
            "[animation:bai-tip_120ms_ease-out]",
            side === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
          )}
          id={id}
          role="tooltip"
        >
          {label ? (
            <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">
              {label}
            </span>
          ) : null}
          <span className="block text-[12px] leading-[1.5] text-[#e4e4e7]">{content}</span>
        </span>
      ) : null}
    </span>
  );
}
