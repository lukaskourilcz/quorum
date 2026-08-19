"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DialogClassNames {
  root?: string;
  backdrop?: string;
  surface?: string;
  header?: string;
  eyebrow?: string;
  title?: string;
  close?: string;
  body?: string;
  footer?: string;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Override for the generated id, when a caller wants to name the title element itself. */
  labelledBy?: string;
  /** Optional visual slots. Defaults preserve the public dialog exactly. */
  classNames?: DialogClassNames;
  /** Data attributes copied to the portal root so a scoped token system can cross the portal. */
  scopeAttributes?: Record<`data-${string}`, string>;
}

/**
 * A modal dialog, with the parts that make one a dialog rather than a box on top of a page.
 *
 * Written once because two places need it and both had been approximating it: the facilities plan
 * opened a room by reframing the drawing around it, which is a zoom rather than a dialog, and the
 * footers opened their content by navigating away. The accessibility bar is not negotiable and is
 * exactly the list a reader who cannot use a mouse needs — focus moves in on open and returns to
 * the control that opened it, Tab cannot leave, Escape closes, the backdrop closes, the title
 * names the dialog through `aria-labelledby`, and the page behind it does not scroll.
 *
 * Rendered into the body. A dialog that lives inside the section that opened it inherits that
 * section's transforms, stacking context and overflow — the office walkthrough has all three, and
 * a decorative layer with `pointer-events: none` sitting over the content is exactly the kind of
 * neighbour a modal must not have to negotiate with.
 */
export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  labelledBy,
  classNames,
  scopeAttributes
}: DialogProps) {
  const generated = useId();
  const titleId = labelledBy ?? `${generated}-title`;
  const surface = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  /*
   * Focus in, focus trapped, focus back.
   *
   * All three in one effect because they are one lifecycle: the element to focus is the one React
   * has just rendered, and the element to return to is the one that was focused before it did.
   * Focusing from inside the click handler races the commit and lands on the body.
   */
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const node = surface.current;
    node?.focus();

    const focusable = () => [...(node?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    ) ?? [])].filter((element) => element.offsetParent !== null || element === document.activeElement);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        node?.focus();
        return;
      }
      const first = items[0]!;
      const last = items.at(-1)!;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // The page behind a modal does not scroll. Restored exactly, because another component may
    // have set it — the walkthrough locks scrolling during its own performance.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      const target = opener.current;
      if (target instanceof HTMLElement || target instanceof SVGElement) target.focus();
    };
  }, [open, close]);

  if (!open) return null;

  return createPortal(
    <div
      {...scopeAttributes}
      className={cn("fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8", classNames?.root)}
      data-dialog-root
    >
      {/* The backdrop closes, and is not a button: a click target that is the whole screen should
          not appear in the tab order or be announced. Escape is the keyboard's way out. */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 bg-[rgba(6,6,8,.78)] backdrop-blur-[6px] motion-safe:[animation:bai-dialog-in_160ms_ease-out]",
          classNames?.backdrop
        )}
        data-dialog-backdrop
        onClick={close}
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "relative flex max-h-full w-full max-w-[min(920px,100%)] flex-col overflow-hidden rounded-[14px] border border-[#3f3f46] bg-[rgba(11,11,13,.98)] shadow-[0_40px_120px_rgba(0,0,0,.7)] outline-none motion-safe:[animation:bai-dialog-in_200ms_cubic-bezier(.22,.61,.36,1)]",
          classNames?.surface
        )}
        data-dialog-surface
        ref={surface}
        role="dialog"
        tabIndex={-1}
      >
        <div className={cn("flex items-start gap-4 border-b border-[#26262b] px-5 py-4 md:px-7", classNames?.header)}>
          <div className="min-w-0">
            {eyebrow ? (
              <p className={cn("font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]", classNames?.eyebrow)}>{eyebrow}</p>
            ) : null}
            <h2 className={cn("mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#f4f4f5]", classNames?.title)} id={titleId}>
              {title}
            </h2>
          </div>
          <button
            aria-label="Close"
            className={cn(
              "ml-auto shrink-0 rounded-[9px] border border-[#3f3f46] bg-[#101013] px-2.5 py-1 font-mono text-[13px] leading-none text-[#d4d4d8] transition-colors hover:border-[#a1a1aa] hover:text-[#f4f4f5]",
              classNames?.close
            )}
            data-dialog-close
            onClick={close}
            type="button"
          >
            ×
          </button>
        </div>
        {/*
          The body scrolls, the page does not. Above 1280×800 the callers size their content to fit
          without it; below that a dialog that scrolls is the honest answer to a small screen.
        */}
        <div className={cn("min-w-0 flex-1 overflow-y-auto px-5 py-5 md:px-7", classNames?.body)} data-dialog-body data-wheel-exempt>
          {children}
        </div>
        {footer ? (
          <div className={cn("border-t border-[#26262b] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c] md:px-7", classNames?.footer)}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
