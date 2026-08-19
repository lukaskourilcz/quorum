"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CopySocialText } from "./copy-social-text";
import { useAdminWritesEnabled } from "./admin-write-mode";
import { Panel } from "./panel";
import { RatingWidget } from "./rating-widget";
import {
  AdminButton as Button,
  AdminCallout as Callout,
  AdminEntityBadge,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminStateMessage,
  AdminStatusBadge as Badge,
  AdminTextarea,
} from "./admin-primitives";
import type {
  AdminTehdejsiFact,
  AdminTehdejsiFeature,
  AdminTehdejsiShortlistEntry,
  AdminTehdejsiSnapshot
} from "@/lib/admin-tehdejsi-svet";
import type { TehdejsiFeaturePayload } from "@/lib/tehdejsi-feature-model";
import {
  TEHDEJSI_RESULT_METRICS,
  TEHDEJSI_RESULT_PLATFORMS,
  type TehdejsiResultMetric,
  type TehdejsiResultPlatform
} from "@/lib/tehdejsi-result-model";
import { formatDateTime } from "@/lib/utils";

type ReviewMode = "closed" | "edit" | "reject";
type Locale = "cs" | "ua";

const localeName: Record<Locale, string> = { cs: "Czech", ua: "Ukrainian" };
const metricName: Record<TehdejsiResultMetric, string> = {
  sends: "Sends (primary)",
  saves: "Saves (primary)",
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  follows: "Follows",
  linkTaps: "Link taps"
};
function numberLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");
}

function statusTone(status: AdminTehdejsiFeature["status"]): "neutral" | "success" | "destructive" | "warning" {
  if (status === "approved" || status === "posted") return "success";
  if (status === "rejected" || status === "archived") return "destructive";
  return "warning";
}

function sensitivityTone(tier: number): "success" | "warning" | "destructive" {
  return tier === 2 ? "destructive" : tier === 1 ? "warning" : "success";
}

function factPeriod(fact: AdminTehdejsiFact): string {
  return fact.yearFrom === fact.yearTo ? String(fact.yearFrom) : `${fact.yearFrom}–${fact.yearTo}`;
}

function ShortlistRow({ entry, fact }: { entry: AdminTehdejsiShortlistEntry; fact: AdminTehdejsiFact | null }) {
  const factors = [
    ["Askability", entry.factors.askability],
    ["Anniversary", entry.factors.anniversary],
    ["Cultural moment", entry.factors.culturalMoment],
    ["Wartime awareness", entry.factors.wartimeAwareness],
    ["Source confidence", entry.factors.sourceConfidence],
    ["Country balance", entry.factors.countryBalance],
    ["Tier cost", entry.factors.tierCost]
  ] as const;
  return (
    <li className="border-l-2 border-[var(--admin-section-accent)] pl-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
            Rank {entry.rank} · {entry.factId}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--admin-foreground)]">
            {fact?.text ?? "The referenced fact is not available in the readable facts file."}
          </p>
          {fact ? (
            <p className="mt-2 text-xs text-[var(--admin-foreground-muted)]">
              {fact.country.toUpperCase()} · {fact.place ?? "countrywide"} · {factPeriod(fact)} · {fact.kind}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="information">Score {numberLabel(entry.score)}</Badge>
          {fact ? <Badge tone={sensitivityTone(fact.sensitivityTier)}>Tier {fact.sensitivityTier}</Badge> : null}
          {entry.veto ? <Badge tone="destructive">{entry.veto.replaceAll("-", " ")}</Badge> : <Badge tone="success">Eligible</Badge>}
        </div>
      </div>
      <dl className="m-0 mt-3 grid overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] sm:grid-cols-4 lg:grid-cols-7">
        {factors.map(([label, value]) => (
          <div className="border-b border-r border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-2.5" key={label}>
            <dt className="text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{label}</dt>
            <dd className="admin-tabular m-0 mt-1 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">{numberLabel(value)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function ShortlistPanel({ snapshot }: { snapshot: AdminTehdejsiSnapshot }) {
  const facts = new Map((snapshot.facts?.facts ?? []).map((fact) => [fact.id, fact]));
  return (
    <Panel note={snapshot.shortlist ? snapshot.shortlist.date : undefined} title="Ranked shortlist">
      {snapshot.shortlist ? (
        <ol className="grid gap-3">
          {snapshot.shortlist.entries.map((entry) => (
            <ShortlistRow entry={entry} fact={facts.get(entry.factId) ?? null} key={entry.factId} />
          ))}
        </ol>
      ) : (
        <AdminStateMessage state={snapshot.stores.shortlists === "unreadable" ? "malformed" : "initial-empty"}
          title={snapshot.stores.shortlists === "unreadable" ? "No readable Tehdejší svět shortlist is available." : "No shortlist has been recorded yet."} />
      )}
    </Panel>
  );
}

function PackageView({
  editing,
  featureId,
  locale,
  payload,
  setPayload
}: {
  editing: boolean;
  featureId: string;
  locale: Locale;
  payload: TehdejsiFeaturePayload;
  setPayload: React.Dispatch<React.SetStateAction<TehdejsiFeaturePayload>>;
}) {
  const caption = locale === "cs" ? payload.captionCs : payload.captionUa;
  const updateCaption = (value: string) => setPayload((current) => ({
    ...current,
    [locale === "cs" ? "captionCs" : "captionUa"]: value
  }));
  const updateSlide = (index: number, value: string) => setPayload((current) => ({
    ...current,
    slides: current.slides.map((slide, currentIndex) => currentIndex === index ? { ...slide, [locale]: value } : slide)
  }));
  return (
    <section aria-labelledby={`${featureId}-${locale}-package`} className="min-w-0 rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-lg font-semibold" id={`${featureId}-${locale}-package`}>{localeName[locale]} package</h4>
        <AdminEntityBadge>{locale.toUpperCase()}</AdminEntityBadge>
      </div>
      <ol className="m-0 mt-3 grid list-none divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)] p-0">
        {payload.slides.map((slide, index) => (
          <li className="py-3" key={`${locale}-${slide.ordinal}`}>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Slide {slide.ordinal}</p>
            {editing ? (
              <AdminTextarea aria-label={`${localeName[locale]} slide ${slide.ordinal}`} className="mt-2"
                maxLength={400} onChange={(event) => updateSlide(index, event.target.value)} required value={slide[locale]} />
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--admin-foreground)]">{slide[locale]}</p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Caption</p>
          {!editing ? <CopySocialText text={caption} /> : null}
        </div>
        {editing ? (
          <AdminTextarea aria-label={`${localeName[locale]} caption`} className="mt-2 min-h-28" maxLength={2_200}
            onChange={(event) => updateCaption(event.target.value)} required value={caption} />
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--admin-foreground)]">{caption}</p>
        )}
      </div>
    </section>
  );
}

function GateSummary({ feature }: { feature: AdminTehdejsiFeature }) {
  return (
    <section aria-labelledby={`${feature.id}-gates`} className="rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold" id={`${feature.id}-gates`}>Recorded gate state</h4>
        <Badge tone="success">Production gates passed</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--admin-foreground-muted)]">
        The draft store admits only packages that clear its blocking evidence, terminology, copy and safety checks.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div><dt className="text-xs text-[var(--admin-foreground-muted)]">Evidence</dt><dd className="mt-1 text-sm">{feature.factIds.length} fact{feature.factIds.length === 1 ? "" : "s"} · {feature.dossierCount} dossier{feature.dossierCount === 1 ? "" : "s"}</dd></div>
        <div><dt className="text-xs text-[var(--admin-foreground-muted)]">Terminology</dt><dd className="mt-1 text-sm">Checked {formatDateTime(feature.terminologyCheckedAt)}</dd></div>
        <div><dt className="text-xs text-[var(--admin-foreground-muted)]">Design Lab</dt><dd className="mt-1 text-sm">{feature.designLab.ready ? "Ready" : "Waiting for owner approval"}</dd></div>
      </dl>
    </section>
  );
}

function OwnerResultLane({ feature, locale, writesEnabled }: {
  feature: AdminTehdejsiFeature;
  locale: Locale;
  writesEnabled: boolean;
}) {
  const router = useRouter();
  const [platform, setPlatform] = useState<TehdejsiResultPlatform>("instagram");
  const [capturedAt, setCapturedAt] = useState("");
  const [note, setNote] = useState("");
  const [metrics, setMetrics] = useState<Record<TehdejsiResultMetric, string>>(() =>
    Object.fromEntries(TEHDEJSI_RESULT_METRICS.map((metric) => [metric, ""])) as Record<TehdejsiResultMetric, string>
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const postUrl = feature.owner.postedUrls[locale];
  const results = feature.results.filter((result) => result.locale === locale);
  const hasMetric = TEHDEJSI_RESULT_METRICS.some((metric) => metrics[metric].trim() !== "");

  async function recordResult(): Promise<void> {
    if (!writesEnabled || pending || !postUrl || !capturedAt || !hasMetric) return;
    setPending(true);
    setMessage("Saving owner-entered result…");
    setError("");
    try {
      const response = await fetch("/admin/api/tehdejsi-svet/results", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId: feature.id,
          locale,
          platform,
          capturedAt: new Date(capturedAt).toISOString(),
          recordedAt: new Date().toISOString(),
          metrics: Object.fromEntries(TEHDEJSI_RESULT_METRICS.map((metric) => [
            metric,
            metrics[metric].trim() === "" ? null : Number(metrics[metric])
          ])),
          note: note.trim() || null
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Owner result failed with ${response.status}.`);
      setMetrics(Object.fromEntries(TEHDEJSI_RESULT_METRICS.map((metric) => [metric, ""])) as Record<TehdejsiResultMetric, string>);
      setNote("");
      setMessage("Manual result recorded. No platform or analytics service was contacted.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Owner result failed before it was saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4" data-tehdejsi-results={locale}>
      <h5 className="font-semibold">{localeName[locale]} performance</h5>
      <p className="mt-1 text-xs leading-5 text-[var(--admin-foreground-muted)]">
        Manual entry only. Sends and saves are the primary positioning signal; missing remains unknown, never zero.
      </p>
      {postUrl ? (
        <>
          <p className="mt-3 break-all text-xs text-[var(--admin-foreground-muted)]">Recorded post: {postUrl}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <AdminLabel htmlFor={`${feature.id}-${locale}-result-platform`}>Platform</AdminLabel>
              <AdminSelect disabled={pending || !writesEnabled} id={`${feature.id}-${locale}-result-platform`}
                onChange={(event) => setPlatform(event.target.value as TehdejsiResultPlatform)} value={platform}>
                {TEHDEJSI_RESULT_PLATFORMS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </AdminSelect>
            </div>
            <div>
              <AdminLabel htmlFor={`${feature.id}-${locale}-captured-at`}>Metrics captured at</AdminLabel>
              <AdminInput disabled={pending || !writesEnabled} id={`${feature.id}-${locale}-captured-at`}
                onChange={(event) => setCapturedAt(event.target.value)} type="datetime-local" value={capturedAt} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TEHDEJSI_RESULT_METRICS.map((metric) => (
              <div key={metric}>
                <AdminLabel htmlFor={`${feature.id}-${locale}-metric-${metric}`}>{metricName[metric]}</AdminLabel>
                <AdminInput className="admin-tabular" disabled={pending || !writesEnabled} id={`${feature.id}-${locale}-metric-${metric}`} inputMode="numeric" min={0}
                  onChange={(event) => setMetrics((current) => ({ ...current, [metric]: event.target.value }))}
                  step={1} type="number" value={metrics[metric]} />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <AdminLabel htmlFor={`${feature.id}-${locale}-result-note`}>Optional owner note</AdminLabel>
            <AdminTextarea className="min-h-20" disabled={pending || !writesEnabled} id={`${feature.id}-${locale}-result-note`} maxLength={500}
              onChange={(event) => setNote(event.target.value)} value={note} />
          </div>
          <Button className="mt-3" disabled={pending || !writesEnabled || !capturedAt || !hasMetric}
            onClick={() => void recordResult()} type="button" variant="secondary">
            Record manual result
          </Button>
        </>
      ) : <AdminStateMessage className="mt-3" state="held" title="Record this locale’s owner-posted URL before entering results." />}
      {results.length ? (
        <div className="mt-4 grid gap-3">
          {results.map((result) => (
            <article className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3" key={result.resultId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AdminEntityBadge>{result.platform}</AdminEntityBadge>
                <time className="font-mono text-[0.625rem] text-[var(--admin-foreground-muted)]" dateTime={result.capturedAt}>{formatDateTime(result.capturedAt)}</time>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {TEHDEJSI_RESULT_METRICS.filter((metric) => result.metrics[metric] !== null).map((metric) => (
                  <div key={metric}><dt className="text-[var(--admin-foreground-muted)]">{metricName[metric]}</dt><dd className="mt-1 tabular-nums">{result.metrics[metric]}</dd></div>
                ))}
              </dl>
              {result.note ? <p className="mt-3 text-xs leading-5 text-[var(--admin-foreground-muted)]">{result.note}</p> : null}
            </article>
          ))}
        </div>
      ) : <AdminStateMessage className="mt-3" state="initial-empty" title="No owner-entered result for this locale." />}
      <div aria-live="polite" className="mt-2 min-h-5 text-sm" role={error ? "alert" : "status"}>
        {error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}
      </div>
    </section>
  );
}

function FeatureReview({ initial }: { initial: AdminTehdejsiFeature }) {
  const router = useRouter();
  const writesEnabled = useAdminWritesEnabled();
  const [feature] = useState(initial);
  const [payload, setPayload] = useState<TehdejsiFeaturePayload>(() => structuredClone(initial.payload));
  const [mode, setMode] = useState<ReviewMode>("closed");
  const [reason, setReason] = useState("");
  const [reviewComplete, setReviewComplete] = useState(initial.humanReviewedAt !== null);
  const [postedUrls, setPostedUrls] = useState<Record<Locale, string>>({
    cs: initial.owner.postedUrls.cs ?? "",
    ua: initial.owner.postedUrls.ua ?? ""
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const needsReview = feature.humanReviewRequired && feature.humanReviewedAt === null;
  const canApprove = writesEnabled && !pending && (!feature.humanReviewRequired || reviewComplete);
  const canRecordPosting = feature.status === "approved" || feature.status === "posted";

  async function act(action: "approve" | "edit-approve" | "reject" | "posted", extra: Record<string, unknown> = {}): Promise<void> {
    if (!writesEnabled || pending) return;
    setPending(true);
    setMessage("Saving owner record…");
    setError("");
    try {
      const response = await fetch("/admin/api/tehdejsi-svet/features", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          recommendationId: feature.id,
          idempotencyKey: `${action}-${Date.now()}-${crypto.randomUUID()}`,
          at: new Date().toISOString(),
          ...extra
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Feature action failed with ${response.status}.`);
      setMode("closed");
      setReason("");
      setMessage(action === "posted"
        ? "Owner-posted URL recorded. No platform was contacted."
        : action === "reject"
          ? "Rejection recorded."
          : "Approval recorded. The package is ready for manual posting; nothing was published.");
      router.refresh();
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The owner record was not saved.");
    } finally {
      setPending(false);
    }
  }

  const reviewField = feature.humanReviewRequired && reviewComplete ? { humanReviewCompleted: true } : {};
  return (
    <article className="scroll-mt-6 rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-5" id={`tehdejsi-feature-${feature.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">{feature.date} · {feature.id}</p>
          <h3 className="mt-2 text-xl font-semibold">{feature.payload.slides[0]?.cs}</h3>
          <p className="mt-2 text-xs text-[var(--admin-foreground-muted)]">Facts: {feature.factIds.join(", ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(feature.status)}>{feature.status}</Badge>
          <Badge tone={sensitivityTone(feature.sensitivityTier)}>Sensitivity tier {feature.sensitivityTier}</Badge>
          {needsReview ? <Badge tone="destructive">Owner review required</Badge> : null}
        </div>
      </header>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <PackageView editing={mode === "edit"} featureId={feature.id} locale="cs" payload={payload} setPayload={setPayload} />
        <PackageView editing={mode === "edit"} featureId={feature.id} locale="ua" payload={payload} setPayload={setPayload} />
      </div>

      <div className="mt-5"><GateSummary feature={feature} /></div>

      {feature.designLab.ready ? (
        <Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-[var(--admin-section-accent)] underline underline-offset-4"
          href="/admin?venture=carousel-studio&tab=studio&brand=tehdejsi-svet">
          Open the recorded package in Design Lab for PNG and ZIP export →
        </Link>
      ) : null}

      <section aria-label="Owner decision" className="mt-5 border-t border-[var(--admin-border)] pt-4">
        <h4 className="text-lg font-semibold">Owner decision</h4>
        <p className="mt-1 text-sm leading-6 text-[var(--admin-foreground-muted)]">
          These controls save review state only. They cannot post, create an account, open a channel, or contact anyone.
        </p>
        {feature.status === "draft" ? (
          <div className="mt-4 grid gap-4">
            {needsReview ? (
              <label className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-destructive)] bg-[var(--admin-destructive-soft)] p-4 text-sm leading-6">
                <input checked={reviewComplete} className="mt-1 size-4" disabled={pending || !writesEnabled}
                  onChange={(event) => setReviewComplete(event.target.checked)} type="checkbox" />
                <span><strong>Confirm tier-2 review.</strong> I checked the sensitive context, sources and participation-CTA restriction.</span>
              </label>
            ) : null}
            {mode === "closed" ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={!canApprove} onClick={() => void act("approve", reviewField)}>Approve for manual posting</Button>
                <Button disabled={pending || !writesEnabled} onClick={() => setMode("edit")} variant="secondary">Edit and approve</Button>
                <Button disabled={pending || !writesEnabled} onClick={() => setMode("reject")} variant="destructive">Reject</Button>
              </div>
            ) : (
              <>
                <div>
                  <AdminLabel htmlFor={`${feature.id}-decision-reason`}>Reason for this {mode === "edit" ? "edit" : "rejection"}</AdminLabel>
                  <AdminTextarea disabled={pending || !writesEnabled} id={`${feature.id}-decision-reason`} maxLength={mode === "edit" ? 500 : 1_000}
                    onChange={(event) => setReason(event.target.value)} required value={reason} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {mode === "edit" ? (
                    <Button disabled={!canApprove || !reason.trim() || payload.slides.some(({ cs, ua }) => !cs.trim() || !ua.trim()) || !payload.captionCs.trim() || !payload.captionUa.trim()}
                      onClick={() => void act("edit-approve", { reason: reason.trim(), payload, ...reviewField })}>Save edits and approve</Button>
                  ) : (
                    <Button disabled={pending || !writesEnabled || !reason.trim()}
                      onClick={() => void act("reject", { reason: reason.trim() })} variant="destructive">Reject with reason</Button>
                  )}
                  <Button disabled={pending} onClick={() => { setMode("closed"); setPayload(structuredClone(feature.payload)); setReason(""); }} variant="ghost">Cancel</Button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {canRecordPosting ? (
          <div className="mt-5 grid gap-4 border-t border-[var(--admin-border)] pt-5 xl:grid-cols-2">
            {(["cs", "ua"] as const).map((locale) => (
              <form className="grid gap-3" key={locale} onSubmit={(event) => {
                event.preventDefault();
                void act("posted", { locale, url: postedUrls[locale].trim() });
              }}>
                <div>
                  <AdminLabel htmlFor={`${feature.id}-${locale}-posted`}>{localeName[locale]} URL after you post it by hand</AdminLabel>
                  <AdminInput disabled={pending || !writesEnabled} id={`${feature.id}-${locale}-posted`} maxLength={2_000}
                    onChange={(event) => setPostedUrls((current) => ({ ...current, [locale]: event.target.value }))}
                    placeholder="https://…" required type="url" value={postedUrls[locale]} />
                </div>
                <Button className="justify-self-start" disabled={pending || !writesEnabled || !postedUrls[locale].trim()} type="submit" variant="secondary">
                  Record {locale.toUpperCase()} posted URL
                </Button>
                {feature.owner.postedUrls[locale] ? <p className="break-all text-xs text-[var(--admin-foreground-muted)]">Recorded: {feature.owner.postedUrls[locale]}</p> : null}
              </form>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {(["cs", "ua"] as const).map((locale) => (
            <OwnerResultLane feature={feature} key={locale} locale={locale} writesEnabled={writesEnabled} />
          ))}
        </div>
        <div aria-live="polite" className="mt-3 min-h-5 text-sm" role={error ? "alert" : "status"}>
          {error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}
        </div>
      </section>

      <div className="mt-5">
        <RatingWidget contentHash={feature.contentHash} initialHistory={feature.ratings}
          objectId={feature.id} objectKind="recommendation" ventureId="tehdejsi-svet" />
      </div>
    </article>
  );
}

function WaitingOnOwner({ features }: { features: AdminTehdejsiFeature[] }) {
  const waiting = features.filter((feature) => feature.status === "draft" && feature.humanReviewRequired && feature.humanReviewedAt === null);
  return (
    <Panel note={`${waiting.length} blocking`} title="What’s waiting on you">
      {waiting.length ? (
        <ul className="grid gap-3">
          {waiting.map((feature) => (
            <li className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-destructive)] bg-[var(--admin-destructive-soft)] p-4" key={feature.id}>
              <div><p className="font-semibold">Tier-2 review · {feature.payload.slides[0]?.cs}</p><p className="mt-1 text-xs text-[var(--admin-foreground-muted)]">{feature.id} · {feature.factIds.join(", ")}</p></div>
              <a className="font-semibold text-[var(--admin-destructive)] underline underline-offset-4" href={`#tehdejsi-feature-${feature.id}`}>Review package</a>
            </li>
          ))}
        </ul>
      ) : <AdminStateMessage state="initial-empty" title="No tier-2 package is waiting for owner review." />}
    </Panel>
  );
}

export function TehdejsiSvetFeaturesPanel({ snapshot }: { snapshot: AdminTehdejsiSnapshot }) {
  return (
    <div className="grid gap-5">
      {snapshot.unreadable.total > 0 ? (
        <Callout tone="warning">{snapshot.unreadable.total} Tehdejší svět record{snapshot.unreadable.total === 1 ? "" : "s"} could not be read and was omitted.</Callout>
      ) : null}
      <ShortlistPanel snapshot={snapshot} />
      <WaitingOnOwner features={snapshot.features} />
      <Panel note={`${snapshot.features.length} ${snapshot.features.length === 1 ? "package" : "packages"}`} title="Feature review">
        {snapshot.features.length ? (
          <div className="grid gap-5">{snapshot.features.map((feature) => <FeatureReview initial={feature} key={feature.id} />)}</div>
        ) : (
          <AdminStateMessage state={snapshot.stores.features === "unreadable" ? "malformed" : "initial-empty"}
            title={snapshot.stores.features === "unreadable" ? "No readable feature package is available." : "No feature package is waiting or recorded yet."} />
        )}
      </Panel>
    </div>
  );
}
