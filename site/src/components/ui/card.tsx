import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-7 pb-0 md:p-9 md:pb-0", className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-7 md:p-9", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-2xl font-semibold leading-tight tracking-[-0.035em]",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "mt-3 text-base leading-7 text-[var(--muted-foreground)]",
        className
      )}
      {...props}
    />
  );
}
