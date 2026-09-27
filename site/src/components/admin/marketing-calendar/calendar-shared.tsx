import {
  AtSign,
  Bot,
  Briefcase,
  Camera,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  CircleMinus,
  ClipboardCheck,
  Clapperboard,
  Clock3,
  GalleryHorizontalEnd,
  Globe,
  Hash,
  Image,
  Mail,
  Megaphone,
  MessageSquareText,
  MessagesSquare,
  PenLine,
  SquareCheck,
  TriangleAlert,
  UserRound,
  Users,
  type LucideIcon
} from "lucide-react";
import {
  CALENDAR_PRODUCER_LABELS,
  CALENDAR_STATUS_LABELS,
  type CalendarChannelPlatform,
  type CalendarKind,
  type CalendarProducer,
  type CalendarStatus
} from "@/lib/marketing-calendar-model";
import { cn } from "@/lib/utils";

/**
 * The Calendar's shared vocabulary: one icon per platform and per kind, one surface per status.
 *
 * Every status carries its own icon as well as its tone, so colour is never the only difference
 * (docs/ADMIN-DESIGN-SYSTEM.md, Focus and state). The venture hue arrives separately through
 * `--admin-section-accent` and only ever paints the thin identity stripe.
 */

export const PLATFORM_ICONS: Readonly<Record<CalendarChannelPlatform, LucideIcon>> = {
  instagram: Camera,
  threads: AtSign,
  linkedin: Briefcase,
  facebook: Users,
  reddit: MessagesSquare,
  newsletter: Mail,
  web: Globe,
  x: Hash
};

export const KIND_ICONS: Readonly<Record<CalendarKind, LucideIcon>> = {
  carousel: GalleryHorizontalEnd,
  reel: Clapperboard,
  post: Image,
  story: CircleDot,
  thread: MessageSquareText,
  reddit: MessagesSquare,
  ad: Megaphone,
  task: SquareCheck,
  review: ClipboardCheck,
  newsletter: Mail
};

export const STATUS_ICONS: Readonly<Record<CalendarStatus, LucideIcon>> = {
  planned: CircleDashed,
  drafted: PenLine,
  queued: Clock3,
  published: CheckCircle2,
  skipped: CircleMinus,
  blocked: TriangleAlert
};

/** Surface, border and text for a status: the cell and the badge share them. */
export const STATUS_SURFACES: Readonly<Record<CalendarStatus, string>> = {
  planned: "border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-[var(--admin-foreground)]",
  drafted: "border-[var(--admin-information)] bg-[var(--admin-information-soft)] text-[var(--admin-foreground)]",
  queued: "border-[var(--admin-brand)] bg-[var(--admin-surface-selected)] text-[var(--admin-foreground)]",
  published: "border-[var(--admin-success)] bg-[var(--admin-success-soft)] text-[var(--admin-foreground)]",
  skipped: "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-foreground-muted)]",
  blocked: "border-[var(--admin-warning)] bg-[var(--admin-warning-soft)] text-[var(--admin-foreground)]"
};

/** The status icon's own colour, which is what carries the tone inside a neutral-text cell. */
export const STATUS_INK: Readonly<Record<CalendarStatus, string>> = {
  planned: "text-[var(--admin-foreground-subtle)]",
  drafted: "text-[var(--admin-information)]",
  queued: "text-[var(--admin-brand)]",
  published: "text-[var(--admin-success)]",
  skipped: "text-[var(--admin-foreground-muted)]",
  blocked: "text-[var(--admin-warning)]"
};

export function StatusPill({ status, className }: { status: CalendarStatus; className?: string }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[length:var(--admin-type-label)] font-medium",
        STATUS_SURFACES[status],
        className
      )}
      data-calendar-status={status}
    >
      <Icon aria-hidden className={cn("size-3", STATUS_INK[status])} strokeWidth={2.25} />
      {CALENDAR_STATUS_LABELS[status]}
    </span>
  );
}

export function ProducerMark({ producer, showLabel = false }: { producer: CalendarProducer; showLabel?: boolean }) {
  const Icon = producer === "owner" ? UserRound : Bot;
  const label = CALENDAR_PRODUCER_LABELS[producer];
  return (
    <span className="inline-flex items-center gap-1 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]" title={showLabel ? undefined : `Made by ${label}`}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {showLabel ? label : <span className="sr-only">{`Made by ${label}`}</span>}
    </span>
  );
}

export function PlatformLabel({ platform, label }: { platform: CalendarChannelPlatform; label: string }) {
  const Icon = PLATFORM_ICONS[platform];
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon aria-hidden className="size-3.5 shrink-0 text-[var(--admin-foreground-muted)]" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function LegendDot() {
  return <Circle aria-hidden className="size-2 fill-current" strokeWidth={0} />;
}
