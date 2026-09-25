"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { AtSign, Briefcase, Camera, Check, CircleDashed, ExternalLink, X } from "lucide-react";
import {
  QUEUE_ALT_TEXT_LIMIT,
  QUEUE_GROUP_LABELS,
  QUEUE_PLATFORM_LABELS,
  type AdminQueueItemView,
  type QueueActionName,
  type QueueCheckState,
  type QueueGroup
} from "@/lib/admin-queue/types";
import { queueActionFailure, queueActionNotice, type QueueActionNotice } from "@/lib/admin-queue/notice";
import { cn } from "@/lib/utils";
import { AdminButton, AdminCallout, AdminCard, AdminEntityBadge, AdminLabel, AdminStatusBadge, AdminTextarea, adminButtonVariants } from "./admin-primitives";
import { useAdminWritesEnabled } from "./admin-write-mode";

const PLATFORM_ICONS = { linkedin: Briefcase, instagram: Camera, threads: AtSign } as const;
const GROUP_TONES: Readonly<Record<QueueGroup, "information" | "success" | "warning" | "destructive" | "neutral">> = {
  waiting: "information",
  scheduled: "success",
  sending: "information",
  sent: "success",
  failed: "destructive",
  held: "warning"
};
const CHECK_PRESENTATION: Readonly<Record<QueueCheckState, { icon: typeof Check; tone: "success" | "neutral" | "destructive"; label: string }>> = {
  pass: { icon: Check, tone: "success", label: "passes" },
  pending: { icon: CircleDashed, tone: "neutral", label: "not run yet" },
  fail: { icon: X, tone: "destructive", label: "fails" }
};
const FRAMES_SHOWN = 3;
const NOTICE_TONES: Readonly<Record<QueueActionNotice["tone"], string>> = {
  success: "text-[var(--admin-success)]",
  warning: "text-[var(--admin-warning)]",
  destructive: "text-[var(--admin-destructive)]"
};

const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });

function windowLabel(window: AdminQueueItemView["publishWindow"]): string {
  const start = new Date(window.notBefore);
  const end = new Date(window.notAfter);
  const sameDay = dateTime.format(start).split(",")[0] === dateTime.format(end).split(",")[0];
  return `${dateTime.format(start)} – ${sameDay ? time.format(end) : dateTime.format(end)} Prague time`;
}

function QueueFrameImage({ href, label }: { href: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="flex aspect-[4/5] items-center justify-center rounded-[var(--admin-radius)] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-secondary)] p-2 text-center text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">Frame not available</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={label} className="aspect-[4/5] w-full rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-inset)] object-contain" loading="lazy" onError={() => setFailed(true)} src={href} />
  );
}

function CharacterCount({ id, length, limit }: { id: string; length: number; limit: number }) {
  const over = length > limit;
  return (
    <p className={cn("m-0 mt-1 text-right text-[length:var(--admin-type-label)] admin-tabular", over ? "font-semibold text-[var(--admin-destructive)]" : "text-[var(--admin-foreground-muted)]")} id={id}>
      {length.toLocaleString("en-GB")} / {limit.toLocaleString("en-GB")}{over ? " — over the limit" : ""}
    </p>
  );
}

type Mode = "view" | "edit" | "hold" | "reject";

/** One queue item: what will be posted, where, when, what still holds it, and what the owner can do. */
export function QueueCard({ item }: { item: AdminQueueItemView }) {
  const router = useRouter();
  const writesEnabled = useAdminWritesEnabled();
  const ids = useId();
  const [mode, setMode] = useState<Mode>("view");
  const [caption, setCaption] = useState(item.caption);
  const [altText, setAltText] = useState(item.altText ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<QueueActionName | null>(null);
  const [message, setMessage] = useState<QueueActionNotice | null>(null);
  const [allFrames, setAllFrames] = useState(false);
  const PlatformIcon = PLATFORM_ICONS[item.platform];
  const frames = allFrames ? item.frameHrefs : item.frameHrefs.slice(0, FRAMES_SHOWN);
  const busy = pending !== null || !writesEnabled;
  const captionTooLong = caption.trim().length > item.captionLimit;
  const editChanged = caption.trim() !== item.caption || (altText.trim() || null) !== item.altText;
  const rerenderShown = item.frameCount > 0 && item.schemaVersion === 2 && item.supersededBy === null && (item.group === "waiting" || item.group === "scheduled" || item.group === "failed");

  const send = async (action: QueueActionName, extra: Record<string, unknown> = {}) => {
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch("/admin/api/queue/actions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, itemId: item.id, expectedContentHash: item.contentHash, ...extra })
      });
      const body = await response.json().catch(() => ({})) as unknown;
      setMessage(queueActionNotice(response.ok, body));
      if (response.ok) {
        setMode("view");
        setReason("");
        router.refresh();
      }
    } catch {
      setMessage(queueActionFailure());
    } finally {
      setPending(null);
    }
  };

  return (
    <AdminCard className="grid min-w-0 gap-4 p-4" data-queue-item={item.id} data-queue-group={item.group}>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="m-0 flex min-w-0 items-center gap-2 text-[length:var(--admin-type-section)] font-semibold text-[var(--admin-foreground)]">
            <PlatformIcon aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{QUEUE_PLATFORM_LABELS[item.platform]} · {item.profileLabel}</span>
          </p>
          <p className="m-0 break-words text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
            {item.handle ? `@${item.handle.replace(/^@/u, "")}` : "Handle not connected yet"} · {item.ventureLabel}
            {item.locale ? ` · ${item.locale.toUpperCase()}` : ""} · {item.contentKind === "carousel" ? `carousel of ${item.frameCount}` : item.contentKind}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.schemaVersion === 1 ? <AdminEntityBadge>Legacy v1</AdminEntityBadge> : null}
          <AdminStatusBadge tone={GROUP_TONES[item.group]}>{QUEUE_GROUP_LABELS[item.group]} · {item.status.replace("_", " ")}</AdminStatusBadge>
        </div>
      </header>

      {item.frameHrefs.length > 0 ? (
        <div className="grid gap-2">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {frames.map((href, index) => <QueueFrameImage href={href} key={href} label={`Frame ${index + 1} of ${item.frameCount}`} />)}
          </div>
          {item.frameHrefs.length > FRAMES_SHOWN ? (
            <AdminButton aria-expanded={allFrames} className="w-fit" onClick={() => setAllFrames((value) => !value)} variant="ghost">
              {allFrames ? "Show the first three frames" : `Show all ${item.frameCount} frames`}
            </AdminButton>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" ? (
        <div className="grid gap-3">
          <div>
            <AdminLabel htmlFor={`${ids}-caption`}>Caption for {QUEUE_PLATFORM_LABELS[item.platform]}</AdminLabel>
            <AdminTextarea aria-describedby={`${ids}-caption-count`} aria-invalid={captionTooLong} className="min-h-40" disabled={busy} id={`${ids}-caption`} onChange={(event) => setCaption(event.target.value)} spellCheck value={caption} />
            <CharacterCount id={`${ids}-caption-count`} length={caption.trim().length} limit={item.captionLimit} />
          </div>
          {item.frameCount > 0 ? (
            <div>
              <AdminLabel htmlFor={`${ids}-alt`}>Alt text</AdminLabel>
              <AdminTextarea aria-describedby={`${ids}-alt-count`} disabled={busy} id={`${ids}-alt`} maxLength={QUEUE_ALT_TEXT_LIMIT} onChange={(event) => setAltText(event.target.value)} value={altText} />
              <CharacterCount id={`${ids}-alt-count`} length={altText.trim().length} limit={QUEUE_ALT_TEXT_LIMIT} />
            </div>
          ) : null}
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Saving makes a new draft that replaces this one. An approved post is never changed in place.</p>
          <div className="flex flex-wrap gap-2">
            <AdminButton disabled={busy || captionTooLong || !editChanged || caption.trim().length === 0 || (item.frameCount > 0 && altText.trim().length === 0)} onClick={() => send("edit", { edits: { caption: caption.trim(), altText: altText.trim() || null } })} variant="primary">
              {pending === "edit" ? "Saving…" : "Save as new draft"}
            </AdminButton>
            <AdminButton disabled={pending !== null} onClick={() => { setMode("view"); setCaption(item.caption); setAltText(item.altText ?? ""); }}>Cancel</AdminButton>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="m-0 whitespace-pre-wrap break-words text-[length:var(--admin-type-body)] leading-6 text-[var(--admin-foreground)]">{item.caption}</p>
          <p className="m-0 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)] admin-tabular">
            {item.caption.length.toLocaleString("en-GB")} of {item.captionLimit.toLocaleString("en-GB")} characters{item.hashtags.length ? ` · ${item.hashtags.length} ${item.hashtags.length === 1 ? "hashtag" : "hashtags"}` : ""}
          </p>
          {item.altText ? (
            <details className="text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
              <summary className="admin-focus-ring w-fit cursor-pointer rounded-sm">Alt text</summary>
              <p className="m-0 mt-1 whitespace-pre-wrap break-words">{item.altText}</p>
            </details>
          ) : item.frameCount > 0 ? <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-warning)]">No alt text: this post cannot be approved until it has some.</p> : null}
        </div>
      )}

      <dl className="m-0 grid gap-3 text-[length:var(--admin-type-control)] sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
        <dt className="font-medium text-[var(--admin-foreground-muted)]">Window</dt>
        <dd className="m-0 text-[var(--admin-foreground)]">{windowLabel(item.publishWindow)}</dd>
        <dt className="font-medium text-[var(--admin-foreground-muted)]">Checks</dt>
        <dd className="m-0">
          <ul aria-label="Checks" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {item.checks.map((check) => {
              const presentation = CHECK_PRESENTATION[check.state];
              const Icon = presentation.icon;
              return (
                <li key={check.id}>
                  <AdminStatusBadge data-check={check.id} data-state={check.state} tone={presentation.tone}>
                    <Icon aria-hidden className="size-3" />
                    {check.label}
                    <span className="sr-only">: {presentation.label}</span>
                  </AdminStatusBadge>
                </li>
              );
            })}
          </ul>
          <p className="m-0 mt-1.5 text-[var(--admin-foreground-muted)]">
            {item.ownerChecks === "pass" ? "Brand, claims, voice, safety and policy: approved by you." : item.ownerChecks === "fail" ? "Brand, claims, voice, safety or policy failed review." : "Brand, claims, voice, safety and policy wait for your approval."}
          </p>
        </dd>
      </dl>

      {item.supersedes ? <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Replaces <span className="font-mono">{item.supersedes}</span>.</p> : null}
      {item.supersededBy ? <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Replaced by <span className="font-mono">{item.supersededBy}</span>.</p> : null}
      {item.gate ? <AdminCallout tone="neutral">{item.gate}</AdminCallout> : null}
      {item.reason ? <AdminCallout tone={item.group === "failed" ? "destructive" : "warning"}>{item.reason}</AdminCallout> : null}
      {item.nextSafeAction ? <p className="m-0 text-[length:var(--admin-type-control)] font-medium text-[var(--admin-foreground)]" data-next-safe-action>{item.nextSafeAction}</p> : null}
      {item.permalink ? (
        <a className="admin-focus-ring inline-flex w-fit items-center gap-1.5 rounded-sm text-[length:var(--admin-type-control)] text-[var(--admin-link)] underline-offset-4 hover:underline" href={item.permalink} rel="noreferrer" target="_blank">
          Open the published post <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : null}

      {mode === "hold" || mode === "reject" ? (
        <div className="grid gap-2">
          <AdminLabel htmlFor={`${ids}-reason`}>{mode === "hold" ? "Why hold it?" : "Why reject it? marketingShark reads this as a taste note."}</AdminLabel>
          <AdminTextarea disabled={busy} id={`${ids}-reason`} maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} />
          <div className="flex flex-wrap gap-2">
            <AdminButton disabled={busy || reason.trim().length < 3} onClick={() => send(mode, { reason: reason.trim() })} variant="destructive">
              {pending === mode ? "Saving…" : mode === "hold" ? "Hold this post" : "Reject this post"}
            </AdminButton>
            <AdminButton disabled={pending !== null} onClick={() => { setMode("view"); setReason(""); }}>Cancel</AdminButton>
          </div>
        </div>
      ) : null}

      {mode === "view" ? (
        <div aria-label="Post actions" className="flex flex-wrap items-center gap-2 border-t border-[var(--admin-border)] pt-3" role="group">
          {item.actions.approve ? (
            <>
              <AdminButton disabled={busy} onClick={() => send("approve", { mode: "now" })} variant="primary">{pending === "approve" ? "Approving…" : "Approve and publish now"}</AdminButton>
              <AdminButton disabled={busy} onClick={() => send("approve", { mode: "window" })}>Approve for the window</AdminButton>
            </>
          ) : null}
          {item.actions.edit ? <AdminButton disabled={busy} onClick={() => setMode("edit")}>Edit</AdminButton> : null}
          {item.actions.hold ? <AdminButton disabled={busy} onClick={() => setMode("hold")} variant="ghost">Hold</AdminButton> : null}
          {item.actions.reject ? <AdminButton disabled={busy} onClick={() => setMode("reject")} variant="ghost">Reject</AdminButton> : null}
          {item.designLabHref ? <Link className={adminButtonVariants({ variant: "ghost" })} href={item.designLabHref}>Open in Design Lab</Link> : null}
          {rerenderShown ? (
            <>
              <AdminButton aria-describedby={`${ids}-rerender`} disabled={!item.actions.rerender || busy} variant="ghost">Re-render</AdminButton>
              {!item.actions.rerender ? <p className="m-0 basis-full text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]" id={`${ids}-rerender`}>Re-render opens once the Design Lab can edit devShark packages.</p> : null}
            </>
          ) : null}
          {item.schemaVersion === 1 && (item.group === "waiting" || item.group === "scheduled") ? (
            <p className="m-0 basis-full text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">A legacy v1 item can be held or rejected here; approving and editing need a queue v2 item.</p>
          ) : null}
        </div>
      ) : null}

      {/* Rendered empty from the start: a live region that appears with its message is often not announced. */}
      <p aria-live="polite" className={cn("m-0 text-[length:var(--admin-type-control)] empty:hidden", NOTICE_TONES[message?.tone ?? "success"])} role="status">
        {message?.text}
      </p>
      {message?.runUrl ? (
        <a className="admin-focus-ring inline-flex w-fit items-center gap-1.5 rounded-sm text-[length:var(--admin-type-control)] text-[var(--admin-link)] underline-offset-4 hover:underline" href={message.runUrl} rel="noreferrer" target="_blank">
          Follow the publisher run on GitHub <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : null}
    </AdminCard>
  );
}
