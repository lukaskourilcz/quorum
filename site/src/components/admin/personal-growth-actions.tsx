"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminButton, AdminInput, AdminLabel, AdminSelect, AdminTextarea } from "./admin-primitives";

async function saveAction(payload: unknown): Promise<{ ok: boolean; message: string }> {
  const response = await fetch("/admin/api/personal-growth", {
    body: JSON.stringify(payload),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  return response.ok
    ? { ok: true, message: response.status === 200 ? "Already recorded." : "Saved." }
    : { ok: false, message: typeof body.error === "string" ? body.error : "The action was not saved." };
}

function Status({ value }: { value: { ok: boolean; message: string } | null }) {
  return value ? (
    <p
      aria-live="polite"
      className={`m-0 text-[length:var(--admin-type-control)] ${value.ok ? "text-[var(--admin-success)]" : "text-[var(--admin-destructive)]"}`}
      role="status"
    >
      {value.message}
    </p>
  ) : null;
}

export function PersonalGrowthAnchorForm({
  currentDate,
  lane
}: {
  currentDate: string;
  lane: "okraj" | "bbarak";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <form
      className="grid min-w-0 gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(12rem,1.3fr)_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveAction({
            type: "anchor",
            lane,
            date: fields.get("date"),
            reason: fields.get("reason")
          });
          setStatus(result);
          if (result.ok) router.refresh();
        });
      }}
    >
      <div>
        <AdminLabel htmlFor={`${lane}-anchor-date`}>{lane.toUpperCase()} anchor</AdminLabel>
        <AdminInput defaultValue={currentDate} id={`${lane}-anchor-date`} name="date" required type="date" />
      </div>
      <div>
        <AdminLabel htmlFor={`${lane}-anchor-reason`}>Correction reason</AdminLabel>
        <AdminInput id={`${lane}-anchor-reason`} maxLength={500} name="reason" placeholder="Why this anchor changes" required />
      </div>
      <AdminButton disabled={pending} type="submit" variant="primary">{pending ? "Saving…" : "Set anchor"}</AdminButton>
      <div className="sm:col-span-3"><Status value={status} /></div>
    </form>
  );
}

export function PersonalGrowthTimelineAction({
  lane,
  occurrenceDate
}: {
  lane: "okraj" | "bbarak";
  occurrenceDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState<"completed" | "skipped" | "rescheduled">("completed");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <details className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3">
      <summary className="admin-focus-ring cursor-pointer text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">Record owner update</summary>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await saveAction({
              type: "timeline",
              lane,
              occurrenceDate,
              operation,
              reason: fields.get("reason"),
              rescheduledTo: operation === "rescheduled" ? fields.get("rescheduledTo") : null,
              finalUrl: operation === "completed" ? fields.get("finalUrl") : null,
              collaborationUrl: operation === "completed" ? fields.get("collaborationUrl") : null
            });
            setStatus(result);
            if (result.ok) router.refresh();
          });
        }}
      >
        <div>
          <AdminLabel htmlFor={`timeline-operation-${lane}-${occurrenceDate}`}>Update</AdminLabel>
          <AdminSelect
            id={`timeline-operation-${lane}-${occurrenceDate}`}
            onChange={(event) => setOperation(event.target.value as typeof operation)}
            value={operation}
          >
            <option value="completed">Mark complete</option>
            <option value="skipped">Skip</option>
            <option value="rescheduled">Reschedule</option>
          </AdminSelect>
        </div>
        <div>
          <AdminLabel htmlFor={`timeline-reason-${lane}-${occurrenceDate}`}>Reason</AdminLabel>
          <AdminTextarea id={`timeline-reason-${lane}-${occurrenceDate}`} maxLength={500} name="reason" required />
        </div>
        {operation === "rescheduled" ? (
          <div>
            <AdminLabel htmlFor={`timeline-next-${lane}-${occurrenceDate}`}>New date</AdminLabel>
            <AdminInput id={`timeline-next-${lane}-${occurrenceDate}`} name="rescheduledTo" required type="date" />
          </div>
        ) : null}
        {operation === "completed" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <AdminLabel htmlFor={`timeline-url-${lane}-${occurrenceDate}`}>{lane === "okraj" ? "Final post URL" : "Article URL"}</AdminLabel>
              <AdminInput id={`timeline-url-${lane}-${occurrenceDate}`} name="finalUrl" placeholder="https://…" type="url" />
            </div>
            {lane === "bbarak" ? (
              <div>
                <AdminLabel htmlFor={`timeline-collab-${lane}-${occurrenceDate}`}>Optional collaboration URL</AdminLabel>
                <AdminInput id={`timeline-collab-${lane}-${occurrenceDate}`} name="collaborationUrl" placeholder="https://…" type="url" />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <AdminButton disabled={pending} type="submit" variant="primary">{pending ? "Saving…" : "Record update"}</AdminButton>
          <Status value={status} />
        </div>
      </form>
    </details>
  );
}

export function PersonalGrowthThreadActions({
  suggestionId,
  text
}: {
  suggestionId: string;
  text: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState<"approved" | "rejected" | "snoozed" | "posted">("approved");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <AdminButton
          onClick={() => {
            navigator.clipboard.writeText(text).then(
              () => setCopyStatus("Copied."),
              () => setCopyStatus("Copy failed. Select the text manually.")
            );
          }}
          variant="secondary"
        >
          Copy
        </AdminButton>
        <span aria-live="polite" className="self-center text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]" role="status">{copyStatus}</span>
      </div>
      <form
        className="grid gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await saveAction({
              type: "thread",
              suggestionId,
              operation,
              reason: fields.get("reason") || null,
              postUrl: operation === "posted" ? fields.get("postUrl") : null
            });
            setStatus(result);
            if (result.ok) router.refresh();
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <AdminLabel htmlFor={`thread-operation-${suggestionId}`}>Owner decision</AdminLabel>
            <AdminSelect id={`thread-operation-${suggestionId}`} onChange={(event) => setOperation(event.target.value as typeof operation)} value={operation}>
              <option value="approved">Approve for manual use</option>
              <option value="rejected">Reject</option>
              <option value="snoozed">Snooze</option>
              <option value="posted">Record as posted</option>
            </AdminSelect>
          </div>
          {operation === "posted" ? (
            <div>
              <AdminLabel htmlFor={`thread-url-${suggestionId}`}>Posted URL</AdminLabel>
              <AdminInput id={`thread-url-${suggestionId}`} name="postUrl" placeholder="https://www.threads.net/…" required type="url" />
            </div>
          ) : null}
        </div>
        <div>
          <AdminLabel htmlFor={`thread-reason-${suggestionId}`}>Optional note</AdminLabel>
          <AdminTextarea id={`thread-reason-${suggestionId}`} maxLength={500} name="reason" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AdminButton disabled={pending} type="submit" variant="primary">{pending ? "Saving…" : "Record decision"}</AdminButton>
          <Status value={status} />
        </div>
      </form>
    </div>
  );
}
