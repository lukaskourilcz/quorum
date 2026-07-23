import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] border px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--iron)]",
        secondary:
          "border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] hover:bg-[var(--secondary)]",
        accent:
          "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]",
        ghost:
          "border-transparent bg-transparent text-[var(--foreground)] hover:bg-[var(--secondary)]"
      },
      size: {
        default: "min-h-11",
        small: "min-h-9 px-4 py-1.5 text-xs",
        large: "min-h-13 px-6 py-3"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
