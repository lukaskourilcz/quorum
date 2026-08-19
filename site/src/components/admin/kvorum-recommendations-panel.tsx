"use client";

import { useState } from "react";
import { RatingWidget } from "@/components/admin/rating-widget";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton,
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminEntityBadge,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminStateMessage,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion,
  AdminTextarea,
} from "./admin-primitives";
import type {
  AdminKvorumCopyBlock,
  AdminKvorumDraftText,
  AdminKvorumOwnerResult,
  AdminKvorumRecommendation,
  AdminKvorumSnapshot
} from "@/lib/admin-kvorum";

type EditableDraft = Omit<AdminKvorumDraftText, "capturedAt">;

const STATUS_LABEL: Record<AdminKvorumRecommendation["status"], string> = {
  draft: "Waiting for owner",
  approved: "Approved · Design Lab queued",
  posted: "Posted manually",
  archived: "Archived",
  rejected: "Rejected"
};

function statusTone(status: AdminKvorumRecommendation["status"]): "warning" | "information" | "success" | "neutral" | "destructive" {
  if (status === "draft") return "warning";
  if (status === "approved") return "information";
  if (status === "posted") return "success";
  if (status === "rejected") return "destructive";
  return "neutral";
}

const TEXT_FIELDS = [
  ["headline", "Hook"],
  ["summary", "What happened"],
  ["whyItMatters", "Why it matters"],
  ["whyThisIsWorthIt", "TRIBUN · why this is worth it"],
  ["ourAngle", "Our angle"],
  ["ourAngleDiffers", "How our angle differs"]
] as const;

const RESULT_METRICS = [
  ["impressions", "Impressions"],
  ["reach", "Reach"],
  ["saves", "Saves"],
  ["shares", "Shares"],
  ["comments", "Comments"],
  ["follows", "Follows"]
] as const;
type ResultMetric = typeof RESULT_METRICS[number][0];

function resultTime(value: string): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Prague"
  }).format(new Date(value));
}

export function kvorumRecommendationActionRef(
  recommendation: Pick<AdminKvorumRecommendation, "date" | "slug">
): string {
  return `state/ventures/kvorum/recommendations/${recommendation.date}-${recommendation.slug}.json`;
}

function editableDraft(recommendation: AdminKvorumRecommendation): EditableDraft {
  return {
    headline: recommendation.headline,
    summary: recommendation.summary,
    whyItMatters: recommendation.whyItMatters,
    whyThisIsWorthIt: recommendation.whyThisIsWorthIt,
    ourAngle: recommendation.ourAngle,
    ourAngleDiffers: recommendation.ourAngleDiffers,
    platforms: [...recommendation.platforms],
    formats: [...recommendation.formats],
    copyBlocks: recommendation.copyBlocks.map((block) => ({ ...block }))
  };
}

function approvalEdits(
  original: AdminKvorumRecommendation,
  draft: EditableDraft
): Record<string, unknown> | undefined {
  const edits: Record<string, unknown> = {};
  for (const [field] of TEXT_FIELDS) {
    if (draft[field].trim() !== original[field]) edits[field] = draft[field].trim();
  }
  const copyBlocks = draft.copyBlocks.flatMap((block) => {
    const before = original.copyBlocks.find((candidate) => candidate.id === block.id);
    if (!before) return [];
    const patch: Record<string, unknown> = { id: block.id };
    if (block.text.trim() !== before.text) patch.text = block.text.trim();
    if ((block.altText?.trim() || null) !== before.altText) patch.altText = block.altText?.trim() || null;
    if (block.reason.trim() !== before.reason) patch.reason = block.reason.trim();
    return Object.keys(patch).length > 1 ? [patch] : [];
  });
  if (copyBlocks.length > 0) edits.copyBlocks = copyBlocks;
  return Object.keys(edits).length > 0 ? edits : undefined;
}

function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "pass" | "fail" }) {
  if (tone === "pass") return <AdminStatusBadge tone="success">{children}</AdminStatusBadge>;
  if (tone === "fail") return <AdminStatusBadge tone="destructive">{children}</AdminStatusBadge>;
  return <AdminEntityBadge>{children}</AdminEntityBadge>;
}

function CopyRail({ blocks }: { blocks: AdminKvorumCopyBlock[] }) {
  return (
    <div className="overflow-x-auto pb-2" data-horizontal-scroll>
      <div className="flex min-w-max gap-3">
        {blocks.map((block) => (
          <AdminCard className="w-[min(78vw,380px)]" key={block.id}>
            <AdminCardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{block.platform}</Chip>
              <Chip>{block.format}</Chip>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--admin-foreground-subtle)]">{block.locale}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-[1.65] text-[var(--admin-foreground)]">{block.text}</p>
            {block.altText ? (
              <p className="mt-3 border-t border-[var(--admin-border)] pt-3 text-[11.5px] leading-[1.55] text-[var(--admin-foreground-muted)]">
                <strong className="text-[var(--admin-foreground)]">Alt:</strong> {block.altText}
              </p>
            ) : null}
            <p className="mt-2 text-[11.5px] leading-[1.55] text-[var(--admin-foreground-subtle)]">{block.reason}</p>
            </AdminCardContent>
          </AdminCard>
        ))}
      </div>
    </div>
  );
}

function ClaimsTable({ recommendation }: { recommendation: AdminKvorumRecommendation }) {
  return (
    <AdminTableRegion label="Kvórum typed claims">
      <AdminTable className="min-w-[47.5rem]">
        <thead>
          <tr>
            <AdminTableHead>Type</AdminTableHead>
            <AdminTableHead>Claim</AdminTableHead>
            <AdminTableHead>Sources</AdminTableHead>
          </tr>
        </thead>
        <tbody>
          {recommendation.evidence.claims.map((claim) => (
            <tr className="align-top" key={claim.id}>
              <AdminTableCell><Chip>{claim.type}</Chip></AdminTableCell>
              <AdminTableCell className="max-w-md leading-5">{claim.text}</AdminTableCell>
              <AdminTableCell>
                <ul className="grid gap-1.5">
                  {claim.sources.map((source) => (
                    <li key={`${claim.id}-${source.sourceId}-${source.url}`}>
                      <a
                        className="admin-focus-ring rounded-[var(--admin-radius-sm)] text-[var(--admin-link)] underline underline-offset-2"
                        href={source.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source.sourceName}
                      </a>
                      {source.discoveryOnly ? (
                        <AdminStatusBadge className="ml-2" tone="warning">Context only</AdminStatusBadge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </AdminTableCell>
            </tr>
          ))}
        </tbody>
      </AdminTable>
    </AdminTableRegion>
  );
}

function DraftEditor({
  disabled,
  draft,
  onChange
}: {
  disabled: boolean;
  draft: EditableDraft;
  onChange: (draft: EditableDraft) => void;
}) {
  function copyChange(id: string, patch: Partial<AdminKvorumCopyBlock>) {
    onChange({
      ...draft,
      copyBlocks: draft.copyBlocks.map((block) => block.id === id ? { ...block, ...patch } : block)
    });
  }
  return (
    <AdminCallout className="grid gap-4" tone="warning">
      <p className="text-[12px] leading-[1.55] text-[var(--admin-foreground)]">
        Saving approves these words and preserves the complete desk draft beside them. It does not publish.
      </p>
      <div className="grid gap-3 xl:grid-cols-2">
        {TEXT_FIELDS.map(([field, label]) => (
          <div key={field}>
            <AdminLabel htmlFor={`kvorum-edit-${field}`}>{label}</AdminLabel>
            <AdminTextarea
              disabled={disabled}
              id={`kvorum-edit-${field}`}
              maxLength={field === "headline" ? 240 : field === "whyThisIsWorthIt" ? 1_000 : 2_000}
              onChange={(event) => onChange({ ...draft, [field]: event.target.value })}
              value={draft[field]}
            />
          </div>
        ))}
      </div>
      {draft.copyBlocks.map((block) => (
        <fieldset className="grid gap-2 rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3" key={block.id}>
          <legend className="px-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
            {block.platform} · {block.format}
          </legend>
          <AdminTextarea
            aria-label={`${block.platform} ${block.format} copy`}
            className="min-h-28"
            disabled={disabled}
            maxLength={12_000}
            onChange={(event) => copyChange(block.id, { text: event.target.value })}
            value={block.text}
          />
          <AdminInput
            aria-label={`${block.platform} ${block.format} alt text`}
            disabled={disabled}
            maxLength={2_000}
            onChange={(event) => copyChange(block.id, { altText: event.target.value || null })}
            placeholder="Alt text (optional)"
            value={block.altText ?? ""}
          />
          <AdminInput
            aria-label={`${block.platform} ${block.format} reason`}
            disabled={disabled}
            maxLength={800}
            onChange={(event) => copyChange(block.id, { reason: event.target.value })}
            value={block.reason}
          />
        </fieldset>
      ))}
    </AdminCallout>
  );
}

function RecommendationCard({ recommendation }: { recommendation: AdminKvorumRecommendation }) {
  const writesEnabled = useAdminWritesEnabled();
  const [draft, setDraft] = useState(() => editableDraft(recommendation));
  const [display, setDisplay] = useState(() => editableDraft(recommendation));
  const [status, setStatus] = useState(recommendation.status);
  const [mode, setMode] = useState<"idle" | "edit" | "reject">("idle");
  const [rejectionReason, setRejectionReason] = useState("");
  const [postedUrl, setPostedUrl] = useState(recommendation.owner.postedUrl ?? "");
  const [results, setResults] = useState(recommendation.results);
  const [resultPlatform, setResultPlatform] = useState(recommendation.platforms[0] ?? "");
  const [capturedAt, setCapturedAt] = useState("");
  const [resultMetrics, setResultMetrics] = useState<Record<ResultMetric, string>>({
    impressions: "",
    reach: "",
    saves: "",
    shares: "",
    comments: "",
    follows: ""
  });
  const [resultNote, setResultNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(body: Record<string, unknown>, next: AdminKvorumRecommendation["status"]): Promise<boolean> {
    if (!writesEnabled || busy) return false;
    setBusy(true);
    setMessage("Saving the owner decision…");
    setError("");
    try {
      const response = await fetch("/admin/api/kvorum/recommendations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ref: kvorumRecommendationActionRef(recommendation) })
      });
      const payload = await response.json() as { error?: string; status?: AdminKvorumRecommendation["status"] };
      if (!response.ok || payload.status !== next) throw new Error(payload.error ?? `Owner action failed with ${response.status}.`);
      setStatus(next);
      setMode("idle");
      setMessage(next === "approved"
        ? "Approved and queued in the Design Lab. Nothing was published."
        : next === "posted"
          ? "The manual post URL is recorded. No metrics were fetched."
          : "Rejected with the owner reason recorded.");
      return true;
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The owner action was not saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function approve(withEdits: boolean): Promise<void> {
    const edits = withEdits ? approvalEdits(recommendation, draft) : undefined;
    const saved = await save({ action: "approve", ...(edits ? { edits } : {}) }, "approved");
    if (saved && withEdits) setDisplay(draft);
  }

  async function saveResult(): Promise<void> {
    if (!writesEnabled || busy || !capturedAt || !resultPlatform) return;
    let captured: string;
    try {
      captured = new Date(capturedAt).toISOString();
    } catch {
      setError("Enter a valid result capture time.");
      return;
    }
    const metrics = Object.fromEntries(RESULT_METRICS.map(([key]) => [
      key,
      resultMetrics[key] === "" ? null : Number(resultMetrics[key])
    ])) as AdminKvorumOwnerResult["metrics"];
    setBusy(true);
    setMessage("Saving the owner-entered result…");
    setError("");
    try {
      const response = await fetch("/admin/api/kvorum/results", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationRef: kvorumRecommendationActionRef(recommendation),
          platform: resultPlatform,
          capturedAt: captured,
          metrics,
          note: resultNote.trim() || null
        })
      });
      const payload = await response.json() as { error?: string; result?: AdminKvorumOwnerResult };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? `Owner result failed with ${response.status}.`);
      const savedResult = payload.result;
      setResults((current) => [
        savedResult,
        ...current.filter((entry) => entry.id !== savedResult.id)
      ].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt) || left.id.localeCompare(right.id)));
      setResultMetrics({ impressions: "", reach: "", saves: "", shares: "", comments: "", follows: "" });
      setResultNote("");
      setMessage("Owner-entered result recorded. No metrics were fetched and nothing was published.");
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The owner-entered result was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard>
      <AdminCardHeader className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Kvórum recommendation</span>
            <AdminEntityBadge>{recommendation.date}</AdminEntityBadge>
          </div>
          <h3 className="m-0 mt-2 text-[length:var(--admin-type-page)] font-semibold leading-tight">{display.headline}</h3>
          <p className="m-0 mt-2 max-w-3xl text-[length:var(--admin-type-body)] leading-6 text-[var(--admin-foreground-muted)]">{display.summary}</p>
        </div>
        <AdminStatusBadge className="justify-self-start" tone={statusTone(status)}>{STATUS_LABEL[status]}</AdminStatusBadge>
      </AdminCardHeader>

      <AdminCardContent className="grid gap-5">
        <section aria-labelledby={`${recommendation.id}-copy`} className="grid min-w-0 gap-3">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-foreground-subtle)]" id={`${recommendation.id}-copy`}>
            Drafted copy by format
          </h4>
          <CopyRail blocks={display.copyBlocks} />
          <div className="flex flex-wrap gap-2">
            {display.platforms.map((platform) => <Chip key={`platform-${platform}`}>{platform}</Chip>)}
            {display.formats.map((format) => <Chip key={`format-${format}`}>{format}</Chip>)}
          </div>
        </section>

        <section aria-labelledby={`${recommendation.id}-claims`} className="grid min-w-0 gap-3">
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-foreground-subtle)]" id={`${recommendation.id}-claims`}>
              What happened · typed claims
            </h4>
            <p className="mt-1 text-[11.5px] text-[var(--admin-foreground-subtle)]">Every source link comes from the retained monitor cluster.</p>
          </div>
          <ClaimsTable recommendation={recommendation} />
        </section>

        {recommendation.evidence.stit ? (
          <section className="rounded-[var(--admin-radius-lg)] border border-[var(--admin-risk)] bg-[var(--admin-risk-soft)] p-3.5">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-risk)]">Štít · internal context only</h4>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[var(--admin-foreground)]">{recommendation.evidence.stit.summary}</p>
            <div className="mt-3 grid gap-2">
              {recommendation.evidence.stit.posts.map((post) => (
                <div className="rounded-[var(--admin-radius)] border border-[var(--admin-risk)] bg-[var(--admin-risk-soft)] p-2.5" key={post.postUrl}>
                  <a className="text-[12px] text-[var(--admin-risk)] underline" href={post.postUrl} rel="noreferrer" target="_blank">
                    Open the original Štít post
                  </a>
                  <p className="mt-2 text-[12px] leading-[1.55] text-[var(--admin-foreground)]">{post.excerpt}</p>
                  <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--admin-foreground-muted)]">
                    Likes {post.engagement.likes ?? "—"} · comments {post.engagement.comments ?? "—"} · shares {post.engagement.shares ?? "—"}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.5] text-[var(--admin-risk)]">
              Discovery and comparison only. Štít never supports a factual claim and its wording is not public Kvórum copy.
            </p>
          </section>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-3">
          <section className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
            <h4 className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--admin-foreground-subtle)]">Why it matters</h4>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[var(--admin-foreground)]">{display.whyItMatters}</p>
          </section>
          <section className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
            <h4 className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--admin-foreground-subtle)]">Our angle</h4>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[var(--admin-foreground)]">{display.ourAngle}</p>
            <p className="mt-2 text-[11.5px] leading-[1.55] text-[var(--admin-foreground-subtle)]">{display.ourAngleDiffers}</p>
          </section>
          <section className="rounded-[var(--admin-radius)] border border-[var(--admin-warning)] bg-[var(--admin-warning-soft)] p-3">
            <h4 className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">TRIBUN · why this is worth it</h4>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[var(--admin-foreground)]">{display.whyThisIsWorthIt}</p>
          </section>
        </div>

        <section className="grid gap-2">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-foreground-subtle)]">Gate results</h4>
          <ul className="grid gap-2">
            {recommendation.gates.results.map((gate) => (
              <li className="flex flex-wrap items-start gap-2 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-2.5" key={gate.gate}>
                <Chip tone={gate.verdict}>{gate.verdict}</Chip>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--admin-foreground)]">{gate.gate}</p>
                  <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--admin-foreground-subtle)]">{gate.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {status === "draft" && mode === "edit" ? (
          <DraftEditor disabled={busy || !writesEnabled} draft={draft} onChange={setDraft} />
        ) : null}
        {status === "draft" && mode === "reject" ? (
          <AdminCallout tone="destructive">
            <AdminLabel htmlFor={`${recommendation.id}-rejection-reason`}>Required rejection reason</AdminLabel>
            <AdminTextarea
              disabled={busy || !writesEnabled}
              id={`${recommendation.id}-rejection-reason`}
              maxLength={800}
              onChange={(event) => setRejectionReason(event.target.value)}
              value={rejectionReason}
            />
          </AdminCallout>
        ) : null}

        {status === "draft" ? (
          <div className="flex flex-wrap gap-2 border-t border-[var(--admin-border)] pt-4">
            {mode === "idle" ? (
              <>
                <AdminButton disabled={busy || !writesEnabled} onClick={() => void approve(false)} variant="primary">
                  Approve as drafted
                </AdminButton>
                <AdminButton disabled={busy || !writesEnabled} onClick={() => setMode("edit")}>
                  Edit then approve
                </AdminButton>
                <AdminButton disabled={busy || !writesEnabled} onClick={() => setMode("reject")} variant="destructive">
                  Reject
                </AdminButton>
              </>
            ) : mode === "edit" ? (
              <>
                <AdminButton disabled={busy || !writesEnabled} onClick={() => void approve(true)} variant="primary">
                  Save edits and approve
                </AdminButton>
                <AdminButton disabled={busy} onClick={() => { setDraft(editableDraft(recommendation)); setMode("idle"); }}>Cancel</AdminButton>
              </>
            ) : (
              <>
                <AdminButton
                  disabled={busy || !writesEnabled || rejectionReason.trim().length === 0}
                  onClick={() => void save({ action: "reject", reason: rejectionReason.trim() }, "rejected")}
                  variant="destructive"
                >
                  Record rejection
                </AdminButton>
                <AdminButton disabled={busy} onClick={() => setMode("idle")}>Cancel</AdminButton>
              </>
            )}
          </div>
        ) : null}

        {status === "approved" ? (
          <section className="grid gap-2 border-t border-[var(--admin-border)] pt-4">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-foreground-subtle)]">Manual post record</h4>
            <p className="text-[11.5px] leading-[1.5] text-[var(--admin-foreground-subtle)]">This records a URL only. It cannot publish, create an account or touch a channel.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AdminInput
                aria-label="Manually posted HTTPS URL"
                disabled={busy || !writesEnabled}
                onChange={(event) => setPostedUrl(event.target.value)}
                placeholder="https://…"
                type="url"
                value={postedUrl}
              />
              <AdminButton
                className="shrink-0"
                disabled={busy || !writesEnabled || !postedUrl.startsWith("https://")}
                onClick={() => void save({ action: "posted", postedUrl }, "posted")}
                variant="primary"
              >
                Record posted URL
              </AdminButton>
            </div>
          </section>
        ) : null}

        {status === "posted" ? (
          <section className="grid gap-4 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-foreground-subtle)]">Outcome beside intent</h4>
            {postedUrl ? (
              <a className="block break-all text-[12px] text-[var(--admin-link)] underline" href={postedUrl} rel="noreferrer" target="_blank">{postedUrl}</a>
            ) : null}
            {results.length > 0 ? (
              <div className="grid gap-2">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Owner-entered results</p>
                {results.map((result) => (
                  <article className="rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] bg-[var(--admin-surface-secondary)] p-3" key={result.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip>{result.platform}</Chip>
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--admin-foreground-subtle)]">
                        Captured {resultTime(result.capturedAt)}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {RESULT_METRICS.map(([key, label]) => (
                        <div className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-2" key={key}>
                          <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--admin-foreground-subtle)]">{label}</dt>
                          <dd className="mt-1 text-[14px] text-[var(--admin-foreground)]">{result.metrics[key]?.toLocaleString("cs-CZ") ?? "—"}</dd>
                        </div>
                      ))}
                    </dl>
                    {result.note ? <p className="mt-3 text-[11.5px] leading-[1.55] text-[var(--admin-foreground-muted)]">{result.note}</p> : null}
                  </article>
                ))}
              </div>
            ) : <AdminStateMessage state="initial-empty" title="No owner-entered result is stored yet." description="Kvórum never fetches performance automatically." />}
            <div className="grid gap-3 border-t border-[var(--admin-border)] pt-4">
              <div>
                <h5 className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--admin-foreground)]">Record owner result</h5>
                <p className="mt-1 text-[11.5px] leading-[1.55] text-[var(--admin-foreground-subtle)]">
                  Type numbers you copied from the post. No automated collection or fetch runs here.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <AdminLabel htmlFor={`${recommendation.id}-result-platform`}>Platform</AdminLabel>
                  <AdminSelect
                    disabled={busy || !writesEnabled}
                    id={`${recommendation.id}-result-platform`}
                    onChange={(event) => setResultPlatform(event.target.value)}
                    value={resultPlatform}
                  >
                    {recommendation.platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                  </AdminSelect>
                </div>
                <div>
                  <AdminLabel htmlFor={`${recommendation.id}-result-captured`}>Captured at</AdminLabel>
                  <AdminInput
                    disabled={busy || !writesEnabled}
                    id={`${recommendation.id}-result-captured`}
                    onChange={(event) => setCapturedAt(event.target.value)}
                    type="datetime-local"
                    value={capturedAt}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {RESULT_METRICS.map(([key, label]) => (
                  <div key={key}>
                    <AdminLabel htmlFor={`${recommendation.id}-result-${key}`}>{label}</AdminLabel>
                    <AdminInput
                      disabled={busy || !writesEnabled}
                      id={`${recommendation.id}-result-${key}`}
                      inputMode="numeric"
                      min={0}
                      onChange={(event) => setResultMetrics((current) => ({ ...current, [key]: event.target.value }))}
                      step={1}
                      type="number"
                      value={resultMetrics[key]}
                    />
                  </div>
                ))}
              </div>
              <div>
                <AdminLabel htmlFor={`${recommendation.id}-result-note`}>Owner note · optional</AdminLabel>
                <AdminTextarea
                  className="min-h-20"
                  disabled={busy || !writesEnabled}
                  id={`${recommendation.id}-result-note`}
                  maxLength={800}
                  onChange={(event) => setResultNote(event.target.value)}
                  value={resultNote}
                />
              </div>
              <AdminButton
                className="justify-self-start"
                disabled={busy || !writesEnabled || !capturedAt || !resultPlatform
                  || RESULT_METRICS.every(([key]) => resultMetrics[key] === "")}
                onClick={() => void saveResult()}
                variant="primary"
              >
                Record owner result
              </AdminButton>
            </div>
          </section>
        ) : null}

        <div aria-live="polite" className="min-h-5 font-mono text-[10.5px]" role={error ? "alert" : "status"}>
          {error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}
        </div>

        <RatingWidget
          contentHash={recommendation.contentHash}
          initialHistory={recommendation.ratings}
          objectId={recommendation.id}
          objectKind="recommendation"
          ventureId="kvorum"
        />
      </AdminCardContent>
    </AdminCard>
  );
}

export function KvorumRecommendationsPanel({ snapshot }: { snapshot: AdminKvorumSnapshot }) {
  if (snapshot.recommendations.length === 0) {
    const message = snapshot.recommendationsState === "missing"
      ? "The Kvórum desk has not written its first recommendation queue yet."
      : snapshot.recommendationsState === "unreadable"
        ? "Saved Kvórum recommendations exist, but none can be read safely."
        : "The recommendation store exists and its queue is empty.";
    return <AdminStateMessage state={snapshot.recommendationsState === "unreadable" ? "malformed" : "initial-empty"} title={message} />;
  }
  return (
    <div className="grid gap-4">
      {snapshot.unreadable > 0 ? (
        <AdminCallout tone="warning">
          {snapshot.unreadable} Kvórum state {snapshot.unreadable === 1 ? "record was" : "records were"} dropped because they could not be read.
        </AdminCallout>
      ) : null}
      {snapshot.recommendations.map((recommendation) => (
        <RecommendationCard key={recommendation.id} recommendation={recommendation} />
      ))}
    </div>
  );
}
