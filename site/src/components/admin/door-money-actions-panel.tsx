"use client";

import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton as Button,
  AdminCallout as Callout,
  AdminCard as Card,
  AdminCardContent as CardContent,
  AdminLabel,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge as Badge,
  AdminTextarea,
} from "./admin-primitives";
import type {
  DoorMoneyActionsView,
  DoorMoneyActionStatus,
  DoorMoneyActionTaskView,
  DoorMoneyChannelPlaybookView
} from "@/lib/door-money-actions-model";

export type {
  DoorMoneyActionPacketView,
  DoorMoneyActionsView,
  DoorMoneyActionStatus,
  DoorMoneyActionTaskView,
  DoorMoneyChannelPlaybookView,
  DoorMoneyPreparedTemplateView,
  DoorMoneyTemplateKind
} from "@/lib/door-money-actions-model";

export const DOOR_MONEY_ACTIONS_ENDPOINT = "/admin/api/door-money/actions";

export interface DoorMoneyActionCompletionRequest {
  packetId: string;
  taskId: string;
  outcome: string;
}

const OUTCOME_LIMIT = 1_000;
const ID_LIMIT = 160;
function boundedId(value: string): boolean {
  return value.length > 0 && value.length <= ID_LIMIT && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

export function doorMoneyActionCompletionEnvelope(
  packetId: string,
  taskId: string,
  outcome: string
): DoorMoneyActionCompletionRequest | null {
  const trimmedOutcome = outcome.trim();
  if (!boundedId(packetId) || !boundedId(taskId) || !trimmedOutcome || trimmedOutcome.length > OUTCOME_LIMIT) {
    return null;
  }
  return { packetId, taskId, outcome: trimmedOutcome };
}

function taskStatusTone(status: DoorMoneyActionStatus): "success" | "warning" {
  return status === "completed" ? "success" : "warning";
}

function ActionTask({ initial, packetId }: { initial: DoorMoneyActionTaskView; packetId: string }) {
  const writesEnabled = useAdminWritesEnabled();
  const [task, setTask] = useState(initial);
  const [outcome, setOutcome] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fieldId = `door-money-outcome-${packetId}-${task.id}`;
  const request = doorMoneyActionCompletionEnvelope(packetId, task.id, outcome);

  async function complete(): Promise<void> {
    if (!writesEnabled || pending || !request) return;
    setPending(true);
    setError("");
    setMessage("Recording outcome…");
    try {
      const response = await fetch(DOOR_MONEY_ACTIONS_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      const payload = await response.json().catch(() => ({})) as {
        status?: DoorMoneyActionStatus;
        outcome?: string;
        completedAt?: string | null;
        error?: string;
      };
      if (!response.ok || payload.status !== "completed") {
        throw new Error(payload.error ?? `Completion failed with ${response.status}.`);
      }
      setTask((current) => ({
        ...current,
        status: "completed",
        outcome: payload.outcome ?? request.outcome,
        completedAt: payload.completedAt ?? null
      }));
      setMessage("Outcome recorded. The weekly room can now read this completion.");
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The outcome was not recorded.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li>
      <Card>
        <CardContent className="grid gap-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="m-0 text-[length:var(--admin-type-section)] font-semibold">{task.title}</h4>
              <p className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{task.why}</p>
            </div>
            <Badge tone={taskStatusTone(task.status)}>{task.status}</Badge>
          </header>

          <dl className="grid overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] sm:grid-cols-2 sm:divide-x sm:divide-[var(--admin-border)]">
            <div className="bg-[var(--admin-surface-secondary)] p-3">
              <dt className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Effort</dt>
              <dd className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)]">{task.effort}</dd>
            </div>
            <div className="border-t border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3 sm:border-t-0">
              <dt className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Expected impact</dt>
              <dd className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)]">{task.expectedImpact}</dd>
            </div>
          </dl>

          <section aria-labelledby={`${fieldId}-steps`}>
            <h5 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]" id={`${fieldId}-steps`}>Steps</h5>
            <ol className="m-0 mt-2 grid list-decimal gap-1.5 pl-5 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)]">
              {task.steps.map((step, index) => <li key={`${task.id}-step-${index + 1}`}>{step}</li>)}
            </ol>
          </section>

          {task.templates.length ? (
            <section aria-labelledby={`${fieldId}-templates`}>
              <h5 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]" id={`${fieldId}-templates`}>Prepared templates</h5>
              <div className="mt-2 grid gap-2">
                {task.templates.map((template) => (
                  <details className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3" key={template.id}>
                    <summary className="admin-focus-ring cursor-pointer rounded-[var(--admin-radius-sm)] font-semibold text-[var(--admin-foreground)]">{template.label}</summary>
                    <p className="m-0 mt-2 text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{template.kind.replaceAll("-", " ")}</p>
                    <pre className="m-0 mt-2 whitespace-pre-wrap font-sans text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)]">{template.body}</pre>
                    <p className="m-0 mt-2 text-[length:var(--admin-type-label)] leading-5 text-[var(--admin-foreground-muted)]">Prepared draft. Copy and send it yourself; this panel never contacts the channel.</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {task.status === "completed" ? (
            <section className="border-t border-[var(--admin-border)] pt-4" aria-label="Recorded completion">
              <p className="font-semibold text-[var(--admin-success)]">Completed</p>
              <p className="mt-2 text-sm leading-6 text-[var(--admin-foreground)]">Outcome: {task.outcome ?? "No outcome was returned."}</p>
              {task.completedAt ? <p className="mt-1 text-xs text-[var(--admin-foreground-muted)]">Recorded {task.completedAt}</p> : null}
            </section>
          ) : (
            <form className="grid gap-3 border-t border-[var(--admin-border)] pt-4" onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              void complete();
            }}>
              <div>
                <AdminLabel htmlFor={fieldId}>Outcome (required)</AdminLabel>
                <span className="block text-[length:var(--admin-type-label)] leading-5 text-[var(--admin-foreground-muted)]" id={`${fieldId}-help`}>Record what you did and what happened. For example: contacted 5 synthetic prospects; 2 replied.</span>
                <AdminTextarea aria-describedby={`${fieldId}-help ${fieldId}-error`} aria-invalid={touched && !request}
                  className="mt-2" disabled={pending || !writesEnabled} id={fieldId} maxLength={OUTCOME_LIMIT}
                  onBlur={() => setTouched(true)} onChange={(event) => { setOutcome(event.target.value); setError(""); }} required value={outcome} />
              </div>
              <p className="min-h-5 text-xs text-[var(--admin-destructive)]" id={`${fieldId}-error`}>
                {touched && !request ? "Enter an outcome before marking this action complete." : ""}
              </p>
              <Button className="justify-self-start" disabled={pending || !writesEnabled || !request} type="submit">
                {pending ? "Recording…" : "Mark complete"}
              </Button>
            </form>
          )}

          <div aria-live="polite" className="min-h-5 text-sm" role={error ? "alert" : "status"}>
            {error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function Playbook({ playbook }: { playbook: DoorMoneyChannelPlaybookView }) {
  return (
    <Card>
      <CardContent className="grid gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{playbook.channel} · {playbook.revision}</p>
            <h4 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{playbook.title}</h4>
          </div>
          <Badge>Read-only</Badge>
        </header>
        <p className="text-sm leading-6 text-[var(--admin-foreground-muted)]">{playbook.summary}</p>
        <ol className="grid list-decimal gap-2 pl-5 text-sm leading-6 text-[var(--admin-foreground)]">
          {playbook.steps.map((step, index) => <li key={`${playbook.id}-step-${index + 1}`}>{step}</li>)}
        </ol>
        <footer className="border-t border-[var(--admin-border)] pt-3 font-mono text-[0.65625rem] leading-5 text-[var(--admin-foreground-muted)]">
          <p>Updated {playbook.updatedAt}</p>
          {playbook.evidenceRefs.length ? <p>Evidence: {playbook.evidenceRefs.join(", ")}</p> : null}
        </footer>
      </CardContent>
    </Card>
  );
}

export function DoorMoneyActionsPanel({ snapshot }: { snapshot: DoorMoneyActionsView }) {
  if (snapshot.state === "missing") {
    return <AdminStateMessage state="initial-empty" title="No Door Money action packets or playbooks exist yet." />;
  }
  if (snapshot.state === "unreadable") {
    return <AdminStateMessage state="malformed" title="Door Money actions could not be read." description="No replacement tasks were invented." />;
  }
  return (
    <div className="grid gap-6">
      {snapshot.unreadable > 0 ? <Callout tone="warning">{snapshot.unreadable} action record{snapshot.unreadable === 1 ? " was" : "s were"} dropped because it could not be read.</Callout> : null}
      <section aria-labelledby="door-money-today-heading">
        <AdminSectionHeading className="mb-3" description="Standing owner to-do list" title={<span id="door-money-today-heading">Today’s actions</span>} />
        {snapshot.packets.length ? snapshot.packets.map((packet) => (
          <article className="mb-5" key={packet.id}>
            <header className="mb-3 border-l-2 border-[var(--admin-section-accent)] pl-3">
              <p className="m-0 text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{packet.date} · {packet.agenda}</p>
              <h4 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{packet.title}</h4>
              <p className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{packet.summary}</p>
            </header>
            {packet.tasks.length ? <ol className="grid gap-4">{packet.tasks.map((task) => <ActionTask initial={task} key={task.id} packetId={packet.id} />)}</ol>
              : <AdminStateMessage state="initial-empty" title="This packet has no owner actions." />}
          </article>
        )) : <AdminStateMessage state="initial-empty" title="No owner action packet is ready." />}
      </section>

      <section aria-labelledby="door-money-playbooks-heading">
        <AdminSectionHeading className="mb-3" description="Guidance only. Playbooks cannot post, send outreach, create accounts or modify a channel." title={<span id="door-money-playbooks-heading">Channel playbooks</span>} />
        {snapshot.playbooks.length ? <div className="grid gap-4 lg:grid-cols-2">{snapshot.playbooks.map((playbook) => <Playbook key={playbook.id} playbook={playbook} />)}</div>
          : <AdminStateMessage state="initial-empty" title="No channel playbooks are available." />}
      </section>
    </div>
  );
}
