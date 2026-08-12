"use client";

import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";

export const DOOR_MONEY_ACTIONS_ENDPOINT = "/admin/api/door-money/actions";

export type DoorMoneyActionStatus = "open" | "completed";
export type DoorMoneyTemplateKind = "pitch-email" | "video-script" | "engagement-guide" | "other";

export interface DoorMoneyPreparedTemplateView {
  id: string;
  label: string;
  kind: DoorMoneyTemplateKind;
  body: string;
}

export interface DoorMoneyActionTaskView {
  id: string;
  title: string;
  why: string;
  steps: string[];
  templates: DoorMoneyPreparedTemplateView[];
  effort: string;
  expectedImpact: string;
  status: DoorMoneyActionStatus;
  outcome: string | null;
  completedAt: string | null;
}

export interface DoorMoneyActionPacketView {
  id: string;
  date: string;
  agenda: string;
  title: string;
  summary: string;
  tasks: DoorMoneyActionTaskView[];
}

export interface DoorMoneyChannelPlaybookView {
  id: string;
  channel: string;
  title: string;
  revision: string;
  summary: string;
  steps: string[];
  updatedAt: string;
  evidenceRefs: string[];
}

/** Temporary serializable projection until DM-19b installs the persistent action contract. */
export interface DoorMoneyActionsView {
  state: "missing" | "unreadable" | "present";
  packets: DoorMoneyActionPacketView[];
  playbooks: DoorMoneyChannelPlaybookView[];
  unreadable: number;
}

export interface DoorMoneyActionCompletionRequest {
  packetId: string;
  taskId: string;
  outcome: string;
}

const OUTCOME_LIMIT = 1_000;
const ID_LIMIT = 160;
const fieldClass =
  "w-full rounded-[var(--radius-button)] border border-[var(--steel)] bg-[var(--surface)] px-3 py-2.5 text-base leading-6 text-[var(--foreground)] placeholder:text-[var(--fog)] disabled:opacity-50";

function boundedId(value: string): boolean {
  return value.length > 0 && value.length <= ID_LIMIT && !/[\u0000-\u001f\u007f]/u.test(value);
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
        <CardContent className="grid gap-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-xl font-semibold leading-tight tracking-[-0.03em]">{task.title}</h4>
              <p className="mt-2 text-sm leading-6 text-[var(--fog)]">{task.why}</p>
            </div>
            <Badge tone={taskStatusTone(task.status)}>{task.status}</Badge>
          </header>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--secondary)] p-4">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">Effort</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--foreground)]">{task.effort}</dd>
            </div>
            <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--secondary)] p-4">
              <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">Expected impact</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--foreground)]">{task.expectedImpact}</dd>
            </div>
          </dl>

          <section aria-labelledby={`${fieldId}-steps`}>
            <h5 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]" id={`${fieldId}-steps`}>Steps</h5>
            <ol className="mt-3 grid list-decimal gap-2 pl-5 text-sm leading-6 text-[var(--foreground)]">
              {task.steps.map((step, index) => <li key={`${task.id}-step-${index + 1}`}>{step}</li>)}
            </ol>
          </section>

          {task.templates.length ? (
            <section aria-labelledby={`${fieldId}-templates`}>
              <h5 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]" id={`${fieldId}-templates`}>Prepared templates</h5>
              <div className="mt-3 grid gap-2">
                {task.templates.map((template) => (
                  <details className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={template.id}>
                    <summary className="cursor-pointer font-semibold text-[var(--foreground)]">{template.label}</summary>
                    <p className="mt-2 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">{template.kind.replaceAll("-", " ")}</p>
                    <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--foreground)]">{template.body}</pre>
                    <p className="mt-3 text-xs leading-5 text-[var(--fog)]">Prepared draft. Copy and send it yourself; this panel never contacts the channel.</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {task.status === "completed" ? (
            <section className="border-t border-[var(--border)] pt-4" aria-label="Recorded completion">
              <p className="font-semibold text-[var(--success)]">Completed</p>
              <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">Outcome: {task.outcome ?? "No outcome was returned."}</p>
              {task.completedAt ? <p className="mt-1 text-xs text-[var(--fog)]">Recorded {task.completedAt}</p> : null}
            </section>
          ) : (
            <form className="grid gap-3 border-t border-[var(--border)] pt-4" onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              void complete();
            }}>
              <label htmlFor={fieldId}>
                <span className="font-semibold text-[var(--foreground)]">Outcome (required)</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--fog)]" id={`${fieldId}-help`}>Record what you did and what happened. For example: contacted 5 synthetic prospects; 2 replied.</span>
                <textarea aria-describedby={`${fieldId}-help ${fieldId}-error`} aria-invalid={touched && !request}
                  className={`${fieldClass} mt-2 min-h-24`} disabled={pending || !writesEnabled} id={fieldId} maxLength={OUTCOME_LIMIT}
                  onBlur={() => setTouched(true)} onChange={(event) => { setOutcome(event.target.value); setError(""); }} required value={outcome} />
              </label>
              <p className="min-h-5 text-xs text-[var(--destructive)]" id={`${fieldId}-error`}>
                {touched && !request ? "Enter an outcome before marking this action complete." : ""}
              </p>
              <Button className="justify-self-start" disabled={pending || !writesEnabled || !request} type="submit">
                {pending ? "Recording…" : "Mark complete"}
              </Button>
            </form>
          )}

          <div aria-live="polite" className="min-h-5 text-sm" role={error ? "alert" : "status"}>
            {error ? <span className="text-[var(--destructive)]">{error}</span> : <span className="text-[var(--fog)]">{message}</span>}
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
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">{playbook.channel} · {playbook.revision}</p>
            <h4 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{playbook.title}</h4>
          </div>
          <Badge>Read-only</Badge>
        </header>
        <p className="text-sm leading-6 text-[var(--fog)]">{playbook.summary}</p>
        <ol className="grid list-decimal gap-2 pl-5 text-sm leading-6 text-[var(--foreground)]">
          {playbook.steps.map((step, index) => <li key={`${playbook.id}-step-${index + 1}`}>{step}</li>)}
        </ol>
        <footer className="border-t border-[var(--border)] pt-3 font-mono text-[0.65625rem] leading-5 text-[var(--fog)]">
          <p>Updated {playbook.updatedAt}</p>
          {playbook.evidenceRefs.length ? <p>Evidence: {playbook.evidenceRefs.join(", ")}</p> : null}
        </footer>
      </CardContent>
    </Card>
  );
}

export function DoorMoneyActionsPanel({ snapshot }: { snapshot: DoorMoneyActionsView }) {
  if (snapshot.state === "missing") {
    return <Callout>No Door Money action packets or playbooks exist yet.</Callout>;
  }
  if (snapshot.state === "unreadable") {
    return <Callout tone="danger">Door Money actions could not be read. No replacement tasks were invented.</Callout>;
  }
  return (
    <div className="grid gap-10">
      {snapshot.unreadable > 0 ? <Callout tone="warning">{snapshot.unreadable} action record{snapshot.unreadable === 1 ? " was" : "s were"} dropped because it could not be read.</Callout> : null}
      <section aria-labelledby="door-money-today-heading">
        <div className="mb-5">
          <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Standing owner to-do list</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]" id="door-money-today-heading">Today’s actions</h3>
        </div>
        {snapshot.packets.length ? snapshot.packets.map((packet) => (
          <article className="mb-8" key={packet.id}>
            <header className="mb-4 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--secondary)] p-5">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">{packet.date} · {packet.agenda}</p>
              <h4 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{packet.title}</h4>
              <p className="mt-2 text-sm leading-6 text-[var(--fog)]">{packet.summary}</p>
            </header>
            {packet.tasks.length ? <ol className="grid gap-4">{packet.tasks.map((task) => <ActionTask initial={task} key={task.id} packetId={packet.id} />)}</ol>
              : <Callout>This packet has no owner actions.</Callout>}
          </article>
        )) : <Callout>No owner action packet is ready.</Callout>}
      </section>

      <section aria-labelledby="door-money-playbooks-heading">
        <div className="mb-5">
          <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Reference desk</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]" id="door-money-playbooks-heading">Channel playbooks</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--fog)]">Guidance only. Playbooks cannot post, send outreach, create accounts or modify a channel.</p>
        </div>
        {snapshot.playbooks.length ? <div className="grid gap-4 lg:grid-cols-2">{snapshot.playbooks.map((playbook) => <Playbook key={playbook.id} playbook={playbook} />)}</div>
          : <Callout>No channel playbooks are available.</Callout>}
      </section>
    </div>
  );
}
