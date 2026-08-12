"use client";

import { useState } from "react";
import { RatingWidget } from "@/components/admin/rating-widget";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import type {
  AdminKvorumCopyBlock,
  AdminKvorumDraftText,
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

const TEXT_FIELDS = [
  ["headline", "Hook"],
  ["summary", "What happened"],
  ["whyItMatters", "Why it matters"],
  ["whyThisIsWorthIt", "TRIBUN · why this is worth it"],
  ["ourAngle", "Our angle"],
  ["ourAngleDiffers", "How our angle differs"]
] as const;

const buttonClass =
  "rounded-[8px] border border-[#3f3f46] bg-[#101013] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#d4d4d8] disabled:cursor-not-allowed disabled:opacity-40";
const inputClass =
  "w-full rounded-[8px] border border-[#3f3f46] bg-[#0d0d10] px-3 py-2 text-[13px] leading-[1.55] text-[#f4f4f5] outline-none focus:border-[#f5d90a] disabled:opacity-50";

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
  const colour = tone === "pass" ? "#86efac" : tone === "fail" ? "#f87171" : "#a1a1aa";
  return (
    <span
      className="rounded-full border bg-[#101013] px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em]"
      style={{ borderColor: colour, color: colour }}
    >
      {children}
    </span>
  );
}

function CopyRail({ blocks }: { blocks: AdminKvorumCopyBlock[] }) {
  return (
    <div className="overflow-x-auto pb-2" data-horizontal-scroll>
      <div className="flex min-w-max gap-3">
        {blocks.map((block) => (
          <article className="w-[min(78vw,380px)] rounded-[9px] border border-[#26262b] bg-[#101013] p-3" key={block.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{block.platform}</Chip>
              <Chip>{block.format}</Chip>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#94949c]">{block.locale}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-[1.65] text-[#e4e4e7]">{block.text}</p>
            {block.altText ? (
              <p className="mt-3 border-t border-[#26262b] pt-3 text-[11.5px] leading-[1.55] text-[#a1a1aa]">
                <strong className="text-[#d4d4d8]">Alt:</strong> {block.altText}
              </p>
            ) : null}
            <p className="mt-2 text-[11.5px] leading-[1.55] text-[#94949c]">{block.reason}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ClaimsTable({ recommendation }: { recommendation: AdminKvorumRecommendation }) {
  return (
    <div className="overflow-x-auto" data-horizontal-scroll>
      <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
        <thead className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">
          <tr>
            <th className="border-b border-[#26262b] px-2 py-2 font-medium">Type</th>
            <th className="border-b border-[#26262b] px-2 py-2 font-medium">Claim</th>
            <th className="border-b border-[#26262b] px-2 py-2 font-medium">Sources</th>
          </tr>
        </thead>
        <tbody>
          {recommendation.evidence.claims.map((claim) => (
            <tr className="align-top" key={claim.id}>
              <td className="border-b border-[#1e1e22] px-2 py-3"><Chip>{claim.type}</Chip></td>
              <td className="max-w-md border-b border-[#1e1e22] px-2 py-3 leading-[1.55] text-[#e4e4e7]">{claim.text}</td>
              <td className="border-b border-[#1e1e22] px-2 py-3">
                <ul className="grid gap-1.5">
                  {claim.sources.map((source) => (
                    <li key={`${claim.id}-${source.sourceId}-${source.url}`}>
                      <a
                        className="text-[#f5d90a] underline decoration-[#665f16] underline-offset-2"
                        href={source.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source.sourceName}
                      </a>
                      {source.discoveryOnly ? (
                        <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#f5a524]">context only</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <div className="grid gap-4 rounded-[10px] border border-[#665f16] bg-[#111005] p-3.5">
      <p className="text-[12px] leading-[1.55] text-[#d4d4d8]">
        Saving approves these words and preserves the complete desk draft beside them. It does not publish.
      </p>
      <div className="grid gap-3 xl:grid-cols-2">
        {TEXT_FIELDS.map(([field, label]) => (
          <label className="grid gap-1.5" key={field}>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#a1a1aa]">{label}</span>
            <textarea
              className={`${inputClass} min-h-24`}
              disabled={disabled}
              maxLength={field === "headline" ? 240 : field === "whyThisIsWorthIt" ? 1_000 : 2_000}
              onChange={(event) => onChange({ ...draft, [field]: event.target.value })}
              value={draft[field]}
            />
          </label>
        ))}
      </div>
      {draft.copyBlocks.map((block) => (
        <fieldset className="grid gap-2 rounded-[8px] border border-[#26262b] p-3" key={block.id}>
          <legend className="px-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#a1a1aa]">
            {block.platform} · {block.format}
          </legend>
          <textarea
            aria-label={`${block.platform} ${block.format} copy`}
            className={`${inputClass} min-h-28`}
            disabled={disabled}
            maxLength={12_000}
            onChange={(event) => copyChange(block.id, { text: event.target.value })}
            value={block.text}
          />
          <input
            aria-label={`${block.platform} ${block.format} alt text`}
            className={inputClass}
            disabled={disabled}
            maxLength={2_000}
            onChange={(event) => copyChange(block.id, { altText: event.target.value || null })}
            placeholder="Alt text (optional)"
            value={block.altText ?? ""}
          />
          <input
            aria-label={`${block.platform} ${block.format} reason`}
            className={inputClass}
            disabled={disabled}
            maxLength={800}
            onChange={(event) => copyChange(block.id, { reason: event.target.value })}
            value={block.reason}
          />
        </fieldset>
      ))}
    </div>
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

  return (
    <article className="min-w-0 rounded-[12px] border border-[#26262b] bg-[#0c0c0f]">
      <header className="grid gap-3 border-b border-[#1e1e22] p-[18px] lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#f5d90a]">Kvórum recommendation</span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#94949c]">{recommendation.date}</span>
          </div>
          <h3 className="mt-2 text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-[#f4f4f5]">{display.headline}</h3>
          <p className="mt-3 max-w-3xl text-[13px] leading-[1.65] text-[#a1a1aa]">{display.summary}</p>
        </div>
        <span className="justify-self-start rounded-full border border-[#665f16] bg-[#111005] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#f5d90a]">
          {STATUS_LABEL[status]}
        </span>
      </header>

      <div className="grid gap-6 p-[18px]">
        <section aria-labelledby={`${recommendation.id}-copy`} className="grid min-w-0 gap-3">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]" id={`${recommendation.id}-copy`}>
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
            <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]" id={`${recommendation.id}-claims`}>
              What happened · typed claims
            </h4>
            <p className="mt-1 text-[11.5px] text-[#94949c]">Every source link comes from the retained monitor cluster.</p>
          </div>
          <ClaimsTable recommendation={recommendation} />
        </section>

        {recommendation.evidence.stit ? (
          <section className="rounded-[10px] border border-[#7c2d12] bg-[#160c08] p-3.5">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#fb923c]">Štít · internal context only</h4>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[#d4d4d8]">{recommendation.evidence.stit.summary}</p>
            <div className="mt-3 grid gap-2">
              {recommendation.evidence.stit.posts.map((post) => (
                <div className="rounded-[8px] border border-[#3f2418] bg-[#100907] p-2.5" key={post.postUrl}>
                  <a className="text-[12px] text-[#fb923c] underline" href={post.postUrl} rel="noreferrer" target="_blank">
                    Open the original Štít post
                  </a>
                  <p className="mt-2 text-[12px] leading-[1.55] text-[#d4d4d8]">{post.excerpt}</p>
                  <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#a1a1aa]">
                    Likes {post.engagement.likes ?? "—"} · comments {post.engagement.comments ?? "—"} · shares {post.engagement.shares ?? "—"}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.5] text-[#fb923c]">
              Discovery and comparison only. Štít never supports a factual claim and its wording is not public Kvórum copy.
            </p>
          </section>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-3">
          <section className="rounded-[9px] border border-[#26262b] bg-[#101013] p-3">
            <h4 className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">Why it matters</h4>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[#d4d4d8]">{display.whyItMatters}</p>
          </section>
          <section className="rounded-[9px] border border-[#26262b] bg-[#101013] p-3">
            <h4 className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#94949c]">Our angle</h4>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[#d4d4d8]">{display.ourAngle}</p>
            <p className="mt-2 text-[11.5px] leading-[1.55] text-[#94949c]">{display.ourAngleDiffers}</p>
          </section>
          <section className="rounded-[9px] border border-[#665f16] bg-[#111005] p-3">
            <h4 className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#f5d90a]">TRIBUN · why this is worth it</h4>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[#e4e4e7]">{display.whyThisIsWorthIt}</p>
          </section>
        </div>

        <section className="grid gap-2">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]">Gate results</h4>
          <ul className="grid gap-2">
            {recommendation.gates.results.map((gate) => (
              <li className="flex flex-wrap items-start gap-2 rounded-[8px] border border-[#26262b] bg-[#101013] p-2.5" key={gate.gate}>
                <Chip tone={gate.verdict}>{gate.verdict}</Chip>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#d4d4d8]">{gate.gate}</p>
                  <p className="mt-1 text-[11.5px] leading-[1.5] text-[#94949c]">{gate.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {status === "draft" && mode === "edit" ? (
          <DraftEditor disabled={busy || !writesEnabled} draft={draft} onChange={setDraft} />
        ) : null}
        {status === "draft" && mode === "reject" ? (
          <label className="grid gap-1.5 rounded-[9px] border border-[#7f1d1d] bg-[#150909] p-3">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#f87171]">Required rejection reason</span>
            <textarea
              className={`${inputClass} min-h-24`}
              disabled={busy || !writesEnabled}
              maxLength={800}
              onChange={(event) => setRejectionReason(event.target.value)}
              value={rejectionReason}
            />
          </label>
        ) : null}

        {status === "draft" ? (
          <div className="flex flex-wrap gap-2 border-t border-[#26262b] pt-4">
            {mode === "idle" ? (
              <>
                <button className={`${buttonClass} border-[#665f16] text-[#f5d90a]`} disabled={busy || !writesEnabled} onClick={() => void approve(false)} type="button">
                  Approve as drafted
                </button>
                <button className={buttonClass} disabled={busy || !writesEnabled} onClick={() => setMode("edit")} type="button">
                  Edit then approve
                </button>
                <button className={`${buttonClass} text-[#f87171]`} disabled={busy || !writesEnabled} onClick={() => setMode("reject")} type="button">
                  Reject
                </button>
              </>
            ) : mode === "edit" ? (
              <>
                <button className={`${buttonClass} border-[#665f16] text-[#f5d90a]`} disabled={busy || !writesEnabled} onClick={() => void approve(true)} type="button">
                  Save edits and approve
                </button>
                <button className={buttonClass} disabled={busy} onClick={() => { setDraft(editableDraft(recommendation)); setMode("idle"); }} type="button">Cancel</button>
              </>
            ) : (
              <>
                <button
                  className={`${buttonClass} border-[#7f1d1d] text-[#f87171]`}
                  disabled={busy || !writesEnabled || rejectionReason.trim().length === 0}
                  onClick={() => void save({ action: "reject", reason: rejectionReason.trim() }, "rejected")}
                  type="button"
                >
                  Record rejection
                </button>
                <button className={buttonClass} disabled={busy} onClick={() => setMode("idle")} type="button">Cancel</button>
              </>
            )}
          </div>
        ) : null}

        {status === "approved" ? (
          <section className="grid gap-2 border-t border-[#26262b] pt-4">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]">Manual post record</h4>
            <p className="text-[11.5px] leading-[1.5] text-[#94949c]">This records a URL only. It cannot publish, create an account or touch a channel.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Manually posted HTTPS URL"
                className={inputClass}
                disabled={busy || !writesEnabled}
                onChange={(event) => setPostedUrl(event.target.value)}
                placeholder="https://…"
                type="url"
                value={postedUrl}
              />
              <button
                className={`${buttonClass} shrink-0 border-[#665f16] text-[#f5d90a]`}
                disabled={busy || !writesEnabled || !postedUrl.startsWith("https://")}
                onClick={() => void save({ action: "posted", postedUrl }, "posted")}
                type="button"
              >
                Record posted URL
              </button>
            </div>
          </section>
        ) : null}

        {status === "posted" ? (
          <section className="rounded-[9px] border border-[#26262b] bg-[#101013] p-3">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#94949c]">Outcome beside intent</h4>
            {postedUrl ? (
              <a className="mt-2 block break-all text-[12px] text-[#f5d90a] underline" href={postedUrl} rel="noreferrer" target="_blank">{postedUrl}</a>
            ) : null}
            <p className="mt-2 text-[11.5px] leading-[1.55] text-[#94949c]">
              No owner-entered result is stored yet. Kvórum never fetches performance automatically.
            </p>
          </section>
        ) : null}

        <div aria-live="polite" className="min-h-5 font-mono text-[10.5px]" role={error ? "alert" : "status"}>
          {error ? <span className="text-[#f87171]">{error}</span> : <span className="text-[#a1a1aa]">{message}</span>}
        </div>

        <RatingWidget
          contentHash={recommendation.contentHash}
          initialHistory={recommendation.ratings}
          objectId={recommendation.id}
          objectKind="recommendation"
          ventureId="kvorum"
        />
      </div>
    </article>
  );
}

export function KvorumRecommendationsPanel({ snapshot }: { snapshot: AdminKvorumSnapshot }) {
  if (snapshot.recommendations.length === 0) {
    const message = snapshot.recommendationsState === "missing"
      ? "The Kvórum desk has not written its first recommendation queue yet."
      : snapshot.recommendationsState === "unreadable"
        ? "Saved Kvórum recommendations exist, but none can be read safely."
        : "The recommendation store exists and its queue is empty.";
    return <p className="rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[13px] leading-[1.55] text-[#d4d4d8]">{message}</p>;
  }
  return (
    <div className="grid gap-4">
      {snapshot.unreadable > 0 ? (
        <p className="rounded-[9px] border border-[#92400e] bg-[#160f07] p-3 text-[12px] text-[#f5a524]">
          {snapshot.unreadable} Kvórum state {snapshot.unreadable === 1 ? "record was" : "records were"} dropped because they could not be read.
        </p>
      ) : null}
      {snapshot.recommendations.map((recommendation) => (
        <RecommendationCard key={recommendation.id} recommendation={recommendation} />
      ))}
    </div>
  );
}
