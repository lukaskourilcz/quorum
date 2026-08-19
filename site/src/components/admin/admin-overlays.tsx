"use client";

import type { ComponentProps } from "react";
import { Dialog, type DialogClassNames, type DialogProps } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AdminTheme = "light" | "dark";

export interface AdminDialogProps
  extends Omit<DialogProps, "classNames" | "scopeAttributes"> {
  theme?: AdminTheme;
  classNames?: DialogClassNames;
}

export function AdminDialog({ theme = "dark", classNames, ...props }: AdminDialogProps) {
  return (
    <Dialog
      {...props}
      classNames={{
        root: cn("text-[length:var(--admin-type-body)] text-[var(--admin-foreground)]", classNames?.root),
        backdrop: cn("bg-[var(--admin-overlay)] backdrop-blur-sm", classNames?.backdrop),
        surface: cn(
          "max-w-2xl rounded-[var(--admin-radius-xl)] border-[var(--admin-border-strong)] bg-[var(--admin-surface-elevated)] shadow-[var(--admin-shadow-elevated)]",
          classNames?.surface,
        ),
        header: cn("border-[var(--admin-border)] px-5 py-4", classNames?.header),
        eyebrow: cn("font-sans text-[length:var(--admin-type-micro)] font-semibold tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]", classNames?.eyebrow),
        title: cn("text-[length:var(--admin-type-dialog)] text-[var(--admin-foreground)]", classNames?.title),
        close: cn(
          "admin-focus-ring min-h-[var(--admin-touch-target)] min-w-[var(--admin-touch-target)] rounded-[var(--admin-radius)] border-[var(--admin-border-strong)] bg-[var(--admin-surface-secondary)] text-[var(--admin-foreground-muted)] hover:border-[var(--admin-border-strong)] hover:bg-[var(--admin-surface-hover)] hover:text-[var(--admin-foreground)] md:min-h-[var(--admin-control-height)] md:min-w-[var(--admin-control-height)]",
          classNames?.close,
        ),
        body: cn("px-5 py-4", classNames?.body),
        footer: cn("border-[var(--admin-border)] px-5 py-3 font-sans text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]", classNames?.footer),
      }}
      scopeAttributes={{ "data-admin": "", "data-admin-theme": theme }}
    />
  );
}

export interface AdminTooltipProps
  extends Omit<ComponentProps<typeof Tooltip>, "scopeAttributes"> {
  theme?: AdminTheme;
}

export function AdminTooltip({
  theme = "dark",
  bubbleClassName,
  labelClassName,
  contentClassName,
  ...props
}: AdminTooltipProps) {
  return (
    <Tooltip
      {...props}
      bubbleClassName={cn(
        "rounded-[var(--admin-radius)] border-[var(--admin-border-strong)] bg-[var(--admin-surface-elevated)] shadow-[var(--admin-shadow-elevated)]",
        bubbleClassName,
      )}
      contentClassName={cn("text-[length:var(--admin-type-control)] text-[var(--admin-foreground)]", contentClassName)}
      labelClassName={cn("font-sans text-[length:var(--admin-type-micro)] font-semibold tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]", labelClassName)}
      scopeAttributes={{ "data-admin": "", "data-admin-theme": theme }}
    />
  );
}
