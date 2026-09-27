"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { AdminDialog } from "@/components/admin/admin-overlays";
import { AdminButton, AdminCallout, AdminEntityBadge, AdminLabel, AdminTextarea } from "@/components/admin/admin-primitives";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  CALENDAR_KIND_LABELS,
  CALENDAR_OWNER_STATUSES,
  CALENDAR_PLATFORM_LABELS,
  CALENDAR_PRODUCER_LABELS,
  CALENDAR_STATUS_LABELS,
  pillarName,
  type CalendarAd,
  type CalendarDocument,
  type CalendarOwnerStatus
} from "@/lib/marketing-calendar-model";
import { bodyBeats, formatCalendarDate, formatDateRange, formatEffort, type CalendarEntryView } from "@/lib/marketing-calendar-view";
import { cn } from "@/lib/utils";
import { KIND_ICONS, STATUS_ICONS, STATUS_INK, STATUS_SURFACES, StatusPill } from "./calendar-shared";
import { useAdminSurfaceTheme } from "./use-admin-surface-theme";

const QUEUE_KEYS: Readonly<Record<string, string>> = { marketingshark: "devshark", "caught-up": "caught-up" };

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{label}</p>
      <div className="mt-1 text-[length:var(--admin-type-body)] leading-5 text-[var(--admin-foreground)] [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

function StatusControl({ entry, venture, writesConfigured, onSaved }: {
  entry: CalendarEntryView;
  venture: string;
  writesConfigured: boolean;
  onSaved: (id: string, status: CalendarOwnerStatus, note: string | null) => void;
}) {
  const writable = useAdminWritesEnabled();
  const [status, setStatus] = useState<CalendarOwnerStatus>((CALENDAR_OWNER_STATUSES as readonly string[]).includes(entry.status) ? entry.status as CalendarOwnerStatus : "planned");
  const [note, setNote] = useState(entry.note ?? "");
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const fromQueue = entry.statusSource === "queue";
  const disabled = !writable || fromQueue || entry.synthetic || state.kind === "saving";
  const reason = entry.synthetic
    ? "This day comes from marketingShark's rotation, not from the plan, so it has nothing to save."
    : fromQueue
      ? `The Queue says ${CALENDAR_STATUS_LABELS[entry.effectiveStatus].toLowerCase()}; change it there.`
      : !writesConfigured
        ? "GitHub writing is not configured for this admin, so the plan is read-only here."
        : !writable ? "Loading the controls…" : null;

  async function save() {
    setState({ kind: "saving" });
    try {
      const response = await fetch("/admin/api/marketing-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venture, action: "entry", id: entry.id, status, note: note.trim() || null })
      });
      const body = await response.json().catch(() => ({})) as { error?: string; status?: CalendarOwnerStatus; note?: string | null };
      if (!response.ok) {
        setState({ kind: "error", message: body.error ?? `The change was not saved (${response.status}).` });
        return;
      }
      onSaved(entry.id, body.status ?? status, body.note ?? null);
      setState({ kind: "saved", message: "Saved to the plan." });
    } catch {
      setState({ kind: "error", message: "The admin could not be reached. Nothing was saved." });
    }
  }

  return (
    <section aria-label="Status" className="grid gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3" data-calendar-status-control>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--admin-type-control)] font-semibold">Status</span>
        <StatusPill status={entry.effectiveStatus} />
        <span className="text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{fromQueue ? "read from the Queue" : "set by the owner"}</span>
      </div>
      <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0" disabled={disabled}>
        <legend className="sr-only">Set the status</legend>
        {CALENDAR_OWNER_STATUSES.map((option) => {
          const Icon = STATUS_ICONS[option];
          const selected = status === option;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center gap-1.5 rounded-[var(--admin-radius)] border px-3 text-[length:var(--admin-type-control)] font-semibold disabled:cursor-not-allowed disabled:opacity-55 md:min-h-[var(--admin-control-height)]",
                selected ? STATUS_SURFACES[option] : "border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-[var(--admin-foreground)] hover:bg-[var(--admin-surface-hover)]",
                selected ? "ring-1 ring-[var(--admin-border-strong)]" : null
              )}
              key={option}
              onClick={() => setStatus(option)}
              type="button"
            >
              <Icon aria-hidden className={cn("size-3.5", STATUS_INK[option])} />
              {CALENDAR_STATUS_LABELS[option]}
            </button>
          );
        })}
      </fieldset>
      <div>
        <AdminLabel htmlFor={`calendar-note-${entry.id}`}>{status === "blocked" ? "What blocks it (required)" : "Note"}</AdminLabel>
        <AdminTextarea
          className="min-h-16"
          disabled={disabled}
          id={`calendar-note-${entry.id}`}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder={status === "blocked" ? "e.g. Threads profile not created yet" : "Anything worth remembering about this entry"}
          value={note}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <AdminButton disabled={disabled || (status === "blocked" && !note.trim() && !entry.blockedBy)} onClick={save} variant="primary">
          {state.kind === "saving" ? "Saving…" : "Save"}
        </AdminButton>
        <p aria-live="polite" className={cn("m-0 text-[length:var(--admin-type-control)]", state.kind === "error" ? "text-[var(--admin-destructive)]" : state.kind === "saved" ? "text-[var(--admin-success)]" : "text-[var(--admin-foreground-muted)]")} role="status">
          {state.message ?? reason ?? "Queued and published come from the Queue, never from here."}
        </p>
      </div>
    </section>
  );
}

export type CalendarDetailTarget = { type: "entry"; entry: CalendarEntryView } | { type: "ad"; ad: CalendarAd };

export function CalendarEntryDetail({
  target,
  document,
  venture,
  ownDashboardUrl,
  writesConfigured,
  accent,
  entryById,
  position,
  onClose,
  onStep,
  onOpen,
  onSaved
}: {
  target: CalendarDetailTarget | null;
  document: CalendarDocument;
  venture: string;
  ownDashboardUrl: string;
  writesConfigured: boolean;
  accent: string;
  entryById: ReadonlyMap<string, CalendarEntryView>;
  position: { index: number; total: number } | null;
  onClose: () => void;
  onStep: (direction: -1 | 1) => void;
  onOpen: (id: string) => void;
  onSaved: (id: string, status: CalendarOwnerStatus, note: string | null) => void;
}) {
  const theme = useAdminSurfaceTheme();
  if (!target) return null;
  if (target.type === "ad") {
    const { ad } = target;
    const boosted = ad.creativeEntryId ? entryById.get(ad.creativeEntryId) : undefined;
    return (
      <AdminDialog eyebrow={`Ad test · ${CALENDAR_PLATFORM_LABELS[ad.platform]} · ${formatDateRange(ad.start, ad.end)}`} onClose={onClose} open theme={theme} title={`${ad.objective} · €${ad.dailyBudgetEur} a day`}>
        <div className="grid gap-4" data-calendar-detail={ad.id} style={{ "--admin-section-accent": accent } as React.CSSProperties}>
          <AdminCallout tone="warning">Owner-paid, outside the $50 cap. The calendar shows this test; it never books it.</AdminCallout>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Budget">€{ad.dailyBudgetEur} × {ad.days} days = €{ad.totalEur}</Field>
            <Field label="Status"><StatusPill status={ad.status} /></Field>
            <Field label="Placement">{ad.placement}</Field>
          </div>
          <Field label="Audience">{ad.audience}</Field>
          <Field label="Creative">
            {ad.creative}
            {boosted ? <button className="admin-focus-ring mt-1 block rounded-[var(--admin-radius-sm)] font-semibold text-[var(--admin-link)] underline underline-offset-2" onClick={() => onOpen(boosted.id)} type="button">Open the boosted entry: {boosted.title}</button> : null}
          </Field>
          <Field label="Stop rule">{ad.successRule}</Field>
          <Field label="Policy notes">{ad.policyNotes}</Field>
        </div>
      </AdminDialog>
    );
  }
  const { entry } = target;
  const KindIcon = KIND_ICONS[entry.kind];
  const beats = bodyBeats(entry.body);
  const review = entry.kind === "review" ? document.reviews.find((candidate) => candidate.date === entry.date) : undefined;
  const queueHref = `/admin/queue?${new URLSearchParams({ status: entry.effectiveStatus === "published" ? "sent" : "waiting", venture: QUEUE_KEYS[venture] ?? venture, ...(entry.platform === "instagram" || entry.platform === "threads" || entry.platform === "linkedin" ? { platform: entry.platform } : {}) })}`;
  return (
    <AdminDialog
      classNames={{ surface: "max-w-3xl" }}
      eyebrow={`${formatCalendarDate(entry.date)} · ${entry.time} · ${CALENDAR_PLATFORM_LABELS[entry.platform]} · ${CALENDAR_KIND_LABELS[entry.kind]}`}
      footer={position ? (
        <div className="flex items-center justify-between gap-3">
          <AdminButton aria-label="Previous entry" className="normal-case tracking-normal" disabled={position.index <= 0} onClick={() => onStep(-1)} variant="ghost"><ChevronLeft aria-hidden className="size-4" />Previous</AdminButton>
          <span className="admin-tabular">{position.index + 1} of {position.total}</span>
          <AdminButton aria-label="Next entry" className="normal-case tracking-normal" disabled={position.index >= position.total - 1} onClick={() => onStep(1)} variant="ghost">Next<ChevronRight aria-hidden className="size-4" /></AdminButton>
        </div>
      ) : undefined}
      onClose={onClose}
      open
      theme={theme}
      title={entry.title}
    >
      <div className="grid gap-5" data-calendar-detail={entry.id} style={{ "--admin-section-accent": accent } as React.CSSProperties}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={entry.effectiveStatus} />
          <AdminEntityBadge><KindIcon aria-hidden className="mr-1 size-3" />{CALENDAR_KIND_LABELS[entry.kind]}</AdminEntityBadge>
          <AdminEntityBadge>{pillarName(document, entry.pillar)}</AdminEntityBadge>
          <AdminEntityBadge>{CALENDAR_PRODUCER_LABELS[entry.producer]}</AdminEntityBadge>
          <span className="font-mono text-[length:var(--admin-type-label)] text-[var(--admin-foreground-subtle)]">{entry.id}</span>
        </div>
        {entry.effectiveStatus === "blocked" ? <AdminCallout tone="warning"><strong>Blocked:</strong> {entry.blockedBy ?? entry.note ?? "no reason recorded"}</AdminCallout> : null}
        {entry.hook ? (
          <blockquote className="m-0 border-l-[3px] border-[var(--admin-section-accent)] pl-3">
            <p className="m-0 text-[length:var(--admin-type-dialog)] font-semibold leading-snug text-[var(--admin-foreground)] [overflow-wrap:anywhere]">{entry.hook}</p>
            {entry.hookType ? <p className="m-0 mt-1 text-[length:var(--admin-type-label)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{entry.hookType} hook</p> : null}
          </blockquote>
        ) : null}
        <Field label={beats.length > 1 ? "Slide by slide" : "What it is"}>
          {beats.length > 1 ? (
            <ol className="m-0 grid list-none gap-1.5 p-0">
              {beats.map((beat, index) => <li className="rounded-[var(--admin-radius-sm)] bg-[var(--admin-surface-secondary)] px-2.5 py-1.5" key={index}>{beat}</li>)}
            </ol>
          ) : <p className="m-0 whitespace-pre-line">{entry.body || "The plan gives no body for this entry."}</p>}
        </Field>
        {review ? <Field label="Decision rule">{review.what}</Field> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Call to action">{entry.cta ?? "None"}</Field>
          <Field label="Read after 48 h">{entry.measure ?? "Not stated"}</Field>
          <Field label="Effort">{formatEffort(entry.effortMin) ?? "Not stated"}</Field>
          <Field label="Assets">
            {entry.assets.length ? <ul className="m-0 list-disc pl-4">{entry.assets.map((asset) => <li key={asset}>{asset}</li>)}</ul> : "None"}
          </Field>
        </div>
        {entry.tipRefs.length ? (
          <Field label="IG TIPS behind it">
            <ul className="m-0 grid list-none gap-1 p-0">
              {entry.tipRefs.map((tip) => (
                <li key={tip}>
                  <a className="admin-focus-ring inline-flex items-start gap-1.5 rounded-[var(--admin-radius-sm)] text-[var(--admin-link)] underline-offset-2 hover:underline" href={`${ownDashboardUrl}/ig-tips?q=${encodeURIComponent(tip)}`} rel="noreferrer" target="_blank">
                    <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0" />{tip}
                  </a>
                </li>
              ))}
            </ul>
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2" data-calendar-links>
          <a className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center gap-1 rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] px-3 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] hover:bg-[var(--admin-surface-hover)] md:min-h-[var(--admin-control-height)]" href={queueHref}>
            {entry.queue ? `Open in the Queue (${entry.queue.status})` : "Queue for this venture"}<ArrowUpRight aria-hidden className="size-3.5" />
          </a>
          {entry.queue?.designLabHref ? (
            <a className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center gap-1 rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] px-3 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] hover:bg-[var(--admin-surface-hover)] md:min-h-[var(--admin-control-height)]" href={entry.queue.designLabHref}>
              Design Lab<ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          ) : null}
          {entry.queue?.permalink ? (
            <a className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center gap-1 rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] px-3 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] hover:bg-[var(--admin-surface-hover)] md:min-h-[var(--admin-control-height)]" href={entry.queue.permalink} rel="noreferrer" target="_blank">
              Published post<ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          ) : null}
          {entry.links.map((link) => (
            <a className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center gap-1 rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] px-3 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] hover:bg-[var(--admin-surface-hover)] md:min-h-[var(--admin-control-height)]" href={link.url} key={link.url} rel="noreferrer" target={link.url.startsWith("/") ? undefined : "_blank"}>
              {link.label}<ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          ))}
        </div>
        {entry.packageExists === false && entry.producer === "marketingShark" && !entry.synthetic ? (
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">marketingShark has not written a package for this day yet.</p>
        ) : null}
        <StatusControl entry={entry} key={entry.id} onSaved={onSaved} venture={venture} writesConfigured={writesConfigured} />
      </div>
    </AdminDialog>
  );
}
