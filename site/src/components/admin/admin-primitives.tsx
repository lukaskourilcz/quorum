import { cva, type VariantProps } from "class-variance-authority";
import { Circle } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  TextareaHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="m-0 text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{eyebrow}</p> : null}
        <h1 className="m-0 text-[length:var(--admin-type-page)] font-semibold tracking-[var(--admin-tracking-tight)] text-[var(--admin-foreground)]">{title}</h1>
        {description ? <p className="m-0 mt-1 max-w-3xl text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function AdminSectionHeading({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="m-0 text-[length:var(--admin-type-section)] font-semibold tracking-[-0.01em] text-[var(--admin-foreground)]">{title}</h2>
        {description ? <p className="m-0 mt-0.5 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function AdminCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--admin-shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

export function AdminCardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-[var(--admin-border)] px-[var(--admin-card-padding)] py-3", className)} {...props} />;
}

export function AdminCardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-[var(--admin-card-padding)]", className)} {...props} />;
}

export function AdminCardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-[var(--admin-border)] px-[var(--admin-card-padding)] py-3", className)} {...props} />;
}

export function AdminMetric({
  label,
  value,
  note,
  progress,
  className,
  style,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  progress?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const clampedProgress = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));

  return (
    <div className={cn("min-w-0 bg-[var(--admin-surface)] px-4 py-3.5", className)} style={style}>
      <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{label}</p>
      <p className="admin-tabular m-0 mt-1.5 text-[length:var(--admin-type-metric)] font-semibold tracking-[-0.035em] text-[var(--admin-foreground)]">{value}</p>
      {clampedProgress === undefined ? null : (
        <span
          aria-label={`${clampedProgress.toFixed(0)}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={clampedProgress}
          className="mt-2 block h-1 overflow-hidden rounded-full bg-[var(--admin-surface-muted)]"
          role="progressbar"
        >
          <span
            className="block h-full rounded-full bg-[var(--admin-section-accent)]"
            style={{ width: `${clampedProgress.toFixed(0)}%` }}
          />
        </span>
      )}
      {note ? <p className="m-0 mt-1.5 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{note}</p> : null}
    </div>
  );
}

export const adminButtonVariants = cva(
  "admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center justify-center gap-1.5 rounded-[var(--admin-radius)] border px-3 text-[length:var(--admin-type-control)] font-semibold transition-colors duration-[var(--admin-motion-fast)] disabled:pointer-events-none disabled:opacity-50 md:min-h-[var(--admin-control-height)]",
  {
    variants: {
      variant: {
        primary: "border-[var(--admin-primary)] bg-[var(--admin-primary)] text-[var(--admin-primary-foreground)] hover:border-[var(--admin-primary-hover)] hover:bg-[var(--admin-primary-hover)]",
        secondary: "border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-[var(--admin-foreground)] hover:bg-[var(--admin-surface-hover)]",
        ghost: "border-transparent bg-transparent text-[var(--admin-foreground)] hover:bg-[var(--admin-surface-hover)]",
        destructive: "border-[var(--admin-destructive-button)] bg-[var(--admin-destructive-button)] text-[var(--admin-destructive-foreground)] hover:opacity-90",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

export interface AdminButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof adminButtonVariants> {}

export function AdminButton({ className, variant, type = "button", ...props }: AdminButtonProps) {
  return <button className={cn(adminButtonVariants({ variant }), className)} type={type} {...props} />;
}

const fieldControl =
  "admin-focus-ring min-h-[var(--admin-touch-target)] w-full rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] bg-[var(--admin-surface-inset)] px-3 text-[length:var(--admin-type-body)] text-[var(--admin-foreground)] placeholder:text-[var(--admin-foreground-subtle)] disabled:cursor-not-allowed disabled:opacity-55 md:min-h-[var(--admin-control-height)]";

export function AdminLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-[length:var(--admin-type-control)] font-medium text-[var(--admin-foreground)]", className)} {...props} />;
}

export function AdminInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldControl, className)} {...props} />;
}

export function AdminSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldControl, className)} {...props} />;
}

export function AdminTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldControl, "min-h-24 resize-y py-2", className)} {...props} />;
}

const adminBadgeVariants = cva(
  "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[length:var(--admin-type-label)] font-medium",
  {
    variants: {
      tone: {
        neutral: "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-foreground-muted)]",
        information: "border-[var(--admin-information)] bg-[var(--admin-information-soft)] text-[var(--admin-information)]",
        success: "border-[var(--admin-success)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
        warning: "border-[var(--admin-warning)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
        risk: "border-[var(--admin-risk)] bg-[var(--admin-risk-soft)] text-[var(--admin-risk)]",
        destructive: "border-[var(--admin-destructive)] bg-[var(--admin-destructive-soft)] text-[var(--admin-destructive)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface AdminBadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof adminBadgeVariants> {}

export function AdminStatusBadge({ className, tone, children, ...props }: AdminBadgeProps) {
  return (
    <span className={cn(adminBadgeVariants({ tone }), className)} data-tone={tone ?? "neutral"} {...props}>
      <Circle aria-hidden className="size-1.5 fill-current" strokeWidth={0} />
      {children}
    </span>
  );
}

export function AdminEntityBadge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-[var(--admin-radius-sm)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] px-2 py-0.5 text-[length:var(--admin-type-label)] font-medium text-[var(--admin-foreground-muted)]",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function AdminEmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-40 flex-col items-center justify-center rounded-[var(--admin-radius)] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-secondary)] p-6 text-center", className)}>
      {icon ? <div aria-hidden className="mb-2 text-[var(--admin-foreground-subtle)]">{icon}</div> : null}
      <p className="m-0 text-[length:var(--admin-type-body)] font-semibold text-[var(--admin-foreground)]">{title}</p>
      {description ? <p className="m-0 mt-1 max-w-md text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function AdminTableRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-label={label}
      className={cn("admin-focus-ring max-w-full overflow-x-auto rounded-[var(--admin-radius)] border border-[var(--admin-border)]", className)}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function AdminTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-left text-[length:var(--admin-type-control)]", className)} {...props} />;
}

export function AdminTableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-[var(--admin-row-dense)] border-b border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] px-3 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[0.06em] text-[var(--admin-foreground-muted)]", className)}
      {...props}
    />
  );
}

export function AdminTableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-[var(--admin-row-regular)] border-b border-[var(--admin-border)] px-3 text-[var(--admin-foreground)]", className)} {...props} />;
}

export function AdminListRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-h-[var(--admin-row-regular)] min-w-0 items-center gap-3 border-b border-[var(--admin-border)] px-3 py-2 last:border-b-0", className)}
      {...props}
    />
  );
}
