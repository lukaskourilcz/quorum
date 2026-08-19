"use client";

import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton as Button,
  AdminCallout as Callout,
  AdminCard as Card,
  AdminCardContent as CardContent,
  AdminEntityBadge,
  AdminInput,
  AdminLabel,
  AdminStateMessage,
  AdminStatusBadge as Badge,
  AdminTextarea,
} from "./admin-primitives";
import { formatDateTime } from "@/lib/utils";

export interface AdminTehdejsiSignalDigest {
  id: string;
  recordedAt: string;
  sourceLabel: string;
  recollections: string[];
  correctionClaims?: string[];
}

export interface AdminTehdejsiSignalTheme {
  label: string;
  recurrence: number;
  lastSeenAt: string;
}

export interface AdminTehdejsiAudienceRequest {
  kind: "city" | "year" | "correction";
  value: string;
  recurrence: number;
  lastSeenAt: string;
}

export interface AdminTehdejsiProductInsight {
  id: string;
  title: string;
  finding: string;
  status: "proposed" | "accepted" | "rejected" | "done";
  proposedAction: string;
  evidence: Array<{ filePath: string; detail: string }>;
  ownerNote: string | null;
  updatedAt: string;
}

export interface AdminTehdejsiSignalsView {
  digests: AdminTehdejsiSignalDigest[];
  themes: AdminTehdejsiSignalTheme[];
  requests: AdminTehdejsiAudienceRequest[];
  insights: AdminTehdejsiProductInsight[];
  unreadable: number;
  pendingHarvests: number;
}

export const EMPTY_TEHDEJSI_SIGNALS: AdminTehdejsiSignalsView = {
  digests: [],
  themes: [],
  requests: [],
  insights: [],
  unreadable: 0,
  pendingHarvests: 0
};

function CommunityMemory({ view }: { view: AdminTehdejsiSignalsView }) {
  return (
    <section aria-labelledby="tehdejsi-community-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Owner-pasted only</p><h3 className="mt-1 text-2xl font-semibold" id="tehdejsi-community-heading">Community memory</h3></div>
        <AdminEntityBadge>{view.digests.length} digest{view.digests.length === 1 ? "" : "s"}</AdminEntityBadge>
      </div>
      <Callout className="mt-4">This view never scrapes comments or calls a platform API. Every line is an owner-pasted recollection, never a fact.</Callout>
      {view.digests.length ? (
        <div className="mt-4 grid gap-3">
          {view.digests.map((digest) => (
            <Card key={digest.id}><CardContent>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">{digest.id}</p><h4 className="mt-1 text-lg font-semibold">{digest.sourceLabel}</h4></div>
                <time className="text-xs text-[var(--admin-foreground-muted)]" dateTime={digest.recordedAt}>{formatDateTime(digest.recordedAt)}</time>
              </div>
              <ul className="m-0 mt-3 grid list-none divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)] p-0">
                {digest.recollections.map((recollection, index) => (
                  <li className="py-3" key={`${digest.id}-${index}`}>
                    <Badge tone="warning">Recollection · not a fact</Badge>
                    <p className="mt-2 text-sm leading-6 text-[var(--admin-foreground)]">{recollection}</p>
                  </li>
                ))}
              </ul>
              {digest.correctionClaims?.length ? <div className="mt-4"><p className="font-semibold">Correction claims awaiting research</p><ul className="mt-2 grid gap-2">{digest.correctionClaims.map((claim) => <li className="text-sm leading-6 text-[var(--admin-foreground-muted)]" key={claim}>Recollection · not a fact — {claim}</li>)}</ul></div> : null}
            </CardContent></Card>
          ))}
        </div>
      ) : <AdminStateMessage className="mt-4" state="initial-empty" title="No owner-pasted community memory is recorded." />}
    </section>
  );
}

function SignalPasteForm({ pendingHarvests }: { pendingHarvests: number }) {
  const writesEnabled = useAdminWritesEnabled();
  const [sourceLabel, setSourceLabel] = useState("");
  const [comments, setComments] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lines = comments.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const valid = sourceLabel.trim().length > 0 && sourceLabel.length <= 120 && lines.length >= 1 && lines.length <= 50 &&
    lines.every((line) => line.length <= 600) && new Set(lines.map((line) => line.toLocaleLowerCase("und"))).size === lines.length;
  async function save(): Promise<void> {
    if (!writesEnabled || pending || !valid) return;
    setPending(true); setMessage("Saving owner-pasted recollections…"); setError("");
    try {
      const response = await fetch("/admin/api/tehdejsi-svet/signals", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLabel: sourceLabel.trim(), comments: lines })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Signal save failed with ${response.status}.`);
      setSourceLabel(""); setComments("");
      setMessage("Comment harvest recorded for the Sunday overlay. Nothing was scraped or posted.");
    } catch (caught) { setMessage(""); setError(caught instanceof Error ? caught.message : "The comment harvest was not saved."); }
    finally { setPending(false); }
  }
  return <section aria-labelledby="tehdejsi-paste-heading" className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold" id="tehdejsi-paste-heading">Paste comment harvest</h3><AdminEntityBadge>{pendingHarvests} awaiting Sunday</AdminEntityBadge></div>
    <p className="mt-2 text-sm leading-6 text-[var(--admin-foreground-muted)]">Paste one comment per line. Optional labels: [theme: …], [city: …], [year: 1989], [correction: …]. These are research prompts, never facts.</p>
    <form className="mt-4 grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div><AdminLabel htmlFor="tehdejsi-signal-source">Source label</AdminLabel><AdminInput disabled={pending || !writesEnabled} id="tehdejsi-signal-source" maxLength={120} onChange={(event) => setSourceLabel(event.target.value)} value={sourceLabel} /></div>
      <div><AdminLabel htmlFor="tehdejsi-signal-comments">Owner-pasted comments</AdminLabel><AdminTextarea className="min-h-36" disabled={pending || !writesEnabled} id="tehdejsi-signal-comments" maxLength={30_000} onChange={(event) => setComments(event.target.value)} value={comments} /></div>
      <Button className="justify-self-start" disabled={pending || !writesEnabled || !valid} type="submit">{pending ? "Saving…" : "Record recollections"}</Button>
    </form>
    <div aria-live="polite" className="mt-3 min-h-5 text-sm" role={error ? "alert" : "status"}>{error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}</div>
  </section>;
}

function ThemesAndRequests({ view }: { view: AdminTehdejsiSignalsView }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section aria-labelledby="tehdejsi-themes-heading">
        <div className="flex items-center justify-between gap-3"><h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold" id="tehdejsi-themes-heading">Extracted themes</h3><AdminEntityBadge>{view.themes.length}</AdminEntityBadge></div>
        {view.themes.length ? <ul className="mt-4 grid gap-3">{view.themes.map((theme) => (
          <li className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4" key={theme.label}>
            <div className="flex items-center justify-between gap-3"><p className="font-semibold">{theme.label}</p><AdminEntityBadge>{theme.recurrence} mention{theme.recurrence === 1 ? "" : "s"}</AdminEntityBadge></div>
            <p className="mt-2 text-xs text-[var(--admin-foreground-muted)]">Last seen {formatDateTime(theme.lastSeenAt)}</p>
          </li>
        ))}</ul> : <AdminStateMessage className="mt-4" state="initial-empty" title="No themes have been extracted from recorded memory." />}
      </section>
      <section aria-labelledby="tehdejsi-requests-heading">
        <div className="flex items-center justify-between gap-3"><h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold" id="tehdejsi-requests-heading">Audience requests</h3><AdminEntityBadge>{view.requests.length}</AdminEntityBadge></div>
        {view.requests.length ? <ol className="mt-4 grid gap-3">{[...view.requests]
          .sort((left, right) => right.recurrence - left.recurrence || left.value.localeCompare(right.value))
          .map((request) => (
            <li className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4" key={`${request.kind}-${request.value}`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{request.value}</p><div className="flex gap-2"><AdminEntityBadge>{request.kind}</AdminEntityBadge><AdminEntityBadge>Repeated {request.recurrence}</AdminEntityBadge></div></div>
              <p className="mt-2 text-xs text-[var(--admin-foreground-muted)]">Last requested {formatDateTime(request.lastSeenAt)}</p>
            </li>
          ))}</ol> : <AdminStateMessage className="mt-4" state="initial-empty" title="No recurring city, year or correction request is recorded." />}
      </section>
    </div>
  );
}

function InsightQueue({ view }: { view: AdminTehdejsiSignalsView }) {
  const writesEnabled = useAdminWritesEnabled();
  const [insights, setInsights] = useState(view.insights);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(view.insights.map(({ id, ownerNote }) => [id, ownerNote ?? ""])));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function update(id: string, status: AdminTehdejsiProductInsight["status"]): Promise<void> {
    if (!writesEnabled || pendingId) return;
    setPendingId(id); setMessage("Saving owner decision…"); setError("");
    try {
      const response = await fetch("/admin/api/tehdejsi-svet/insights", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, ownerNote: notes[id]?.trim() || null })
      });
      const payload = await response.json().catch(() => ({})) as { insight?: AdminTehdejsiProductInsight; error?: string };
      if (!response.ok || !payload.insight) throw new Error(payload.error ?? `Insight update failed with ${response.status}.`);
      setInsights((current) => current.map((item) => item.id === id ? payload.insight! : item));
      setMessage("Product-insight status recorded. The product repository was not contacted or changed.");
    } catch (caught) { setMessage(""); setError(caught instanceof Error ? caught.message : "The insight decision was not saved."); }
    finally { setPendingId(null); }
  }
  return (
    <section aria-labelledby="tehdejsi-insights-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Owner-controlled product recommendations</p><h3 className="mt-1 text-2xl font-semibold" id="tehdejsi-insights-heading">Product insight queue</h3></div>
        <AdminEntityBadge>{insights.length} insight{insights.length === 1 ? "" : "s"}</AdminEntityBadge>
      </div>
      {insights.length ? <div className="mt-4 grid gap-3">{insights.map((insight) => (
        <Card key={insight.id}><CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">{insight.id}</p><h4 className="mt-1 text-lg font-semibold">{insight.title}</h4></div><Badge tone={insight.status === "done" ? "success" : insight.status === "rejected" ? "destructive" : "warning"}>{insight.status}</Badge></div>
          <p className="mt-3 text-sm leading-6 text-[var(--admin-foreground-muted)]">{insight.finding}</p>
          <p className="mt-3 text-sm leading-6 text-[var(--admin-foreground)]"><strong>Proposed owner action:</strong> {insight.proposedAction}</p>
          <ul className="mt-4 grid gap-2">{insight.evidence.map((item) => <li className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3 text-xs leading-5" key={item.filePath}><code className="break-all text-[var(--admin-foreground)]">{item.filePath}</code><p className="mt-1 text-[var(--admin-foreground-muted)]">{item.detail}</p></li>)}</ul>
          <div className="mt-4"><AdminLabel htmlFor={`${insight.id}-note`}>Owner note (optional)</AdminLabel><AdminTextarea className="min-h-20" disabled={!writesEnabled || pendingId !== null || insight.status === "done" || insight.status === "rejected"} id={`${insight.id}-note`} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [insight.id]: event.target.value }))} value={notes[insight.id] ?? ""} /></div>
          <div className="mt-3 flex flex-wrap gap-2">
            {insight.status === "proposed" ? <><Button disabled={!writesEnabled || pendingId !== null} onClick={() => void update(insight.id, "accepted")} type="button">Accept recommendation</Button><Button disabled={!writesEnabled || pendingId !== null} onClick={() => void update(insight.id, "rejected")} type="button" variant="secondary">Reject recommendation</Button></> : null}
            {insight.status === "accepted" ? <><Button disabled={!writesEnabled || pendingId !== null} onClick={() => void update(insight.id, "done")} type="button">Mark owner-completed</Button><Button disabled={!writesEnabled || pendingId !== null} onClick={() => void update(insight.id, "rejected")} type="button" variant="secondary">Reject recommendation</Button></> : null}
          </div>
        </CardContent></Card>
      ))}</div> : <AdminStateMessage className="mt-4" state="initial-empty" title="No product insight is recorded." description="This panel cannot change the product." />}
      <div aria-live="polite" className="mt-3 min-h-5 text-sm" role={error ? "alert" : "status"}>{error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}</div>
    </section>
  );
}

export function TehdejsiSvetSignalsPanel({ view = EMPTY_TEHDEJSI_SIGNALS }: { view?: AdminTehdejsiSignalsView }) {
  return (
    <div className="grid gap-6" data-tehdejsi-signals>
      {view.unreadable > 0 ? <Callout tone="warning">{view.unreadable} malformed signal record{view.unreadable === 1 ? "" : "s"} was omitted.</Callout> : null}
      <SignalPasteForm pendingHarvests={view.pendingHarvests} />
      <CommunityMemory view={view} />
      <ThemesAndRequests view={view} />
      <InsightQueue view={view} />
    </div>
  );
}
