import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MessageList({
  className,
  ...props
}: HTMLAttributes<HTMLOListElement>) {
  return (
    <ol
      className={cn(
        "grid gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 md:gap-5 md:p-6",
        className
      )}
      {...props}
    />
  );
}

export function Message({
  className,
  align = "start",
  emphasis = "default",
  ...props
}: HTMLAttributes<HTMLLIElement> & {
  align?: "start" | "end";
  emphasis?: "default" | "accent" | "muted";
}) {
  return (
    <li
      className={cn(
        "flex w-full gap-3 md:gap-4",
        align === "end" && "flex-row-reverse",
        emphasis === "muted" && "opacity-90",
        className
      )}
      {...props}
    />
  );
}

export function MessageAvatar({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center gap-1.5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MessageBubble({
  className,
  align = "start",
  emphasis = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  align?: "start" | "end";
  emphasis?: "default" | "accent" | "control";
}) {
  const emphasisClass =
    emphasis === "control"
      ? "border-l-[3px] border-l-[var(--accent)]"
      : emphasis === "accent"
        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_9%,var(--card))]"
        : "";
  return (
    <div
      className={cn(
        "min-w-0 max-w-full flex-1 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5",
        align === "end" && "text-right",
        emphasisClass,
        className
      )}
      {...props}
    />
  );
}

export function MessageHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5",
        className
      )}
      {...props}
    />
  );
}

export function MessageName({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-mono text-[0.8125rem] font-semibold tracking-[-0.01em] text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}

export function MessageRole({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "min-w-0 truncate text-[0.75rem] text-[var(--fog)]",
        className
      )}
      {...props}
    />
  );
}

export function MessageContent({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "break-words text-[0.9375rem] leading-7 text-[var(--mist)] md:text-base",
        className
      )}
      {...props}
    />
  );
}

export function MessageMeta({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]",
        className
      )}
      {...props}
    />
  );
}
