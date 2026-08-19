"use client";

import { useState } from "react";
import { Archive, ListChecks, Plus, RadioTower, ShieldCheck } from "lucide-react";
import {
  AdminButton,
  AdminEntityBadge,
  AdminLabel,
  AdminMetric,
  AdminSectionHeading,
  AdminSelect,
  AdminStateMessage,
  AdminStatusBadge,
  AdminTextarea,
} from "./admin-primitives";
import { publicAgentText } from "@/components/agent-language";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import type { AdminAutonomySnapshot, AdminPriorityItem } from "@/lib/admin-autonomy";
import { formatDateTime } from "@/lib/utils";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const VENTURE_LABEL: Readonly<Record<string, string>> = {
  "caught-up": "DNESKAi",
  "carousel-studio": "Design Lab",
  "door-money": "Door Money",
  "mma-files": "MMA Files",
  "titty-tuesdays": "Titty Tuesdays",
  fightaiq: "FightAIQ",
  goviral: "GoVIRAL",
  marketingshark: "marketingShark",
  booksofhistory: "BOOKSOFHISTORY",
  "tehdejsi-svet": "Tehdejší svět",
};

function ventureLabel(id: string): string {
  return VENTURE_LABEL[id] ?? id.replaceAll("-", " ");
}

export function priorityExpired(expires: string, now: string): boolean {
  return expires < now;
}

export function AutonomyPanel({ initial, ventures }: { initial: AdminAutonomySnapshot; ventures: Array<{ id: string; name: string }> }) {
  const writesEnabled = useAdminWritesEnabled();
  const [priorities, setPriorities] = useState(initial.priorities);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(payload: Record<string, unknown>) {
    if (!writesEnabled) return;
    setPending(true);
    setMessage("Saving…");
    setError("");
    try {
      const response = await fetch("/admin/api/priorities", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; priorities?: AdminPriorityItem[] };
      if (!response.ok || !result.priorities) throw new Error(result.error ?? `Save failed with ${response.status}.`);
      setPriorities(result.priorities);
      setMessage(payload.action === "add" ? "Priority added. The next 06:00 board can consider it." : "Priority archived.");
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The priority was not saved.");
    } finally {
      setPending(false);
    }
  }

  async function add(formData: FormData) {
    const evidence = String(formData.get("evidence") ?? "").split("\n").map((entry) => entry.trim()).filter(Boolean);
    await save({
      action: "add",
      venture: String(formData.get("venture") ?? ""),
      question: String(formData.get("question") ?? ""),
      decisionAtStake: String(formData.get("decision") ?? ""),
      evidenceNeeded: evidence,
    });
  }

  const quality: Array<[string, string, string | null]> = [
    ["Changes that shipped", "nothing has shipped yet", initial.quality.verifierPassRate === null ? null : percent(initial.quality.verifierPassRate)],
    ["Shipped first try", "nothing has shipped yet", initial.quality.firstPassRate === null ? null : percent(initial.quality.firstPassRate)],
    ["Needed a second try", "nothing has shipped yet", initial.quality.retryRate === null ? null : percent(initial.quality.retryRate)],
    ["Facts confirmed twice", "no fighter files checked yet", initial.quality.sourceAgreementRate === null ? null : percent(initial.quality.sourceAgreementRate)],
    ["Meetings that said no", "no meetings yet", initial.quality.vetoRate === null ? null : percent(initial.quality.vetoRate)],
  ];
  const socialStatus = (status: string) => status === "enabled" ? "Ready" : status === "paused" ? "Paused" : "Waiting";
  const priorityStatus = (status: string) => status === "selected" ? "Chosen" : status === "why-not" ? "Skipped" : status === "archived" ? "Archived" : "Open";
  const now = new Date().toISOString();

  return (
    <section aria-labelledby="autonomy-heading" className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminSectionHeading description="Measured release quality and the queue the morning board may select from." title="Operating signals" />
        <AdminEntityBadge>{initial.generatedAt ? `Updated ${formatDateTime(initial.generatedAt)}` : "Waiting for the next 06:00 run"}</AdminEntityBadge>
      </div>
      <span className="sr-only" id="autonomy-heading">Company health and priorities</span>

      <div className="grid gap-px overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-border)] sm:grid-cols-2 xl:grid-cols-5">
        {quality.map(([label, absent, value]) => <AdminMetric key={label} label={label} note={value === null ? absent : undefined} value={value ?? "—"} />)}
      </div>

      <section aria-labelledby="social-readiness-heading" className="grid gap-3 border-t border-[var(--admin-border)] pt-4">
        <div className="flex items-start gap-3">
          <RadioTower aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--admin-section-accent)]" />
          <AdminSectionHeading
            description="Each project must reach its recorded threshold before any social channel can be enabled. The global stop still wins."
            title="Social posting readiness"
          />
        </div>
        <span className="sr-only" id="social-readiness-heading">Social posting readiness</span>
        {initial.social.length ? (
          <div className="divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)]">
            {initial.social.map((item) => (
              <article className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start" key={item.venture}>
                <div className="min-w-0">
                  <p className="m-0 font-semibold text-[var(--admin-foreground)]">{ventureLabel(item.venture)}</p>
                  <p className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{publicAgentText(item.reason)}</p>
                  <p className="admin-tabular m-0 mt-1 text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-subtle)]">Checked {formatDateTime(item.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <span className="admin-tabular font-semibold">{item.counter}/{item.required}</span>
                  <AdminStatusBadge tone={item.status === "enabled" ? "success" : item.status === "paused" ? "destructive" : "neutral"}>{socialStatus(item.status)}</AdminStatusBadge>
                </div>
              </article>
            ))}
          </div>
        ) : <AdminStateMessage state="unavailable" title="Social readiness will appear after the next safe posting check" />}
      </section>

      <section aria-labelledby="growth-signals-heading" className="grid gap-3 border-t border-[var(--admin-border)] pt-4">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--admin-section-accent)]" />
          <AdminSectionHeading title="Venture objectives" />
        </div>
        <span className="sr-only" id="growth-signals-heading">Venture objectives</span>
        <div className="grid gap-4 xl:grid-cols-2">
          {initial.growth.map((venture) => (
            <article className="min-w-0 border-l-2 border-[var(--admin-section-accent)] pl-3" key={venture.venture}>
              <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{ventureLabel(venture.venture)}</p>
              <h3 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{publicAgentText(venture.objective)}</h3>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                {venture.signals.map((signal) => (
                  <div className="min-w-0 border-t border-[var(--admin-border)] pt-2" key={signal.id}>
                    <dt className="text-[length:var(--admin-type-control)] font-semibold">{signal.label}</dt>
                    <dd className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
                      <span className="admin-tabular font-semibold text-[var(--admin-foreground)]">{signal.value === null ? "—" : signal.unit === "ratio" ? percent(signal.value) : signal.value}</span>
                      <span className="mt-1 block leading-5">{publicAgentText(signal.detail)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 border-t border-[var(--admin-border)] pt-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <form action={add} className="min-w-0">
          <fieldset disabled={!writesEnabled}>
            <div className="flex items-center gap-2"><Plus aria-hidden className="size-4 text-[var(--admin-section-accent)]" /><AdminSectionHeading description="Only items on this queue can commission a specialist meeting. They expire after seven days." title="Add a board priority" /></div>
            <div className="mt-4 grid gap-3">
              <div><AdminLabel htmlFor="priority-venture">Project</AdminLabel><AdminSelect id="priority-venture" name="venture" required>{ventures.map((venture) => <option key={venture.id} value={venture.id}>{venture.name}</option>)}</AdminSelect></div>
              <div><AdminLabel htmlFor="priority-question">Question</AdminLabel><AdminTextarea id="priority-question" maxLength={280} name="question" required /></div>
              <div><AdminLabel htmlFor="priority-decision">What decision changes?</AdminLabel><AdminTextarea id="priority-decision" maxLength={280} name="decision" required /></div>
              <div><AdminLabel htmlFor="priority-evidence">Evidence needed <span className="font-normal text-[var(--admin-foreground-muted)]">(one item per line)</span></AdminLabel><AdminTextarea id="priority-evidence" name="evidence" /></div>
            </div>
            <AdminButton className="mt-4" disabled={pending || !writesEnabled} type="submit" variant="primary"><Plus aria-hidden className="size-4" />{pending ? "Saving…" : "Add priority"}</AdminButton>
          </fieldset>
        </form>

        <section aria-labelledby="priority-history-heading" className="min-w-0">
          <div className="flex items-center gap-2"><ListChecks aria-hidden className="size-4 text-[var(--admin-section-accent)]" /><AdminSectionHeading title="Priority history" /></div>
          <span className="sr-only" id="priority-history-heading">Priority history</span>
          {priorities.length ? (
            <div className="mt-3 divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)]">
              {priorities.map((item) => (
                <article className="grid gap-2 py-3" key={item.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <AdminStatusBadge tone={item.status === "selected" ? "success" : item.status === "why-not" ? "warning" : "neutral"}>{priorityStatus(item.status)}</AdminStatusBadge>
                      {priorityExpired(item.expires, now) ? <AdminStatusBadge tone="destructive">Expired</AdminStatusBadge> : null}
                      <AdminEntityBadge>{ventureLabel(item.venture)}</AdminEntityBadge>
                    </div>
                    {item.status === "open" ? <AdminButton disabled={pending || !writesEnabled} onClick={() => save({ action: "archive", itemId: item.id })} type="button" variant="ghost"><Archive aria-hidden className="size-4" />Archive</AdminButton> : null}
                  </div>
                  <h4 className="m-0 text-[length:var(--admin-type-body)] font-semibold">{item.question}</h4>
                  <p className="m-0 text-[length:var(--admin-type-control)] leading-5"><span className="text-[var(--admin-foreground-muted)]">Decision:</span> {item.decisionAtStake}</p>
                  {item.whyNotReason ? <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">Why not: {publicAgentText(item.whyNotReason)}</p> : null}
                  {item.evidenceNeeded.length ? <details className="text-[length:var(--admin-type-control)]"><summary className="admin-focus-ring cursor-pointer font-semibold">Evidence list</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--admin-foreground-muted)]">{item.evidenceNeeded.map((entry) => <li key={entry}>{entry}</li>)}</ul></details> : null}
                  <p className="admin-tabular m-0 text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-subtle)]">Added {formatDateTime(item.created)} · expires {formatDateTime(item.expires)}</p>
                </article>
              ))}
            </div>
          ) : <AdminStateMessage className="mt-3" description="An empty queue is a healthy no-commission day." state="initial-empty" title="No priority items are stored" />}
        </section>
      </div>

      <div aria-live="polite" role={error ? "alert" : "status"}>
        {error ? <AdminStateMessage description="Reload the latest queue before trying again." state="error" title={error} /> : null}
        {!error && message && message !== "Saving…" ? <AdminStateMessage state="success" title={message} /> : null}
        {!error && message === "Saving…" ? <AdminStateMessage state="loading" title="Saving the priority" /> : null}
      </div>
    </section>
  );
}
