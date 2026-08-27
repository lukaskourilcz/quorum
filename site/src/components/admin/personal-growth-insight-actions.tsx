"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminButton, AdminInput, AdminLabel, AdminSelect, AdminTextarea } from "./admin-primitives";
import { PersonalGrowthActionStatus, savePersonalGrowthAction } from "./personal-growth-actions";
import type { PersonalGrowthExperimentView, PersonalGrowthResultView, PersonalGrowthStrategyView } from "@/lib/personal-growth-admin-insights";

const PILLARS = [
  "life-lifestyle", "writing-publishing", "hip-hop", "rapovej-denik", "travel-places-lived", "prague",
  "software-products", "boardlessai-behind-scenes", "fitness-discipline-muay-thai", "books-reading", "clothing-personal-style"
] as const;

const METRICS = ["reach", "views", "non_follower_reach_ratio", "profile_view_to_follow_rate", "saves_per_1000_reach", "shares_per_1000_reach", "early_exit_rate", "replies_per_1000_views", "reposts_quotes_per_1000_views"] as const;

function useSave() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const save = (payload: unknown) => startTransition(async () => {
    const result = await savePersonalGrowthAction(payload);
    setStatus(result);
    if (result.ok) router.refresh();
  });
  return { pending, save, status };
}

export function PersonalGrowthResultCreateForm() {
  const { pending, save, status } = useSave();
  const [format, setFormat] = useState("photo");
  const [origin, setOrigin] = useState("owner-current-life");
  return (
    <details className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3">
      <summary className="admin-focus-ring cursor-pointer text-[length:var(--admin-type-control)] font-semibold">Record owner-supplied result</summary>
      <form className="mt-4 grid gap-3" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const published = fields.get("publishedAt");
        const manual = origin === "owner-manual-venture-reference";
        save({
          type: "result-create",
          platform: fields.get("platform"),
          nativePostId: fields.get("nativePostId"),
          url: fields.get("url"),
          publishedAt: typeof published === "string" && published ? new Date(published).toISOString() : "",
          format,
          language: fields.get("language"),
          personalPillar: fields.get("personalPillar"),
          contentOrigin: origin,
          collaborator: fields.get("collaborator") || null,
          publicationRelation: fields.get("publicationRelation") || null,
          reelSeries: format === "reel" ? fields.get("reelSeries") : null,
          goviralSignalId: origin === "goviral-assisted" ? fields.get("goviralSignalId") : null,
          manualReference: manual ? {
            sourceProject: fields.get("sourceProject"),
            publicItemId: fields.get("publicItemId"),
            publicUrl: fields.get("publicUrl"),
            ownerAuthored: fields.get("ownerAuthored") === "on",
            personalConnection: fields.get("personalConnection") || null,
            ownerCommentaryNote: fields.get("ownerCommentaryNote")
          } : null,
          experimentId: fields.get("experimentId") || null,
          ownerEvidenceRef: fields.get("ownerEvidenceRef"),
          ownerRating: fields.get("ownerRating") ? Number(fields.get("ownerRating")) : null,
          ownerNote: fields.get("ownerNote") || null
        });
      }}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><AdminLabel htmlFor="pg-result-platform">Platform</AdminLabel><AdminSelect id="pg-result-platform" name="platform"><option value="instagram">Instagram</option><option value="threads">Threads</option></AdminSelect></div>
          <div><AdminLabel htmlFor="pg-result-native-id">Native post ID</AdminLabel><AdminInput id="pg-result-native-id" maxLength={200} name="nativePostId" required /></div>
          <div><AdminLabel htmlFor="pg-result-url">Public URL</AdminLabel><AdminInput id="pg-result-url" name="url" placeholder="https://…" required type="url" /></div>
          <div><AdminLabel htmlFor="pg-result-published">Published at</AdminLabel><AdminInput id="pg-result-published" name="publishedAt" required type="datetime-local" /></div>
          <div><AdminLabel htmlFor="pg-result-format">Format</AdminLabel><AdminSelect id="pg-result-format" name="format" onChange={(event) => setFormat(event.target.value)} value={format}>{["text", "photo", "photo-dump", "carousel", "reel", "story", "publication-distribution"].map((value) => <option key={value} value={value}>{value}</option>)}</AdminSelect></div>
          <div><AdminLabel htmlFor="pg-result-language">Language</AdminLabel><AdminSelect id="pg-result-language" name="language"><option value="cs">Czech</option><option value="en">English</option></AdminSelect></div>
          <div><AdminLabel htmlFor="pg-result-pillar">Personal pillar</AdminLabel><AdminSelect id="pg-result-pillar" name="personalPillar">{PILLARS.map((pillar) => <option key={pillar} value={pillar}>{pillar}</option>)}</AdminSelect></div>
          <div><AdminLabel htmlFor="pg-result-origin">Origin</AdminLabel><AdminSelect id="pg-result-origin" name="contentOrigin" onChange={(event) => setOrigin(event.target.value)} value={origin}><option value="owner-current-life">Owner current life</option><option value="owner-private">Owner private</option><option value="owner-authored-publication">Owner-authored publication</option><option value="goviral-assisted">GoVIRAL-assisted</option><option value="owner-manual-venture-reference">Owner-manual venture reference</option></AdminSelect></div>
          <div><AdminLabel htmlFor="pg-result-publication">Publication relation</AdminLabel><AdminSelect id="pg-result-publication" name="publicationRelation"><option value="">None</option><option value="okraj">OKRAJ</option><option value="bbarak">BBARAK</option></AdminSelect></div>
          {format === "reel" ? <div><AdminLabel htmlFor="pg-result-reel">Reel series</AdminLabel><AdminSelect id="pg-result-reel" name="reelSeries">{["rapovej-moment", "behind-the-page", "life-between-projects", "trend-met-memory", "english-rapovej-denik"].map((value) => <option key={value} value={value}>{value}</option>)}</AdminSelect></div> : null}
          {origin === "goviral-assisted" ? <div><AdminLabel htmlFor="pg-result-goviral">Accepted signal ID</AdminLabel><AdminInput id="pg-result-goviral" name="goviralSignalId" pattern="pg-gv-[a-f0-9]{16}" required /></div> : null}
          <div><AdminLabel htmlFor="pg-result-experiment">Experiment ID</AdminLabel><AdminInput id="pg-result-experiment" name="experimentId" pattern="pg-exp-[a-z0-9-]+" /></div>
          <div><AdminLabel htmlFor="pg-result-collaborator">Collaborator</AdminLabel><AdminInput id="pg-result-collaborator" maxLength={120} name="collaborator" /></div>
          <div><AdminLabel htmlFor="pg-result-rating">Owner rating</AdminLabel><AdminInput id="pg-result-rating" max={5} min={1} name="ownerRating" type="number" /></div>
        </div>
        {origin === "owner-manual-venture-reference" ? <fieldset className="grid gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3 sm:grid-cols-2"><legend className="px-1 text-[length:var(--admin-type-control)] font-semibold">Bounded owner-manual reference</legend><div><AdminLabel htmlFor="pg-result-source-project">Source project</AdminLabel><AdminInput id="pg-result-source-project" name="sourceProject" required /></div><div><AdminLabel htmlFor="pg-result-public-item">Public item ID</AdminLabel><AdminInput id="pg-result-public-item" name="publicItemId" required /></div><div><AdminLabel htmlFor="pg-result-public-url">Public item URL</AdminLabel><AdminInput id="pg-result-public-url" name="publicUrl" required type="url" /></div><label className="admin-focus-ring flex items-center gap-2 self-end rounded-[var(--admin-radius)] p-2 text-[length:var(--admin-type-control)]"><input name="ownerAuthored" type="checkbox" /> Owner-authored</label><div><AdminLabel htmlFor="pg-result-connection">Personal connection</AdminLabel><AdminTextarea id="pg-result-connection" maxLength={360} name="personalConnection" /></div><div><AdminLabel htmlFor="pg-result-commentary">Owner commentary</AdminLabel><AdminTextarea id="pg-result-commentary" maxLength={600} name="ownerCommentaryNote" required /></div></fieldset> : null}
        <div><AdminLabel htmlFor="pg-result-evidence">Owner evidence reference</AdminLabel><AdminInput id="pg-result-evidence" maxLength={500} name="ownerEvidenceRef" placeholder="owner-result:…" required /></div>
        <div><AdminLabel htmlFor="pg-result-note">Owner note</AdminLabel><AdminTextarea id="pg-result-note" maxLength={1000} name="ownerNote" /></div>
        <div className="flex flex-wrap items-center gap-3"><AdminButton disabled={pending} type="submit" variant="primary">{pending ? "Saving…" : "Record result"}</AdminButton><PersonalGrowthActionStatus value={status} /></div>
      </form>
    </details>
  );
}

export function PersonalGrowthResultCorrectionForm({ result }: { result: PersonalGrowthResultView }) {
  const { pending, save, status } = useSave();
  return (
    <details className="mt-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3">
      <summary className="admin-focus-ring cursor-pointer text-[length:var(--admin-type-control)] font-semibold">Append correction</summary>
      <form className="mt-3 grid gap-3" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); save({ type: "result-correction", resultId: result.resultId, reason: fields.get("reason"), evidenceRef: fields.get("evidenceRef"), ownerRating: fields.get("ownerRating") ? Number(fields.get("ownerRating")) : null, ownerNote: fields.get("ownerNote") || null }); }}>
        <div><AdminLabel htmlFor={`${result.resultId}-correction-reason`}>Correction reason</AdminLabel><AdminTextarea id={`${result.resultId}-correction-reason`} maxLength={360} name="reason" required /></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><AdminLabel htmlFor={`${result.resultId}-correction-evidence`}>Evidence reference</AdminLabel><AdminInput id={`${result.resultId}-correction-evidence`} maxLength={500} name="evidenceRef" required /></div><div><AdminLabel htmlFor={`${result.resultId}-correction-rating`}>Corrected rating</AdminLabel><AdminInput id={`${result.resultId}-correction-rating`} max={5} min={1} name="ownerRating" type="number" /></div></div>
        <div><AdminLabel htmlFor={`${result.resultId}-correction-note`}>Corrected owner note</AdminLabel><AdminTextarea id={`${result.resultId}-correction-note`} maxLength={1000} name="ownerNote" /></div>
        <div className="flex flex-wrap items-center gap-3"><AdminButton disabled={pending} type="submit">{pending ? "Saving…" : "Append correction"}</AdminButton><PersonalGrowthActionStatus value={status} /></div>
      </form>
    </details>
  );
}

export function PersonalGrowthExperimentCreateForm() {
  const { pending, save, status } = useSave();
  return (
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); save({ type: "experiment-create", changedVariable: fields.get("changedVariable"), hypothesis: fields.get("hypothesis"), primaryMetric: fields.get("primaryMetric"), secondaryGuardrail: fields.get("secondaryGuardrail"), startDate: fields.get("startDate"), minimumSample: Number(fields.get("minimumSample")), evaluationWindowDays: Number(fields.get("evaluationWindowDays")) }); }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><AdminLabel htmlFor="pg-exp-variable">One changed variable</AdminLabel><AdminSelect id="pg-exp-variable" name="changedVariable">{["trial-reel", "language", "photo-format", "goviral-opening", "threads-topic-tag", "timing-window", "manual-venture-reference"].map((value) => <option key={value} value={value}>{value}</option>)}</AdminSelect></div><div><AdminLabel htmlFor="pg-exp-metric">Primary metric</AdminLabel><AdminSelect id="pg-exp-metric" name="primaryMetric">{METRICS.map((value) => <option key={value} value={value}>{value}</option>)}</AdminSelect></div><div><AdminLabel htmlFor="pg-exp-start">Start date</AdminLabel><AdminInput id="pg-exp-start" name="startDate" required type="date" /></div><div className="grid grid-cols-2 gap-2"><div><AdminLabel htmlFor="pg-exp-sample">Min sample</AdminLabel><AdminInput defaultValue={6} id="pg-exp-sample" max={1000} min={2} name="minimumSample" required type="number" /></div><div><AdminLabel htmlFor="pg-exp-window">Days</AdminLabel><AdminInput defaultValue={28} id="pg-exp-window" max={90} min={1} name="evaluationWindowDays" required type="number" /></div></div></div>
      <div><AdminLabel htmlFor="pg-exp-hypothesis">Bounded hypothesis</AdminLabel><AdminTextarea id="pg-exp-hypothesis" maxLength={800} name="hypothesis" required /></div>
      <div><AdminLabel htmlFor="pg-exp-guardrail">Secondary guardrail</AdminLabel><AdminInput id="pg-exp-guardrail" maxLength={240} name="secondaryGuardrail" required /></div>
      <div className="flex flex-wrap items-center gap-3"><AdminButton disabled={pending} type="submit" variant="primary">{pending ? "Saving…" : "Create in backlog"}</AdminButton><PersonalGrowthActionStatus value={status} /></div>
    </form>
  );
}

export function PersonalGrowthExperimentActions({ experiment }: { experiment: PersonalGrowthExperimentView }) {
  const { pending, save, status } = useSave();
  const [operation, setOperation] = useState<"activate" | "pause" | "review" | "stop">("activate");
  const [verdict, setVerdict] = useState<"KEEP" | "ITERATE" | "STOP" | "INSUFFICIENT_DATA">("INSUFFICIENT_DATA");
  return (
    <form className="mt-3 grid gap-3" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value"); save(intent === "verdict" ? { type: "experiment-verdict", experimentId: experiment.id, verdict, note: fields.get("note") } : { type: "experiment-state", experimentId: experiment.id, operation, note: fields.get("note") }); }}>
      <div><AdminLabel htmlFor={`${experiment.id}-note`}>Required owner note</AdminLabel><AdminTextarea id={`${experiment.id}-note`} maxLength={1000} name="note" required /></div>
      <div className="grid gap-3 sm:grid-cols-2"><div><AdminLabel htmlFor={`${experiment.id}-state`}>Lifecycle action</AdminLabel><div className="flex gap-2"><AdminSelect id={`${experiment.id}-state`} onChange={(event) => setOperation(event.target.value as typeof operation)} value={operation}><option value="activate">Activate</option><option value="pause">Pause</option><option value="review">Move to review</option><option value="stop">Stop</option></AdminSelect><AdminButton disabled={pending} type="submit" value="state">Apply</AdminButton></div></div><div><AdminLabel htmlFor={`${experiment.id}-verdict`}>Evidence verdict</AdminLabel><div className="flex gap-2"><AdminSelect id={`${experiment.id}-verdict`} onChange={(event) => setVerdict(event.target.value as typeof verdict)} value={verdict}><option value="INSUFFICIENT_DATA">Insufficient data</option><option value="KEEP">Keep</option><option value="ITERATE">Iterate</option><option value="STOP">Stop</option></AdminSelect><AdminButton disabled={pending} type="submit" value="verdict">Record</AdminButton></div></div></div>
      <PersonalGrowthActionStatus value={status} />
    </form>
  );
}

export function PersonalGrowthPillarForm({ pillar }: { pillar: PersonalGrowthStrategyView["pillars"][number] }) {
  const { pending, save, status } = useSave();
  return <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); save({ type: "strategy-pillar", pillar: pillar.pillar, status: fields.get("status"), weight: Number(fields.get("weight")), vetoes: String(fields.get("vetoes") ?? "").split("\n").map((value) => value.trim()).filter(Boolean), reason: fields.get("reason") }); }}><div className="grid gap-2 sm:grid-cols-3"><div><AdminLabel htmlFor={`${pillar.pillar}-status`}>Status</AdminLabel><AdminSelect defaultValue={pillar.status} id={`${pillar.pillar}-status`} name="status"><option value="enabled">Enabled</option><option value="paused">Paused</option></AdminSelect></div><div><AdminLabel htmlFor={`${pillar.pillar}-weight`}>Weight</AdminLabel><AdminInput defaultValue={pillar.weight} id={`${pillar.pillar}-weight`} max={1} min={0} name="weight" required step="0.01" type="number" /></div><div><AdminLabel htmlFor={`${pillar.pillar}-reason`}>Change reason</AdminLabel><AdminInput id={`${pillar.pillar}-reason`} maxLength={500} name="reason" required /></div></div><div><AdminLabel htmlFor={`${pillar.pillar}-vetoes`}>Explicit vetoes, one per line</AdminLabel><AdminTextarea defaultValue={pillar.vetoes.join("\n")} id={`${pillar.pillar}-vetoes`} maxLength={4800} name="vetoes" /></div><div className="flex flex-wrap items-center gap-3"><AdminButton disabled={pending} type="submit">{pending ? "Saving…" : "Save pillar"}</AdminButton><PersonalGrowthActionStatus value={status} /></div></form>;
}

export function PersonalGrowthPolicyForm({ strategy }: { strategy: PersonalGrowthStrategyView }) {
  const { pending, save, status } = useSave();
  const policy = strategy.policy;
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); save({ type: "strategy-policy", personalFeedMinimum: Number(fields.get("personalFeedMinimum")), ventureLedMaximum: Number(fields.get("ventureLedMaximum")), ventureStoriesPerSevenDaysMaximum: Number(fields.get("ventureStoriesPerSevenDaysMaximum")), sameVentureCooldownDays: Number(fields.get("sameVentureCooldownDays")), reason: fields.get("reason") }); }}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><AdminLabel htmlFor="pg-policy-personal">Personal minimum</AdminLabel><AdminInput defaultValue={policy.personalFeedMinimum} id="pg-policy-personal" max={1} min={0.85} name="personalFeedMinimum" required step="0.01" type="number" /></div><div><AdminLabel htmlFor="pg-policy-venture">Manual venture maximum</AdminLabel><AdminInput defaultValue={policy.ventureLedMaximum} id="pg-policy-venture" max={0.15} min={0} name="ventureLedMaximum" required step="0.01" type="number" /></div><div><AdminLabel htmlFor="pg-policy-stories">Venture Stories / 7d</AdminLabel><AdminInput defaultValue={policy.ventureStoriesPerSevenDaysMaximum} id="pg-policy-stories" max={2} min={0} name="ventureStoriesPerSevenDaysMaximum" required type="number" /></div><div><AdminLabel htmlFor="pg-policy-cooldown">Same-venture cooldown</AdminLabel><AdminInput defaultValue={policy.sameVentureCooldownDays} id="pg-policy-cooldown" max={365} min={10} name="sameVentureCooldownDays" required type="number" /></div></div><div><AdminLabel htmlFor="pg-policy-reason">Revision reason</AdminLabel><AdminInput id="pg-policy-reason" maxLength={500} name="reason" required /></div><div className="flex flex-wrap items-center gap-3"><AdminButton disabled={pending} type="submit" variant="primary">{pending ? "Saving…" : "Append policy revision"}</AdminButton><PersonalGrowthActionStatus value={status} /></div></form>;
}

export function PersonalGrowthSettingsForm({ strategy }: { strategy: PersonalGrowthStrategyView }) {
  const { pending, save, status } = useSave();
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); save({ type: "strategy-settings", defaultLanguage: fields.get("defaultLanguage"), platformsUsed: ["instagram", "threads"].filter((platform) => fields.get(platform) === "on"), reason: fields.get("reason") }); }}><div className="grid gap-3 sm:grid-cols-3"><div><AdminLabel htmlFor="pg-default-language">Default language lane</AdminLabel><AdminSelect defaultValue={strategy.defaultLanguage} id="pg-default-language" name="defaultLanguage"><option value="cs">Czech</option><option value="en">English</option></AdminSelect></div>{(["instagram", "threads"] as const).map((platform) => <label className="admin-focus-ring flex items-center gap-2 self-end rounded-[var(--admin-radius)] p-2 text-[length:var(--admin-type-control)]" key={platform}><input defaultChecked={strategy.platformsUsed.includes(platform)} name={platform} type="checkbox" /> {platform} actually used</label>)}</div><div><AdminLabel htmlFor="pg-settings-reason">Change reason</AdminLabel><AdminInput id="pg-settings-reason" maxLength={500} name="reason" required /></div><div className="flex flex-wrap items-center gap-3"><AdminButton disabled={pending} type="submit">{pending ? "Saving…" : "Save lanes"}</AdminButton><PersonalGrowthActionStatus value={status} /></div></form>;
}

export function PersonalGrowthBudgetModeForm({ activeMode }: { activeMode: "default" | "buffer" | "unavailable" }) {
  const { pending, save, status } = useSave();
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); save({ type: "budget-mode", mode: fields.get("mode"), reason: fields.get("reason") }); }}><div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"><div><AdminLabel htmlFor="pg-budget-mode">Authorised allocation</AdminLabel><AdminSelect defaultValue={activeMode === "unavailable" ? "default" : activeMode} id="pg-budget-mode" name="mode"><option value="default">Default</option><option value="buffer">Buffer</option></AdminSelect></div><div><AdminLabel htmlFor="pg-budget-reason">Change reason</AdminLabel><AdminInput id="pg-budget-reason" maxLength={500} name="reason" required /></div><AdminButton disabled={pending} type="submit" variant="primary">{pending ? "Saving…" : "Switch mode"}</AdminButton></div><PersonalGrowthActionStatus value={status} /></form>;
}

export function PersonalGrowthDisableCapability({ capability }: { capability: string }) {
  const { pending, save, status } = useSave();
  return <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); save({ type: "capability-disable", capability, reason: fields.get("reason") }); }}><div className="min-w-52 flex-1"><AdminLabel htmlFor={`pg-disable-${capability}`}>Disable reason</AdminLabel><AdminInput id={`pg-disable-${capability}`} maxLength={500} name="reason" required /></div><AdminButton disabled={pending} type="submit" variant="destructive">{pending ? "Disabling…" : "Disable"}</AdminButton><PersonalGrowthActionStatus value={status} /></form>;
}
