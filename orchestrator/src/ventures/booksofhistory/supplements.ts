import { z } from "zod";
import { BhDossierSchema, BhResearchLedgerEntrySchema, type BhDossier } from "../../contracts/bh-dossier.js";
import type { ResearchProvider } from "../../research/provider.js";
import { atomicWriteJson, readJson } from "../../state.js";
import {
  acquireBhResearchLock,
  appendBhResearchLedger,
  assertBhResearchReservation,
  bhDossierPath,
  readBhResearchLedger,
  type ReleaseBhResearchLock
} from "./research.js";

export const BH_SUPPLEMENT_CEILING_USD = 0.05;

const FindingSchema = z.strictObject({
  claimRef: z.string().regex(/^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  status: z.enum(["confirmed", "changed", "uncertain"]),
  summary: z.string().trim().min(8).max(800),
  sources: z.array(z.string().url()).min(1).max(10)
});

const ProviderSnapshotSchema = z.strictObject({
  providerId: z.string().min(1).max(120),
  model: z.string().min(1).max(160),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  searchUses: z.number().int().min(0).max(8),
  usd: z.number().min(0).max(BH_SUPPLEMENT_CEILING_USD)
});

export const BhDossierSupplementSchema = z.strictObject({
  schemaVersion: z.literal("bh-dossier-supplement/1"),
  date: z.iso.date(),
  bookId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  bookRef: z.string().min(1).max(500),
  dossierRef: z.string().min(1).max(500),
  dossierUpdatedAt: z.string().datetime(),
  dossierAgeDays: z.number().gt(90),
  selectedStoryId: z.string().regex(/^story-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  timeSensitiveClaimRefs: z.array(z.string().regex(/^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(20),
  findings: z.array(FindingSchema).max(20),
  provider: ProviderSnapshotSchema,
  rawResponse: z.unknown(),
  checkedAt: z.string().datetime()
}).superRefine((supplement, context) => {
  const requested = new Set(supplement.timeSensitiveClaimRefs);
  for (const [index, finding] of supplement.findings.entries()) {
    if (!requested.has(finding.claimRef)) {
      context.addIssue({ code: "custom", message: "Supplement finding exceeds the requested freshness layer", path: ["findings", index, "claimRef"] });
    }
  }
});

export type BhDossierSupplement = z.infer<typeof BhDossierSupplementSchema>;

export function bhDossierSupplementPath(bookId: string, date: string): string {
  return `ventures/booksofhistory/dossiers/${bookId}/supplements/${date}.json`;
}

function dossierAgeDays(dossier: BhDossier, now: Date): number {
  return (now.getTime() - new Date(dossier.updatedAt).getTime()) / 86_400_000;
}

export type BhSupplementResult =
  | { status: "not-needed"; message: string }
  | { status: "already-supplemented"; message: string; supplement: BhDossierSupplement }
  | { status: "in-flight"; message: string }
  | { status: "refreshed"; supplementRef: string; supplement: BhDossierSupplement };

/**
 * Refresh only named time-sensitive claims from an old shelf dossier. Stable dossier bytes are
 * read as evidence and never written by this path.
 */
export async function runBhDossierSupplement(input: {
  root: string;
  dossier: BhDossier;
  selectedStoryId: string;
  timeSensitiveClaimRefs: readonly string[];
  date: string;
  now: Date;
  provider: ResearchProvider;
  envelopeUsd: number;
  cycleId: string;
  cycleEnvelopeUsd: number;
  monthlyCeilingUsd: number;
  requestingMeetingRef: string;
}): Promise<BhSupplementResult> {
  const dossier = BhDossierSchema.parse(input.dossier);
  const age = dossierAgeDays(dossier, input.now);
  if (age <= 90) {
    return { status: "not-needed", message: `Dossier age is ${age.toFixed(1)} days; freshness research starts above 90.` };
  }
  if (!Number.isFinite(input.envelopeUsd) || input.envelopeUsd <= 0 || input.envelopeUsd > BH_SUPPLEMENT_CEILING_USD) {
    throw new Error(`Supplement envelope must be positive and at most $${BH_SUPPLEMENT_CEILING_USD.toFixed(2)}`);
  }
  const story = dossier.storyCandidates.find(({ storyId }) => storyId === input.selectedStoryId);
  if (!story) throw new Error(`Selected shelf story ${input.selectedStoryId} is absent from the dossier`);
  const requested = [...new Set(input.timeSensitiveClaimRefs)];
  if (requested.length === 0 || requested.some((claimRef) => !story.claimRefs.includes(claimRef))) {
    throw new Error("Supplement claims must be a non-empty subset of the selected story's claims");
  }
  const claimById = new Map(dossier.claims.map((claim) => [claim.claimId, claim]));
  const claims = requested.map((claimRef) => {
    const claim = claimById.get(claimRef);
    if (!claim) throw new Error(`Supplement claim ${claimRef} is absent from the dossier`);
    return { claimId: claim.claimId, text: claim.text };
  });
  const supplementRef = bhDossierSupplementPath(dossier.bookId, input.date);
  const existing = await readJson<unknown | null>(input.root, supplementRef, null);
  if (existing !== null) {
    return {
      status: "already-supplemented",
      message: `Freshness supplement already exists for (${dossier.bookId}, ${input.date}); zero provider calls made.`,
      supplement: BhDossierSupplementSchema.parse(existing)
    };
  }

  const releaseCycle = await acquireBhResearchLock(input.root, "cycle", input.cycleId, input.now);
  if (!releaseCycle) {
    return { status: "in-flight", message: `Research cycle ${input.cycleId} is already in flight; zero provider calls made.` };
  }
  let releaseSupplement: ReleaseBhResearchLock | null = null;
  try {
    releaseSupplement = await acquireBhResearchLock(
      input.root,
      "supplement",
      `${dossier.bookId}\n${input.date}`,
      input.now
    );
    if (!releaseSupplement) {
      return { status: "in-flight", message: `Supplement (${dossier.bookId}, ${input.date}) is already in flight; zero provider calls made.` };
    }
    const completedWhileWaiting = await readJson<unknown | null>(input.root, supplementRef, null);
    if (completedWhileWaiting !== null) {
      return {
        status: "already-supplemented",
        message: `Freshness supplement already exists for (${dossier.bookId}, ${input.date}); zero provider calls made.`,
        supplement: BhDossierSupplementSchema.parse(completedWhileWaiting)
      };
    }

    assertBhResearchReservation({
      cycleId: input.cycleId,
      now: input.now,
      candidateCount: 1,
      gatherEnvelopeUsd: input.envelopeUsd,
      synthEnvelopeUsd: 0,
      cycleEnvelopeUsd: input.cycleEnvelopeUsd,
      monthlyCeilingUsd: input.monthlyCeilingUsd,
      recordedMonthlyHeadroomUsd: 0
    }, await readBhResearchLedger(input.root));

    const raw = await input.provider.researchBook({
      bookRef: dossier.bookRef,
      brief: {
        objective: `Refresh only the named time-sensitive claims for shelf story ${story.storyId}.`,
        asOf: input.date,
        claims,
        avoid: "Do not re-research or rewrite stable historical claims, and do not produce content."
      },
      envelopeUsd: input.envelopeUsd
    });
    if (raw.usd > input.envelopeUsd || raw.usd > BH_SUPPLEMENT_CEILING_USD) {
      throw new Error("Supplement provider reported spend above its reserved ceiling");
    }
    const response = z.strictObject({ findings: z.array(FindingSchema).max(20) }).parse(raw.response);
    const supplement = BhDossierSupplementSchema.parse({
      schemaVersion: "bh-dossier-supplement/1",
      date: input.date,
      bookId: dossier.bookId,
      bookRef: dossier.bookRef,
      dossierRef: bhDossierPath(dossier.bookId),
      dossierUpdatedAt: dossier.updatedAt,
      dossierAgeDays: Math.round(age * 10_000) / 10_000,
      selectedStoryId: story.storyId,
      timeSensitiveClaimRefs: requested,
      findings: response.findings,
      provider: {
        providerId: raw.providerId,
        model: raw.model,
        startedAt: raw.startedAt,
        completedAt: raw.completedAt,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        searchUses: raw.searchUses,
        usd: raw.usd
      },
      rawResponse: raw.response,
      checkedAt: input.now.toISOString()
    });
    await atomicWriteJson(input.root, supplementRef, supplement);
    await appendBhResearchLedger(input.root, [BhResearchLedgerEntrySchema.parse({
      schemaVersion: "bh-research-ledger/1",
      step: "supplement",
      provider: raw.providerId,
      model: raw.model,
      startedAt: raw.startedAt,
      completedAt: raw.completedAt,
      cycleId: input.cycleId,
      bookId: dossier.bookId,
      bookRef: dossier.bookRef,
      briefHash: dossier.answeredBriefHashes.at(-1),
      reason: "supplemental-freshness",
      tokensIn: raw.tokensIn,
      tokensOut: raw.tokensOut,
      searches: raw.searchUses,
      costUsd: raw.usd,
      requestingMeetingRef: input.requestingMeetingRef,
      rawRef: supplementRef,
      dossierRef: bhDossierPath(dossier.bookId),
      used: false
    })]);
    return { status: "refreshed", supplementRef, supplement };
  } finally {
    try {
      if (releaseSupplement) await releaseSupplement();
    } finally {
      await releaseCycle();
    }
  }
}
