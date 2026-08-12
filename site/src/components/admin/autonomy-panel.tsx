"use client";

import { useState } from "react";
import { Archive, ListChecks, Plus, RadioTower, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { publicAgentText } from "@/components/agent-language";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import type { AdminAutonomySnapshot, AdminPriorityItem } from "@/lib/admin-autonomy";
import { formatDateTime } from "@/lib/utils";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * A venture's display name, in one place.
 *
 * `venture.replaceAll("-", " ")` rendered "caught up" beside a page that calls the same project
 * DNESKAi everywhere else, and the rest of the admin already had a mapping this panel did not
 * reach for.
 */
const VENTURE_LABEL: Readonly<Record<string, string>> = {
  "caught-up": "DNESKAi",
  "carousel-studio": "Design Lab",
  "door-money": "Door Money",
  "mma-files": "MMA Files",
  "titty-tuesdays": "Titty Tuesdays",
  fightaiq: "FightAIQ",
  goviral: "GoVIRAL",
  marketingshark: "marketingShark"
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
        body: JSON.stringify(payload)
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
      evidenceNeeded: evidence
    });
  }

  /*
   * A rate nothing was measured over reads "no runs yet", not "0%".
   *
   * Zero attempts and zero successes are the same number and opposite news: "Releases that passed
   * 0%" announced a catastrophe on a week when nothing had been released. The snapshot now carries
   * what each rate was divided by, so an absence can say it is one.
   */
  const quality: Array<[string, string, string | null]> = [
    ["Changes that shipped", "nothing has shipped yet", initial.quality.verifierPassRate === null ? null : percent(initial.quality.verifierPassRate)],
    ["Shipped first try", "nothing has shipped yet", initial.quality.firstPassRate === null ? null : percent(initial.quality.firstPassRate)],
    ["Needed a second try", "nothing has shipped yet", initial.quality.retryRate === null ? null : percent(initial.quality.retryRate)],
    ["Facts confirmed twice", "no fighter files checked yet", initial.quality.sourceAgreementRate === null ? null : percent(initial.quality.sourceAgreementRate)],
    ["Meetings that said no", "no meetings yet", initial.quality.vetoRate === null ? null : percent(initial.quality.vetoRate)]
  ];
  const socialStatus = (status: string) => status === "enabled" ? "Ready" : status === "paused" ? "Paused" : "Waiting";
  const priorityStatus = (status: string) => status === "selected" ? "Chosen" : status === "why-not" ? "Skipped" : status === "archived" ? "Archived" : "Open";
  const now = new Date().toISOString();

  return (
    <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8" aria-labelledby="autonomy-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">Company health</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]" id="autonomy-heading">What is improving, and what gets worked on next</h2>
        </div>
        <Badge>{initial.generatedAt ? `Updated ${formatDateTime(initial.generatedAt)}` : "Waiting for the next 06:00 run"}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {quality.map(([label, absent, value]) => (
          <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4" key={label}>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value ?? "—"}</p>
            {value === null ? <p className="mt-1 text-xs leading-5 text-[var(--fog)]">{absent}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6">
        <div className="flex items-center gap-3"><RadioTower aria-hidden="true" className="size-5 text-[var(--accent)]" /><div><h3 className="text-xl font-semibold">When social posting turns on</h3><p className="mt-1 text-sm text-[var(--fog)]">Each project has to publish a set number of articles or campaigns before it may post anything to social media. The counter below is how far it has got. You can still stop all posting everywhere, whatever these say.</p></div></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {initial.social.length ? initial.social.map((item) => (
            <article className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={item.venture}>
              <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{ventureLabel(item.venture)}</h4><Badge tone={item.status === "enabled" ? "success" : item.status === "paused" ? "danger" : "neutral"}>{socialStatus(item.status)}</Badge></div>
              <p className="mt-3 text-2xl font-semibold">{item.counter}/{item.required}</p><p className="mt-1 text-xs text-[var(--fog)]">published so far, of the number needed</p>
              <p className="mt-1 text-xs leading-5 text-[var(--fog)]">{publicAgentText(item.reason)}</p>
              <p className="mt-3 font-mono text-[0.625rem] text-[var(--fog)]">Checked {formatDateTime(item.updatedAt)}</p>
            </article>
          )) : <Callout>Social readiness will appear after the next safe posting check.</Callout>}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {initial.growth.map((venture) => (
          <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6" key={venture.venture}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">{ventureLabel(venture.venture)}</p><h3 className="mt-2 text-xl font-semibold">{publicAgentText(venture.objective)}</h3></div><ShieldCheck aria-hidden="true" className="size-5 text-[var(--accent)]" /></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">{venture.signals.map((signal) => <div className="rounded-[var(--radius-button)] bg-[var(--surface)] p-4" key={signal.id}><p className="text-sm font-semibold">{signal.label}: {signal.value === null ? "—" : signal.unit === "ratio" ? percent(signal.value) : signal.value}</p>{/* The growth signals are written by the runtime and carry its own tokens — a card read
                    "4 delivered, 0 failed; NO_EDITION is neutral." The same dictionary the public
                    pages use turns those into words. */}
                    <p className="mt-1 text-xs leading-5 text-[var(--fog)]">{publicAgentText(signal.detail)}</p></div>)}</div>
          </article>
        ))}
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <form action={add} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6"><fieldset disabled={!writesEnabled}>
          <div className="flex items-center gap-3"><Plus aria-hidden="true" className="size-5 text-[var(--accent)]" /><h3 className="text-xl font-semibold">Add a board priority</h3></div>
          <p className="mt-2 text-sm leading-6 text-[var(--fog)]">The board can commission a specialist meeting only from this list. Items expire after seven days.</p>
          <label className="mt-5 block text-sm font-semibold" htmlFor="priority-venture">Project</label>
          <select className="mt-2 min-h-11 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3" id="priority-venture" name="venture" required>{ventures.map((venture) => <option key={venture.id} value={venture.id}>{venture.name}</option>)}</select>
          <label className="mt-4 block text-sm font-semibold" htmlFor="priority-question">Question</label>
          <textarea className="mt-2 min-h-24 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-3" id="priority-question" maxLength={280} name="question" required />
          <label className="mt-4 block text-sm font-semibold" htmlFor="priority-decision">What decision changes?</label>
          <textarea className="mt-2 min-h-24 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-3" id="priority-decision" maxLength={280} name="decision" required />
          <label className="mt-4 block text-sm font-semibold" htmlFor="priority-evidence">Evidence needed <span className="font-normal text-[var(--fog)]">(one item per line)</span></label>
          <textarea className="mt-2 min-h-20 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-3" id="priority-evidence" name="evidence" />
          <Button className="mt-5" disabled={pending || !writesEnabled} type="submit"><Plus aria-hidden="true" className="size-4" />{pending ? "Saving…" : "Add priority"}</Button>
        </fieldset></form>

        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6">
          <div className="flex items-center gap-3"><ListChecks aria-hidden="true" className="size-5 text-[var(--accent)]" /><h3 className="text-xl font-semibold">Priority history</h3></div>
          <div className="mt-5 grid gap-3">
            {priorities.length ? priorities.map((item) => (
              <article className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge tone={item.status === "selected" ? "success" : item.status === "why-not" ? "warning" : "neutral"}>{priorityStatus(item.status)}</Badge>{priorityExpired(item.expires, now) ? <Badge tone="danger">Expired</Badge> : null}<Badge>{ventureLabel(item.venture)}</Badge></div>{item.status === "open" ? <Button disabled={pending || !writesEnabled} onClick={() => save({ action: "archive", itemId: item.id })} size="small" type="button" variant="ghost"><Archive aria-hidden="true" className="size-4" />Archive</Button> : null}</div>
                <h4 className="mt-3 text-base font-semibold">{item.question}</h4>
                <p className="mt-2 text-sm leading-6"><span className="text-[var(--fog)]">Decision:</span> {item.decisionAtStake}</p>
                {item.whyNotReason ? <p className="mt-2 text-sm leading-6 text-[var(--fog)]">Why not: {publicAgentText(item.whyNotReason)}</p> : null}
                {item.evidenceNeeded.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Evidence list</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--fog)]">{item.evidenceNeeded.map((entry) => <li key={entry}>{entry}</li>)}</ul></details> : null}
                <p className="mt-3 font-mono text-[0.625rem] text-[var(--fog)]">Added {formatDateTime(item.created)} · expires {formatDateTime(item.expires)}</p>
              </article>
            )) : <Callout>No priority items are stored. An empty queue is a healthy no-commission day.</Callout>}
          </div>
        </div>
      </div>
      <div aria-live="polite" className="mt-4 min-h-6 text-sm" role={error ? "alert" : "status"}>{error ? <span className="text-[var(--destructive)]">{error} Try again after reloading the latest queue.</span> : <span className="text-[var(--fog)]">{message}</span>}</div>
    </section>
  );
}
