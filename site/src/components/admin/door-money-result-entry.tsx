"use client";

import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton as Button,
  AdminEntityBadge,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminStateMessage,
  AdminTextarea,
} from "./admin-primitives";
import {
  DOOR_MONEY_RESULT_METRICS,
  type DoorMoneyOwnerResult,
  type DoorMoneyOwnerResultInput,
  type DoorMoneyResultMetric,
  type DoorMoneyResultMetrics,
  type DoorMoneyResultPlatform
} from "@/lib/door-money-result-model";

const ENDPOINT = "/admin/api/door-money/results";
const METRIC_LABELS: Record<DoorMoneyResultMetric, string> = {
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  follows: "Follows",
  linkTaps: "Link taps"
};

type MetricInputs = Record<DoorMoneyResultMetric, string>;

const EMPTY_METRICS = Object.fromEntries(
  DOOR_MONEY_RESULT_METRICS.map((metric) => [metric, ""])
) as MetricInputs;

export function doorMoneyOwnerResultEnvelope(input: {
  recommendationId: string;
  platform: DoorMoneyResultPlatform;
  outcome: string;
  metrics: MetricInputs;
}): DoorMoneyOwnerResultInput | null {
  const metrics: DoorMoneyResultMetrics = {};
  for (const metric of DOOR_MONEY_RESULT_METRICS) {
    const raw = input.metrics[metric].trim();
    if (!raw) continue;
    const amount = Number(raw);
    if (!Number.isSafeInteger(amount) || amount < 0) return null;
    metrics[metric] = amount;
  }
  const outcome = input.outcome.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.recommendationId) ||
      input.recommendationId.length > 160 || !outcome || outcome.length > 1_000 ||
      Object.keys(metrics).length === 0) return null;
  return { recommendationId: input.recommendationId, platform: input.platform, metrics, outcome };
}

function ResultRecord({ intent, result }: { intent: string; result: DoorMoneyOwnerResult }) {
  return (
    <li className="border-l-2 border-[var(--admin-section-accent)] pl-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AdminEntityBadge>{result.platform}</AdminEntityBadge>
        <p className="m-0 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{result.capturedAt}</p>
      </div>
      <dl className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <dt className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Intent</dt>
          <dd className="mt-2 text-sm leading-6 text-[var(--admin-foreground-muted)]">{intent}</dd>
        </div>
        <div>
          <dt className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Owner-entered outcome</dt>
          <dd className="mt-2 text-sm leading-6 text-[var(--admin-foreground)]">{result.outcome}</dd>
        </div>
      </dl>
      <dl className="m-0 mt-3 grid overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] sm:grid-cols-2 lg:grid-cols-4">
        {DOOR_MONEY_RESULT_METRICS.flatMap((metric) => result.metrics[metric] === undefined ? [] : [
          <div className="border-b border-r border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] px-3 py-2 last:border-r-0" key={metric}>
            <dt className="text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{METRIC_LABELS[metric]}</dt>
            <dd className="admin-tabular m-0 mt-1 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">{result.metrics[metric]!.toLocaleString("en")}</dd>
          </div>
        ])}
      </dl>
      <p className="mt-3 font-mono text-[0.65625rem] text-[var(--admin-foreground-muted)]">Manual record · {result.id}</p>
    </li>
  );
}

export function DoorMoneyResultEntry({
  recommendationId,
  intent,
  platforms,
  postedUrl,
  initialResults
}: {
  recommendationId: string;
  intent: string;
  platforms: DoorMoneyResultPlatform[];
  postedUrl: string | null;
  initialResults: DoorMoneyOwnerResult[];
}) {
  const writesEnabled = useAdminWritesEnabled();
  const [results, setResults] = useState(initialResults);
  const [platform, setPlatform] = useState<DoorMoneyResultPlatform>(platforms[0] ?? "instagram");
  const [outcome, setOutcome] = useState("");
  const [metrics, setMetrics] = useState<MetricInputs>(EMPTY_METRICS);
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const request = doorMoneyOwnerResultEnvelope({ recommendationId, platform, outcome, metrics });
  const formId = `door-money-result-${recommendationId}`;

  async function save(): Promise<void> {
    if (!writesEnabled || pending || !postedUrl || !request) return;
    setPending(true);
    setMessage("Saving owner-entered result…");
    setError("");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      const payload = await response.json().catch(() => ({})) as { result?: DoorMoneyOwnerResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? `Result save failed with ${response.status}.`);
      setResults((current) => current.some(({ id }) => id === payload.result!.id) ? current : [payload.result!, ...current]);
      setOutcome("");
      setMetrics(EMPTY_METRICS);
      setTouched(false);
      setMessage("Owner result recorded. No platform or analytics service was contacted.");
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The owner result was not saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border-t border-[var(--admin-border)] pt-5" aria-labelledby={`${formId}-heading`}>
      <h4 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]" id={`${formId}-heading`}>Owner results</h4>
      {results.length ? <ul className="mt-3 grid gap-3">{results.map((result) => <ResultRecord intent={intent} key={result.id} result={result} />)}</ul>
        : <AdminStateMessage className="mt-2" state="initial-empty" title="No owner result has been entered for this recommendation." />}

      {!postedUrl ? <AdminStateMessage className="mt-4" state="held" title="Record the manual post URL before adding its result." /> : (
        <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); setTouched(true); void save(); }}>
          <p className="text-sm leading-6 text-[var(--admin-foreground-muted)]">Type only numbers you can see yourself. This form does not collect analytics.</p>
          <div>
            <AdminLabel htmlFor={`${formId}-platform`}>Platform</AdminLabel>
            <AdminSelect disabled={pending || !writesEnabled} id={`${formId}-platform`}
              onChange={(event) => setPlatform(event.target.value as DoorMoneyResultPlatform)} value={platform}>
              {platforms.map((item) => <option key={item} value={item}>{item}</option>)}
            </AdminSelect>
          </div>
          <fieldset>
            <legend className="font-semibold text-[var(--admin-foreground)]">Visible metrics (at least one required)</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DOOR_MONEY_RESULT_METRICS.map((metric) => (
                <div key={metric}>
                  <AdminLabel htmlFor={`${formId}-${metric}`}>{METRIC_LABELS[metric]}</AdminLabel>
                  <AdminInput disabled={pending || !writesEnabled} id={`${formId}-${metric}`}
                    inputMode="numeric" min="0" onChange={(event) => { setMetrics((current) => ({ ...current, [metric]: event.target.value })); setError(""); }}
                    step="1" type="number" value={metrics[metric]} />
                </div>
              ))}
            </div>
          </fieldset>
          <div>
            <AdminLabel htmlFor={`${formId}-outcome`}>Outcome (required)</AdminLabel>
            <AdminTextarea aria-describedby={`${formId}-error`} aria-invalid={touched && !request}
              disabled={pending || !writesEnabled} id={`${formId}-outcome`} maxLength={1_000}
              onChange={(event) => { setOutcome(event.target.value); setError(""); }} required value={outcome} />
          </div>
          <p className="min-h-5 text-xs text-[var(--admin-destructive)]" id={`${formId}-error`}>
            {touched && !request ? "Enter an outcome and at least one whole, nonnegative metric." : ""}
          </p>
          <Button className="justify-self-start" disabled={pending || !writesEnabled || !request} type="submit">
            {pending ? "Saving…" : "Record owner result"}
          </Button>
        </form>
      )}
      <div aria-live="polite" className="mt-3 min-h-5 text-sm" role={error ? "alert" : "status"}>
        {error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}
      </div>
    </section>
  );
}
