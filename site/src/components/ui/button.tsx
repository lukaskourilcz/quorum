import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] border px-5 py-2.5 text-[0.84375rem] font-semibold transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] hover:text-[var(--obsidian)]",
        secondary:
          "border-[var(--steel)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--ash)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]",
        accent:
          "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] hover:-translate-y-px hover:bg-[var(--accent-hover)] hover:text-[var(--obsidian)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_35%,transparent)]",
        ghost:
          "border-transparent bg-transparent text-[var(--foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
      },
      size: {
        default: "min-h-11",
        small: "min-h-9 px-4 py-1.5 text-xs",
        large: "min-h-13.5 px-6.5 py-3.5"
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
