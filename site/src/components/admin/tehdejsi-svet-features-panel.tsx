"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CopySocialText } from "./copy-social-text";
import { useAdminWritesEnabled } from "./admin-write-mode";
import { Panel } from "./panel";
import { RatingWidget } from "./rating-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type {
  AdminTehdejsiFact,
  AdminTehdejsiFeature,
  AdminTehdejsiShortlistEntry,
  AdminTehdejsiSnapshot
} from "@/lib/admin-tehdejsi-svet";
import type { TehdejsiFeaturePayload } from "@/lib/tehdejsi-feature-model";
import { formatDateTime } from "@/lib/utils";

type ReviewMode = "closed" | "edit" | "reject";
type Locale = "cs" | "ua";

const localeName: Record<Locale, string> = { cs: "Czech", ua: "Ukrainian" };
const fieldClass =
  "w-full rounded-[var(--radius-button)] border border-[var(--steel)] bg-[var(--surface)] px-3 py-2.5 text-base leading-6 text-[var(--foreground)] placeholder:text-[var(--fog)] disabled:opacity-50";

function numberLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");
}

function statusTone(status: AdminTehdejsiFeature["status"]): "neutral" | "success" | "danger" | "warning" {
  if (status === "approved" || status === "posted") return "success";
  if (status === "rejected" || status === "archived") return "danger";
  return "warning";
}

function sensitivityTone(tier: number): "success" | "warning" | "danger" {
  return tier === 2 ? "danger" : tier === 1 ? "warning" : "success";
}

function factPeriod(fact: AdminTehdejsiFact): string {
  return fact.yearFrom === fact.yearTo ? String(fact.yearFrom) : `${fact.yearFrom}–${fact.yearTo}`;
}

function ShortlistRow({ entry, fact }: { entry: AdminTehdejsiShortlistEntry; fact: AdminTehdejsiFact | null }) {
  const factors = [
    ["Askability", entry.factors.askability],
    ["Anniversary", entry.factors.anniversary],
    ["Source confidence", entry.factors.sourceConfidence],
    ["Country balance", entry.factors.countryBalance],
    ["Tier cost", entry.factors.tierCost]
  ] as const;
  return (
    <li className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
            Rank {entry.rank} · {entry.factId}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
            {fact?.text ?? "The referenced fact is not available in the readable facts file."}
          </p>
          {fact ? (
            <p className="mt-2 text-xs text-[var(--fog)]">
              {fact.country.toUpperCase()} · {fact.place ?? "countrywide"} · {factPeriod(fact)} · {fact.kind}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Score {numberLabel(entry.score)}</Badge>
          {fact ? <Badge tone={sensitivityTone(fact.sensitivityTier)}>Tier {fact.sensitivityTier}</Badge> : null}
          {entry.veto ? <Badge tone="danger">{entry.veto.replaceAll("-", " ")}</Badge> : <Badge tone="success">Eligible</Badge>}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {factors.map(([label, value]) => (
          <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-3" key={label}>
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--fog)]">{label}</dt>
            <dd className="mt-1 tabular-nums text-[var(--foreground)]">{numberLabel(value)}</dd>
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
        <Callout tone={snapshot.stores.shortlists === "unreadable" ? "warning" : "neutral"}>
          {snapshot.stores.shortlists === "unreadable"
            ? "No readable Tehdejší svět shortlist is available."
            : "No shortlist has been recorded yet."}
        </Callout>
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
    <section aria-labelledby={`${featureId}-${locale}-package`} className="min-w-0 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-lg font-semibold" id={`${featureId}-${locale}-package`}>{localeName[locale]} package</h4>
        <Badge>{locale.toUpperCase()}</Badge>
      </div>
      <ol className="mt-4 grid gap-3">
        {payload.slides.map((slide, index) => (
          <li className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-3" key={`${locale}-${slide.ordinal}`}>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Slide {slide.ordinal}</p>
            {editing ? (
              <textarea aria-label={`${localeName[locale]} slide ${slide.ordinal}`} className={`${fieldClass} mt-2 min-h-24`}
                maxLength={400} onChange={(event) => updateSlide(index, event.target.value)} required value={slide[locale]} />
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{slide[locale]}</p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-[var(--fog)]">Caption</p>
          {!editing ? <CopySocialText text={caption} /> : null}
        </div>
        {editing ? (
          <textarea aria-label={`${localeName[locale]} caption`} className={`${fieldClass} mt-2 min-h-28`} maxLength={2_200}
            onChange={(event) => updateCaption(event.target.value)} required value={caption} />
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{caption}</p>
        )}
      </div>
    </section>
  );
}

function GateSummary({ feature }: { feature: AdminTehdejsiFeature }) {
  return (
    <section aria-labelledby={`${feature.id}-gates`} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold" id={`${feature.id}-gates`}>Recorded gate state</h4>
        <Badge tone="success">Production gates passed</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--fog)]">
        The draft store admits only packages that clear its blocking evidence, terminology, copy and safety checks.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div><dt className="text-xs text-[var(--fog)]">Evidence</dt><dd className="mt-1 text-sm">{feature.factIds.length} fact{feature.factIds.length === 1 ? "" : "s"} · {feature.dossierCount} dossier{feature.dossierCount === 1 ? "" : "s"}</dd></div>
        <div><dt className="text-xs text-[var(--fog)]">Terminology</dt><dd className="mt-1 text-sm">Checked {formatDateTime(feature.terminologyCheckedAt)}</dd></div>
        <div><dt className="text-xs text-[var(--fog)]">Design Lab</dt><dd className="mt-1 text-sm">{feature.designLab.ready ? "Ready" : "Waiting for owner approval"}</dd></div>
      </dl>
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
    <article className="scroll-mt-6 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5" id={`tehdejsi-feature-${feature.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">{feature.date} · {feature.id}</p>
          <h3 className="mt-2 text-xl font-semibold">{feature.payload.slides[0]?.cs}</h3>
          <p className="mt-2 text-xs text-[var(--fog)]">Facts: {feature.factIds.join(", ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(feature.status)}>{feature.status}</Badge>
          <Badge tone={sensitivityTone(feature.sensitivityTier)}>Sensitivity tier {feature.sensitivityTier}</Badge>
          {needsReview ? <Badge tone="danger">Owner review required</Badge> : null}
        </div>
      </header>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <PackageView editing={mode === "edit"} featureId={feature.id} locale="cs" payload={payload} setPayload={setPayload} />
        <PackageView editing={mode === "edit"} featureId={feature.id} locale="ua" payload={payload} setPayload={setPayload} />
      </div>

      <div className="mt-5"><GateSummary feature={feature} /></div>

      {feature.designLab.ready ? (
        <Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-[var(--accent)] underline underline-offset-4"
          href="/admin?venture=carousel-studio&tab=studio&brand=tehdejsi-svet">
          Open the recorded package in Design Lab for PNG and ZIP export →
        </Link>
      ) : null}

      <section aria-label="Owner decision" className="mt-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <h4 className="text-lg font-semibold">Owner decision</h4>
        <p className="mt-1 text-sm leading-6 text-[var(--fog)]">
          These controls save review state only. They cannot post, create an account, open a channel, or contact anyone.
        </p>
        {feature.status === "draft" ? (
          <div className="mt-4 grid gap-4">
            {needsReview ? (
              <label className="flex items-start gap-3 rounded-[var(--radius-button)] border border-[var(--destructive)] bg-[var(--destructive-soft)] p-4 text-sm leading-6">
                <input checked={reviewComplete} className="mt-1 size-4" disabled={pending || !writesEnabled}
                  onChange={(event) => setReviewComplete(event.target.checked)} type="checkbox" />
                <span><strong>Confirm tier-2 review.</strong> I checked the sensitive context, sources and participation-CTA restriction.</span>
              </label>
            ) : null}
            {mode === "closed" ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={!canApprove} onClick={() => void act("approve", reviewField)}>Approve for manual posting</Button>
                <Button disabled={pending || !writesEnabled} onClick={() => setMode("edit")} variant="secondary">Edit and approve</Button>
                <Button className="border-[var(--destructive)] text-[var(--destructive)]" disabled={pending || !writesEnabled}
                  onClick={() => setMode("reject")} variant="secondary">Reject</Button>
              </div>
            ) : (
              <>
                <label>
                  <span className="font-semibold">Reason for this {mode === "edit" ? "edit" : "rejection"}</span>
                  <textarea className={`${fieldClass} mt-2 min-h-24`} disabled={pending || !writesEnabled} maxLength={mode === "edit" ? 500 : 1_000}
                    onChange={(event) => setReason(event.target.value)} required value={reason} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {mode === "edit" ? (
                    <Button disabled={!canApprove || !reason.trim() || payload.slides.some(({ cs, ua }) => !cs.trim() || !ua.trim()) || !payload.captionCs.trim() || !payload.captionUa.trim()}
                      onClick={() => void act("edit-approve", { reason: reason.trim(), payload, ...reviewField })}>Save edits and approve</Button>
                  ) : (
                    <Button className="border-[var(--destructive)] text-[var(--destructive)]" disabled={pending || !writesEnabled || !reason.trim()}
                      onClick={() => void act("reject", { reason: reason.trim() })} variant="secondary">Reject with reason</Button>
                  )}
                  <Button disabled={pending} onClick={() => { setMode("closed"); setPayload(structuredClone(feature.payload)); setReason(""); }} variant="ghost">Cancel</Button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {canRecordPosting ? (
          <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 xl:grid-cols-2">
            {(["cs", "ua"] as const).map((locale) => (
              <form className="grid gap-3" key={locale} onSubmit={(event) => {
                event.preventDefault();
                void act("posted", { locale, url: postedUrls[locale].trim() });
              }}>
                <label htmlFor={`${feature.id}-${locale}-posted`}>
                  <span className="font-semibold">{localeName[locale]} URL after you post it by hand</span>
                  <input className={`${fieldClass} mt-2`} disabled={pending || !writesEnabled} id={`${feature.id}-${locale}-posted`} maxLength={2_000}
                    onChange={(event) => setPostedUrls((current) => ({ ...current, [locale]: event.target.value }))}
                    placeholder="https://…" required type="url" value={postedUrls[locale]} />
                </label>
                <Button className="justify-self-start" disabled={pending || !writesEnabled || !postedUrls[locale].trim()} type="submit" variant="secondary">
                  Record {locale.toUpperCase()} posted URL
                </Button>
                {feature.owner.postedUrls[locale] ? <p className="break-all text-xs text-[var(--fog)]">Recorded: {feature.owner.postedUrls[locale]}</p> : null}
              </form>
            ))}
          </div>
        ) : null}

        {(feature.owner.postedUrls.cs || feature.owner.postedUrls.ua) ? (
          <Callout className="mt-4">Performance results are not stored yet. This panel will accept owner-entered metrics when the recorded result ledger lands.</Callout>
        ) : null}
        <div aria-live="polite" className="mt-3 min-h-5 text-sm" role={error ? "alert" : "status"}>
          {error ? <span className="text-[var(--destructive)]">{error}</span> : <span className="text-[var(--fog)]">{message}</span>}
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
            <li className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-button)] border border-[var(--destructive)] bg-[var(--destructive-soft)] p-4" key={feature.id}>
              <div><p className="font-semibold">Tier-2 review · {feature.payload.slides[0]?.cs}</p><p className="mt-1 text-xs text-[var(--fog)]">{feature.id} · {feature.factIds.join(", ")}</p></div>
              <a className="font-semibold text-[var(--destructive)] underline underline-offset-4" href={`#tehdejsi-feature-${feature.id}`}>Review package</a>
            </li>
          ))}
        </ul>
      ) : <Callout>No tier-2 package is waiting for owner review.</Callout>}
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
          <Callout tone={snapshot.stores.features === "unreadable" ? "warning" : "neutral"}>
            {snapshot.stores.features === "unreadable" ? "No readable feature package is available." : "No feature package is waiting or recorded yet."}
          </Callout>
        )}
      </Panel>
    </div>
  );
}
