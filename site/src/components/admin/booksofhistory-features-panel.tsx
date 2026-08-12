"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminWritesEnabled } from "./admin-write-mode";
import { Panel } from "./panel";
import { RatingWidget } from "./rating-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { AdminBhFeature, AdminBooksofhistorySnapshot } from "@/lib/admin-booksofhistory";
import { OWNER_RESULT_METRICS, type OwnerResultMetric } from "@/lib/owner-result-entry";

type Locale = "cs" | "en";
type Drafts = AdminBhFeature["payloads"];
const locales: Locale[] = ["cs", "en"];
const localeName: Record<Locale, string> = { cs: "Czech", en: "English" };
const metricName: Record<OwnerResultMetric, string> = {
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  follows: "Follows",
  linkTaps: "Link taps"
};
const subscribeToHydration = () => () => {};

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved" || status === "posted") return "success";
  if (status === "rejected") return "danger";
  if (status === "draft") return "warning";
  return "neutral";
}

function PackageView({ draft, editing, locale, setDrafts }: { draft: Drafts[Locale]; editing: boolean; locale: Locale; setDrafts: React.Dispatch<React.SetStateAction<Drafts>> }) {
  const update = (field: "headline" | "caption", value: string) => setDrafts((current) => ({ ...current, [locale]: { ...current[locale], [field]: value } }));
  const updateSlide = (index: number, value: string) => setDrafts((current) => ({ ...current, [locale]: { ...current[locale], slides: current[locale].slides.map((slide, currentIndex) => currentIndex === index ? { ...slide, text: value } : slide) } }));
  return (
    <section aria-labelledby={`bh-package-${locale}`} className="min-w-0 rounded-[10px] border border-[#2d2d33] bg-[#101013] p-4">
      <div className="flex items-center justify-between gap-3"><h4 className="text-lg font-semibold" id={`bh-package-${locale}`}>{localeName[locale]} package</h4><Badge>{locale.toUpperCase()}</Badge></div>
      {editing ? <label className="mt-4 block text-xs text-[#94949c]">Headline<textarea className="mt-2 min-h-20 w-full rounded-[8px] border border-[#3f3f46] bg-[#0c0c0f] p-3 text-sm text-white" maxLength={180} onChange={(event) => update("headline", event.target.value)} value={draft.headline} /></label> : <h5 className="mt-4 text-xl font-semibold leading-7">{draft.headline}</h5>}
      <ol className="mt-4 grid gap-3">
        {draft.slides.map((slide, index) => <li className="rounded-[8px] border border-[#26262b] bg-[#0c0c0f] p-3" key={`${locale}-${index}`}><p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">Slide {index + 1} · {slide.role}</p>{editing ? <textarea aria-label={`${localeName[locale]} slide ${index + 1}`} className="mt-2 min-h-24 w-full rounded-[8px] border border-[#3f3f46] bg-[#101013] p-3 text-sm leading-6 text-white" maxLength={800} onChange={(event) => updateSlide(index, event.target.value)} value={slide.text} /> : <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#d4d4d8]">{slide.text}</p>}</li>)}
      </ol>
      {editing ? <label className="mt-4 block text-xs text-[#94949c]">Caption<textarea className="mt-2 min-h-28 w-full rounded-[8px] border border-[#3f3f46] bg-[#0c0c0f] p-3 text-sm leading-6 text-white" maxLength={2_200} onChange={(event) => update("caption", event.target.value)} value={draft.caption} /></label> : <div className="mt-4"><p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">Caption</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#d4d4d8]">{draft.caption}</p></div>}
      {draft.quotes.length ? <div className="mt-4"><p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">Attributed quotes</p>{draft.quotes.map((quote) => <blockquote className="mt-2 border-l-2 border-[#684d08] pl-3 text-sm leading-6 text-[#d4d4d8]" key={`${quote.claimRef}-${quote.text}`}>“{quote.text}” <cite className="not-italic text-[#94949c]">— {quote.attribution}</cite></blockquote>)}</div> : null}
    </section>
  );
}

function OwnerResultLane({ feature, locale, writesEnabled }: { feature: AdminBhFeature; locale: Locale; writesEnabled: boolean }) {
  const router = useRouter();
  const [platform, setPlatform] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [note, setNote] = useState("");
  const [metrics, setMetrics] = useState<Record<OwnerResultMetric, string>>(() => Object.fromEntries(OWNER_RESULT_METRICS.map((metric) => [metric, ""])) as Record<OwnerResultMetric, string>);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const postUrl = feature.postedUrls[locale];
  const hasMetric = OWNER_RESULT_METRICS.some((metric) => metrics[metric].trim() !== "");

  async function recordResult() {
    if (!writesEnabled || !postUrl) return;
    setPending(true); setMessage(""); setError("");
    try {
      const response = await fetch("/admin/api/booksofhistory/results", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId: feature.recommendationId,
          locale,
          platform: platform.trim(),
          postUrl,
          capturedAt: new Date(capturedAt).toISOString(),
          recordedAt: new Date().toISOString(),
          metrics: Object.fromEntries(OWNER_RESULT_METRICS.map((metric) => [metric, metrics[metric].trim() === "" ? null : Number(metrics[metric])])),
          note: note.trim() || null,
          idempotencyKey: `owner-result-${Date.now()}-${crypto.randomUUID()}`
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Owner result failed with ${response.status}.`);
      setMessage("Owner-entered result saved and attached to this lane.");
      setMetrics(Object.fromEntries(OWNER_RESULT_METRICS.map((metric) => [metric, ""])) as Record<OwnerResultMetric, string>);
      setNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Owner result failed before it was saved.");
    } finally { setPending(false); }
  }

  return (
    <section className="min-w-0 rounded-[10px] border border-[#26262b] bg-[#0c0c0f] p-4">
      <h5 className="font-semibold">{localeName[locale]} owner records</h5>
      <p className="mt-1 text-xs leading-5 text-[#94949c]">Manual entry only. This form reads no platform and does not change the D9 measurement hold.</p>
      <label className="mt-3 block text-xs text-[#94949c]">URL after you post it<input className="mt-2 min-h-11 w-full rounded-[8px] border border-[#3f3f46] bg-[#101013] px-3 text-sm text-white" disabled={pending} placeholder="Record the URL above first" readOnly type="url" value={postUrl ?? ""} /></label>
      {!postUrl ? <Callout className="mt-3">Record this lane&apos;s owner-posted URL before entering its result.</Callout> : <>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[#94949c]">Platform slug<input className="mt-2 min-h-11 w-full rounded-[8px] border border-[#3f3f46] bg-[#101013] px-3 text-sm text-white" maxLength={80} onChange={(event) => setPlatform(event.target.value)} placeholder="instagram" value={platform} /></label>
          <label className="text-xs text-[#94949c]">Captured at<input className="mt-2 min-h-11 w-full rounded-[8px] border border-[#3f3f46] bg-[#101013] px-3 text-sm text-white" onChange={(event) => setCapturedAt(event.target.value)} type="datetime-local" value={capturedAt} /></label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{OWNER_RESULT_METRICS.map((metric) => <label className="text-xs text-[#94949c]" key={metric}>{metricName[metric]}<input className="mt-2 min-h-11 w-full rounded-[8px] border border-[#3f3f46] bg-[#101013] px-3 text-sm tabular-nums text-white" inputMode="numeric" min={0} onChange={(event) => setMetrics((current) => ({ ...current, [metric]: event.target.value }))} step={1} type="number" value={metrics[metric]} /></label>)}</div>
        <label className="mt-3 block text-xs text-[#94949c]">Optional owner note<textarea className="mt-2 min-h-20 w-full rounded-[8px] border border-[#3f3f46] bg-[#101013] p-3 text-sm text-white" maxLength={500} onChange={(event) => setNote(event.target.value)} value={note} /></label>
        <Button className="mt-3" disabled={pending || !writesEnabled || !platform.trim() || !capturedAt || !hasMetric} onClick={recordResult} variant="secondary">Record owner-entered result</Button>
      </>}
      <div className="mt-4 grid gap-2">{feature.results[locale].map((result) => <article className="rounded-[8px] border border-[#26262b] bg-[#101013] p-3" key={result.resultId}><div className="flex flex-wrap items-center justify-between gap-2"><Badge>{result.platform}</Badge><time className="font-mono text-[9.5px] text-[#94949c]" dateTime={result.capturedAt}>{result.capturedAt.replace("T", " ").slice(0, 16)} UTC</time></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{OWNER_RESULT_METRICS.filter((metric) => result.metrics[metric] !== null).map((metric) => <div key={metric}><dt className="text-[#71717a]">{metricName[metric]}</dt><dd className="mt-1 tabular-nums text-[#d4d4d8]">{result.metrics[metric]}</dd></div>)}</dl>{result.note ? <p className="mt-3 text-xs leading-5 text-[#a1a1aa]">{result.note}</p> : null}</article>)}</div>
      <p className="mt-3 text-xs text-[#71717a]">{feature.resultCounts[locale]} attached {feature.resultCounts[locale] === 1 ? "result" : "results"}</p>
      <div aria-live="polite" className="mt-2 min-h-5 text-sm" role={error ? "alert" : "status"}>{error ? <span className="text-[#fca5a5]">{error}</span> : <span className="text-[#a1a1aa]">{message}</span>}</div>
    </section>
  );
}

function FeatureReview({ feature, snapshot }: { feature: AdminBhFeature; snapshot: AdminBooksofhistorySnapshot }) {
  const router = useRouter();
  const deploymentWritesEnabled = useAdminWritesEnabled();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [drafts, setDrafts] = useState<Drafts>(() => structuredClone(feature.payloads));
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [postedUrls, setPostedUrls] = useState<Record<Locale, string>>({ cs: feature.postedUrls.cs ?? "", en: feature.postedUrls.en ?? "" });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const writesEnabled = deploymentWritesEnabled && hydrated;
  const dossier = snapshot.dossiers.find((item) => item.bookId === feature.dossierId);
  const story = dossier?.stories.find((item) => item.storyId === feature.storyId);
  const claims = dossier?.claims.filter((claim) => feature.claimRefs.includes(claim.claimId)) ?? [];
  const canApprove = feature.status === "draft" && locales.every((locale) => feature.gates[locale].passed && feature.gates[locale].violations.length === 0);
  const canRecordOutcomes = feature.status === "approved" || feature.status === "posted";

  async function act(action: "approve" | "edit-approve" | "reject" | "posted", extra: Record<string, unknown> = {}) {
    if (!writesEnabled) return;
    setPending(true); setMessage(""); setError("");
    const at = new Date().toISOString();
    try {
      const response = await fetch("/admin/api/booksofhistory/features", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, recommendationId: feature.recommendationId, idempotencyKey: `${action}-${Date.now()}-${crypto.randomUUID()}`, at, ...extra })
      });
      const result = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(result.error ?? `Feature action failed with ${response.status}.`);
      setMessage(`${action === "posted" ? "Owner-posted URL" : "Feature decision"} saved.`);
      setEditing(false); setReason("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Feature action failed before it was saved.");
    } finally { setPending(false); }
  }

  const editPayloads = {
    cs: { schemaVersion: "bh-language-feature/1", ...drafts.cs },
    en: { schemaVersion: "bh-language-feature/1", ...drafts.en }
  };

  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-[12px] border border-[#2d2d33] bg-[#0c0c0f] p-4" data-bh-feature={feature.recommendationId}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">{feature.cycleId}</p><h3 className="mt-1 break-words text-xl font-semibold">{drafts.en.headline}</h3><p className="mt-1 break-all font-mono text-[10px] text-[#94949c]">{feature.recommendationId}</p></div><div className="flex flex-wrap gap-2"><Badge tone={statusTone(feature.status)}>{feature.status}</Badge><Badge>{feature.designLabStatus === "ready" ? "Design Lab ready" : `Design Lab ${feature.designLabStatus}`}</Badge></div></div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2"><PackageView draft={drafts.cs} editing={editing} locale="cs" setDrafts={setDrafts} /><PackageView draft={drafts.en} editing={editing} locale="en" setDrafts={setDrafts} /></div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-[10px] border border-[#26262b] bg-[#101013] p-4"><h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">Story brief</h4>{story ? <><p className="mt-3 text-lg font-semibold">{story.angle}</p><p className="mt-2 text-sm text-[#a1a1aa]">Score {story.score} · {story.used ? "already used" : "unused on the dossier shelf"}</p></> : <Callout className="mt-3">The referenced story is not available in a readable dossier.</Callout>}</section>
        <section className="rounded-[10px] border border-[#26262b] bg-[#101013] p-4"><h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">Production gates</h4><div className="mt-3 grid gap-3 sm:grid-cols-2">{locales.map((locale) => <div key={locale}><Badge tone={feature.gates[locale].passed && !feature.gates[locale].violations.length ? "success" : "danger"}>{locale.toUpperCase()} {feature.gates[locale].passed ? "passed" : "failed"}</Badge>{feature.gates[locale].violations.map((violation) => <p className="mt-2 text-xs leading-5 text-[#fca5a5]" key={`${locale}-${violation.code}`}>{violation.code}: {violation.message}</p>)}</div>)}</div></section>
      </div>

      <section className="mt-5"><h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">Claims used by this feature</h4>{claims.length ? <div className="mt-3 overflow-x-auto" data-horizontal-scroll><table className="w-full min-w-[620px] border-collapse text-left text-sm"><thead><tr className="border-b border-[#26262b] font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#94949c]"><th className="px-2 py-3 font-medium">Claim</th><th className="px-2 py-3 font-medium">Verification</th><th className="px-2 py-3 text-right font-medium">Evidence</th></tr></thead><tbody>{claims.map((claim) => <tr className="border-b border-[#1e1e22]" key={claim.claimId}><td className="px-2 py-3 leading-6">{claim.text}</td><td className="px-2 py-3"><Badge tone={claim.verificationState === "verified" ? "success" : claim.verificationState === "probable" || claim.verificationState === "single-source" ? "warning" : "danger"}>{claim.verificationState}</Badge></td><td className="px-2 py-3 text-right tabular-nums">{claim.sources.length} {claim.sources.length === 1 ? "source" : "sources"}</td></tr>)}</tbody></table></div> : <Callout className="mt-3">No readable dossier claims match this recommendation.</Callout>}</section>

      {feature.designLabStatus === "ready" || feature.designLabStatus === "rendered" ? <Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-[#d7b968] underline underline-offset-4" href="/admin?venture=carousel-studio&tab=studio">Open both locale records in Design Lab →</Link> : null}

      <section className="mt-5 rounded-[10px] border border-[#26262b] bg-[#101013] p-4"><h4 className="text-lg font-semibold">Owner decision</h4><p className="mt-1 text-sm leading-6 text-[#a1a1aa]">These controls save a decision or an owner-supplied record. They never post, open an account, or touch a social channel.</p>{feature.status === "draft" ? <><div className="mt-4 flex flex-wrap gap-2"><Button disabled={pending || !writesEnabled || !canApprove} onClick={() => act("approve")}>Approve both languages</Button><Button disabled={pending || !writesEnabled} onClick={() => setEditing((current) => !current)} variant="secondary">{editing ? "Cancel editing" : "Edit both packages"}</Button></div><label className="mt-4 block text-xs text-[#94949c]">Reason for edit or rejection<textarea className="mt-2 min-h-24 w-full rounded-[8px] border border-[#3f3f46] bg-[#0c0c0f] p-3 text-sm text-white" maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} /></label><div className="mt-3 flex flex-wrap gap-2">{editing ? <Button disabled={pending || !writesEnabled || !canApprove || !reason.trim()} onClick={() => act("edit-approve", { reason: reason.trim(), payloads: editPayloads })}>Save edits and approve</Button> : null}<Button disabled={pending || !writesEnabled || !reason.trim()} onClick={() => act("reject", { reason: reason.trim() })} variant="secondary">Reject with reason</Button></div></> : null}
        {canRecordOutcomes ? <><div className="mt-5 grid gap-4 border-t border-[#26262b] pt-5 xl:grid-cols-2">{locales.map((locale) => <div className="grid gap-3" key={locale}><h5 className="font-semibold">{localeName[locale]} posting record</h5><label className="text-xs text-[#94949c]">URL after you post it<input className="mt-2 min-h-11 w-full rounded-[8px] border border-[#3f3f46] bg-[#0c0c0f] px-3 text-sm text-white" onChange={(event) => setPostedUrls((current) => ({ ...current, [locale]: event.target.value }))} placeholder="https://…" type="url" value={postedUrls[locale] ?? ""} /></label><Button disabled={pending || !writesEnabled || !postedUrls[locale]} onClick={() => act("posted", { locale, url: postedUrls[locale] })} variant="secondary">Record owner-posted URL</Button>{feature.postedUrls[locale] ? <p className="break-all text-xs text-[#a1a1aa]">Recorded: {feature.postedUrls[locale]}</p> : null}</div>)}</div><div className="mt-4 grid gap-4 xl:grid-cols-2">{locales.map((locale) => <OwnerResultLane feature={feature} key={locale} locale={locale} writesEnabled={writesEnabled} />)}</div></> : null}
        <div aria-live="polite" className="mt-3 min-h-5 text-sm" role={error ? "alert" : "status"}>{error ? <span className="text-[#fca5a5]">{error}</span> : <span className="text-[#a1a1aa]">{message}</span>}</div>
      </section>

      <div className="mt-5"><RatingWidget contentHash={feature.contentHash} initialHistory={feature.ratings} objectId={feature.recommendationId} objectKind="social-variant" ventureId="booksofhistory" /></div>
    </article>
  );
}

export function BooksofhistoryFeaturesPanel({ snapshot }: { snapshot: AdminBooksofhistorySnapshot }) {
  return <Panel note={`${snapshot.features.length} ${snapshot.features.length === 1 ? "recommendation" : "recommendations"}`} title="Feature review">{snapshot.features.length ? <div className="grid gap-4">{snapshot.features.map((feature) => <FeatureReview feature={feature} key={feature.recommendationId} snapshot={snapshot} />)}</div> : <Callout>No feature recommendations are waiting or recorded yet.</Callout>}</Panel>;
}
