import { createHash } from "node:crypto";
import { appendFile, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  BhDossierSchema,
  BhDossierSynthesisSchema,
  BhResearchLedgerEntrySchema,
  BhVerificationStateSchema,
  type BhDossier,
  type BhDossierSynthesis,
  type BhResearchLedgerEntry
} from "../../contracts/bh-dossier.js";
import type { BhResearchBriefBundle, BhResearchBriefEntry } from "../../contracts/bh-research-brief.js";
import type { BhSeedRecord } from "../../contracts/bh-seed.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";
import type { RawResearch, ResearchProvider } from "../../research/provider.js";
import { atomicWriteJson, readJson } from "../../state.js";
import { BH_SHELF_STORY_THRESHOLD } from "./score.js";

export const BH_DOSSIER_STALE_DAYS = 90;
export const BH_RESEARCH_LEDGER_PATH = "ventures/booksofhistory/research-ledger.jsonl";
export const BH_RESEARCH_CYCLE_CEILING_USD = 0.5;
export const BH_RESEARCH_MONTHLY_CEILING_USD = 5;

export interface BhResearchBudgetInput {
  cycleId: string;
  now: Date;
  candidateCount: number;
  gatherEnvelopeUsd: number;
  synthEnvelopeUsd: number;
  cycleEnvelopeUsd: number;
  monthlyCeilingUsd: number;
  recordedMonthlyHeadroomUsd: number;
}

export class BhResearchBudgetError extends Error {
  constructor(
    readonly code: "INVALID_CAP" | "CYCLE_CAP" | "MONTHLY_CAP" | "THIRD_CANDIDATE",
    message: string
  ) {
    super(message);
    this.name = "BhResearchBudgetError";
  }
}

export interface BhResearchReservation {
  candidateCount: number;
  perCandidateUsd: number;
  reservedUsd: number;
  cycleSpentUsd: number;
  monthlySpentUsd: number;
}

function sameUtcMonth(value: string, now: Date): boolean {
  return value.slice(0, 7) === now.toISOString().slice(0, 7);
}

/** One calculation owns the cycle/month/third-candidate verdict before any provider call. */
export function assertBhResearchReservation(
  budget: BhResearchBudgetInput,
  ledger: readonly BhResearchLedgerEntry[]
): BhResearchReservation {
  if (!Number.isInteger(budget.candidateCount) || budget.candidateCount < 1 || budget.candidateCount > 3 ||
      !Number.isFinite(budget.gatherEnvelopeUsd) || budget.gatherEnvelopeUsd <= 0 || budget.gatherEnvelopeUsd > 0.1 ||
      !Number.isFinite(budget.synthEnvelopeUsd) || budget.synthEnvelopeUsd <= 0 || budget.synthEnvelopeUsd > 0.1 ||
      !Number.isFinite(budget.cycleEnvelopeUsd) || budget.cycleEnvelopeUsd <= 0 || budget.cycleEnvelopeUsd > BH_RESEARCH_CYCLE_CEILING_USD ||
      !Number.isFinite(budget.monthlyCeilingUsd) || budget.monthlyCeilingUsd <= 0 || budget.monthlyCeilingUsd > BH_RESEARCH_MONTHLY_CEILING_USD ||
      !Number.isFinite(budget.recordedMonthlyHeadroomUsd) || budget.recordedMonthlyHeadroomUsd < 0 ||
      budget.recordedMonthlyHeadroomUsd > BH_RESEARCH_MONTHLY_CEILING_USD) {
    throw new BhResearchBudgetError("INVALID_CAP", "Research limits must be positive and cannot exceed the standing ceilings");
  }
  const perCandidateUsd = Number((budget.gatherEnvelopeUsd + budget.synthEnvelopeUsd).toFixed(8));
  const reservedUsd = Number((perCandidateUsd * budget.candidateCount).toFixed(8));
  if (budget.candidateCount === 3 && budget.recordedMonthlyHeadroomUsd < reservedUsd) {
    throw new BhResearchBudgetError(
      "THIRD_CANDIDATE",
      `Three candidates reserve $${reservedUsd.toFixed(2)} but only $${budget.recordedMonthlyHeadroomUsd.toFixed(2)} monthly headroom is recorded`
    );
  }
  const cycleSpentUsd = Number(ledger
    .filter((entry) => entry.cycleId === budget.cycleId)
    .reduce((sum, entry) => sum + entry.costUsd, 0).toFixed(8));
  const monthlySpentUsd = Number(ledger
    .filter((entry) => sameUtcMonth(entry.completedAt, budget.now))
    .reduce((sum, entry) => sum + entry.costUsd, 0).toFixed(8));
  if (cycleSpentUsd + reservedUsd > budget.cycleEnvelopeUsd) {
    throw new BhResearchBudgetError("CYCLE_CAP", "Research reservation exceeds the cycle envelope");
  }
  if (monthlySpentUsd + reservedUsd > budget.monthlyCeilingUsd) {
    throw new BhResearchBudgetError("MONTHLY_CAP", "Research reservation exceeds the monthly ceiling");
  }
  return { candidateCount: budget.candidateCount, perCandidateUsd, reservedUsd, cycleSpentUsd, monthlySpentUsd };
}

/**
 * Plan the whole research set before its first call. Two is the default; a third is kept only
 * when the recorded headroom and both hard ceilings can reserve all three candidates.
 */
export function planBhResearchBatch(input: {
  bundle: BhResearchBriefBundle;
  budget: Omit<BhResearchBudgetInput, "candidateCount" | "recordedMonthlyHeadroomUsd">;
  ledger: readonly BhResearchLedgerEntry[];
}): { briefs: BhResearchBriefEntry[]; reservation: BhResearchReservation } {
  const defaultCount = Math.min(2, input.bundle.briefs.length);
  let candidateCount = defaultCount;
  if (input.bundle.briefs.length >= 3 && input.bundle.maximumCandidates === 3) {
    try {
      assertBhResearchReservation({
        ...input.budget,
        candidateCount: 3,
        recordedMonthlyHeadroomUsd: input.bundle.monthlyResearchHeadroomUsd
      }, input.ledger);
      candidateCount = 3;
    } catch (error) {
      if (!(error instanceof BhResearchBudgetError) || error.code === "INVALID_CAP") throw error;
    }
  }
  const reservation = assertBhResearchReservation({
    ...input.budget,
    candidateCount,
    recordedMonthlyHeadroomUsd: input.bundle.monthlyResearchHeadroomUsd
  }, input.ledger);
  return { briefs: input.bundle.briefs.slice(0, candidateCount), reservation };
}

export interface BhResearchPrecheck {
  existingDossier: boolean;
  questionAnswered: boolean;
  trustworthy: boolean;
  stale: boolean;
  shelfSufficient: boolean;
  decision: "research" | "reuse";
  reason: "missing-dossier" | "unanswered-question" | "untrustworthy" | "stale" | "thin-shelf" | "shelf-sufficient";
}

function ageDays(instant: string, now: Date): number {
  return (now.getTime() - new Date(instant).getTime()) / 86_400_000;
}

/** Record all five checks even when the first one already establishes that research is needed. */
export function assessBhResearchNeed(input: {
  dossier: unknown | null;
  briefHash: string;
  now: Date;
}): BhResearchPrecheck {
  const parsed = BhDossierSchema.safeParse(input.dossier);
  const dossier = parsed.success ? parsed.data : null;
  const existingDossier = input.dossier !== null;
  const questionAnswered = dossier?.answeredBriefHashes.includes(input.briefHash) ?? false;
  const suitableClaims = new Set((dossier?.claims ?? [])
    .filter((claim) => claim.publicationSuitable && !["legend", "rejected"].includes(claim.verificationState))
    .map(({ claimId }) => claimId));
  const trustworthy = dossier !== null && suitableClaims.size > 0;
  const stale = dossier !== null && ageDays(dossier.updatedAt, input.now) > BH_DOSSIER_STALE_DAYS;
  const shelfSufficient = dossier?.storyCandidates.some((story) =>
    !story.used &&
    story.score >= BH_SHELF_STORY_THRESHOLD &&
    story.claimRefs.every((claimRef) => suitableClaims.has(claimRef))) ?? false;

  let reason: BhResearchPrecheck["reason"] = "shelf-sufficient";
  if (!existingDossier) reason = "missing-dossier";
  else if (!questionAnswered) reason = "unanswered-question";
  else if (!trustworthy) reason = "untrustworthy";
  else if (stale) reason = "stale";
  else if (!shelfSufficient) reason = "thin-shelf";
  return {
    existingDossier,
    questionAnswered,
    trustworthy,
    stale,
    shelfSufficient,
    decision: reason === "shelf-sufficient" ? "reuse" : "research",
    reason
  };
}

export function bhDossierPath(bookId: string): string {
  return `ventures/booksofhistory/dossiers/${bookId}/dossier.json`;
}

export function bhRawResearchPath(bookId: string, briefHash: string): string {
  return `ventures/booksofhistory/dossiers/${bookId}/raw/${briefHash}.json`;
}

export function parseBhResearchLedgerJsonl(raw: string): BhResearchLedgerEntry[] {
  return raw.split(/\r?\n/u).filter(Boolean).map((line) =>
    BhResearchLedgerEntrySchema.parse(JSON.parse(line))
  );
}

/** Validate the complete existing ledger, then append new immutable lines without rewriting it. */
export async function appendBhResearchLedger(
  root: string,
  entries: readonly BhResearchLedgerEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  const file = path.join(root, BH_RESEARCH_LEDGER_PATH);
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  parseBhResearchLedgerJsonl(existing);
  const parsed = entries.map((entry) => BhResearchLedgerEntrySchema.parse(entry));
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, parsed.map((entry) => `${JSON.stringify(entry)}\n`).join(""), "utf8");
}

export async function readBhResearchLedger(root: string): Promise<BhResearchLedgerEntry[]> {
  try {
    return parseBhResearchLedgerJsonl(await readFile(path.join(root, BH_RESEARCH_LEDGER_PATH), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

type ReleaseResearchLock = () => Promise<void>;

async function acquireResearchLock(
  root: string,
  kind: "cycle" | "book-brief",
  key: string,
  now: Date
): Promise<ReleaseResearchLock | null> {
  const digest = createHash("sha256").update(key).digest("hex");
  const file = path.join(root, "ventures/booksofhistory/locks", `${kind}-${digest}.lock`);
  await mkdir(path.dirname(file), { recursive: true });
  let handle;
  try {
    handle = await open(file, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: "bh-research-lock/1", kind, key, acquiredAt: now.toISOString() })}\n`);
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(file).catch(() => undefined);
    throw error;
  }
  return async () => {
    try {
      await unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
}

export type BhSynthCallConfig = Omit<
  GuardedCallInput<BhDossierSynthesis>,
  "input" | "parse"
>;

function synthPacket(input: {
  book: BhSeedRecord;
  brief: BhResearchBriefEntry;
  raw: RawResearch;
}): string {
  return JSON.stringify({
    book: {
      bookId: input.book.bookId,
      title: input.book.title,
      originalTitle: input.book.originalTitle,
      author: input.book.author,
      year: input.book.year,
      originalLanguage: input.book.originalLanguage,
      genres: input.book.genres,
      contentCategories: input.book.contentCategories
    },
    brief: {
      objective: input.brief.objective,
      investigateSpecifically: input.brief.investigateSpecifically,
      lookFor: input.brief.lookFor,
      avoid: input.brief.avoid
    },
    rawResearch: input.raw.response,
    constraints: {
      quoteMaximumCharacters: 300,
      quoteAttributionRequired: true,
      coverArtworkForbidden: true,
      acceptedInitialStates: BhVerificationStateSchema.options
    }
  });
}

export type BhCandidateResearchResult =
  | { status: "reused"; precheck: BhResearchPrecheck; dossier: BhDossier }
  | { status: "already-researched"; message: string; dossier: BhDossier }
  | { status: "in-flight"; message: string; lock: "cycle-budget" | "book-brief" }
  | { status: "researched"; precheck: BhResearchPrecheck; dossier: BhDossier; rawRef: string; dossierRef: string };

export type BhCandidateResearchBudget = Omit<
  BhResearchBudgetInput,
  "cycleId" | "now" | "gatherEnvelopeUsd"
>;

function answeredDossier(stored: unknown | null, briefHash: string): BhDossier | null {
  const parsed = BhDossierSchema.safeParse(stored);
  return parsed.success && parsed.data.answeredBriefHashes.includes(briefHash) ? parsed.data : null;
}

/** The sole writer for normalized BOOKSOFHISTORY dossiers and their retained raw response. */
export async function runBhCandidateResearch(input: {
  root: string;
  book: BhSeedRecord;
  brief: BhResearchBriefEntry;
  provider: ResearchProvider;
  gatherEnvelopeUsd: number;
  researchedAt: Date;
  requestingMeetingRef: string;
  researchBudget: BhCandidateResearchBudget;
  synthCallConfig: BhSynthCallConfig;
  synthCall?: typeof guardedJsonCall;
}): Promise<BhCandidateResearchResult> {
  const dossierRef = bhDossierPath(input.book.bookId);
  const initial = await readJson<unknown | null>(input.root, dossierRef, null);
  const completed = answeredDossier(initial, input.brief.briefHash);
  if (completed) {
    return {
      status: "already-researched",
      message: `Research already exists for (${input.book.bookId}, ${input.brief.briefHash}); zero provider calls made.`,
      dossier: completed
    };
  }

  const releaseCycle = await acquireResearchLock(
    input.root,
    "cycle",
    input.synthCallConfig.cycleId,
    input.researchedAt
  );
  if (!releaseCycle) {
    return {
      status: "in-flight",
      lock: "cycle-budget",
      message: `Research cycle ${input.synthCallConfig.cycleId} is already in flight; zero provider calls made.`
    };
  }
  let releaseBookBrief: ReleaseResearchLock | null = null;
  try {
    releaseBookBrief = await acquireResearchLock(
      input.root,
      "book-brief",
      `${input.book.bookId}\n${input.brief.briefHash}`,
      input.researchedAt
    );
    if (!releaseBookBrief) {
      return {
        status: "in-flight",
        lock: "book-brief",
        message: `Research for (${input.book.bookId}, ${input.brief.briefHash}) is already in flight; zero provider calls made.`
      };
    }

    const stored = await readJson<unknown | null>(input.root, dossierRef, null);
    const finishedWhileWaiting = answeredDossier(stored, input.brief.briefHash);
    if (finishedWhileWaiting) {
      return {
        status: "already-researched",
        message: `Research already exists for (${input.book.bookId}, ${input.brief.briefHash}); zero provider calls made.`,
        dossier: finishedWhileWaiting
      };
    }
    const precheck = assessBhResearchNeed({
      dossier: stored,
      briefHash: input.brief.briefHash,
      now: input.researchedAt
    });
    if (precheck.decision === "reuse") {
      return { status: "reused", precheck, dossier: BhDossierSchema.parse(stored) };
    }

    assertBhResearchReservation({
      ...input.researchBudget,
      cycleId: input.synthCallConfig.cycleId,
      now: input.researchedAt,
      gatherEnvelopeUsd: input.gatherEnvelopeUsd
    }, await readBhResearchLedger(input.root));

    const raw = await input.provider.researchBook({
      bookRef: input.brief.bookRef,
      brief: input.brief,
      envelopeUsd: input.gatherEnvelopeUsd
    });
    const synth = input.synthCall ?? guardedJsonCall;
    const normalized = await synth({
      ...input.synthCallConfig,
      input: synthPacket({ book: input.book, brief: input.brief, raw }),
      parse: (text) => BhDossierSynthesisSchema.parse(JSON.parse(text))
    });
    const rawRef = bhRawResearchPath(input.book.bookId, input.brief.briefHash);
    const previous = BhDossierSchema.safeParse(stored);
    const dossier = BhDossierSchema.parse({
      schemaVersion: "bh-dossier/1",
      bookId: input.book.bookId,
      bookRef: input.brief.bookRef,
      title: input.book.title,
      author: input.book.author,
      answeredBriefHashes: [...new Set([
        ...(previous.success ? previous.data.answeredBriefHashes : []),
        input.brief.briefHash
      ])],
      rawRefs: [...new Set([...(previous.success ? previous.data.rawRefs : []), rawRef])],
      supplementRefs: previous.success ? previous.data.supplementRefs : [],
      researchedAt: previous.success ? previous.data.researchedAt : input.researchedAt.toISOString(),
      updatedAt: input.researchedAt.toISOString(),
      ...BhDossierSynthesisSchema.parse(normalized.value)
    });
    await atomicWriteJson(input.root, rawRef, {
      schemaVersion: "bh-raw-research/1",
      bookId: input.book.bookId,
      bookRef: input.brief.bookRef,
      briefHash: input.brief.briefHash,
      retainedAt: input.researchedAt.toISOString(),
      research: raw
    });
    await atomicWriteJson(input.root, dossierRef, dossier);
    if (precheck.reason === "shelf-sufficient") {
      throw new Error("A reused shelf dossier cannot reach the research ledger writer");
    }
    const synthUsage = normalized.usage;
    await appendBhResearchLedger(input.root, [
      BhResearchLedgerEntrySchema.parse({
        schemaVersion: "bh-research-ledger/1",
        step: "gather",
        provider: raw.providerId,
        model: raw.model,
        startedAt: raw.startedAt,
        completedAt: raw.completedAt,
        cycleId: input.synthCallConfig.cycleId,
        bookId: input.book.bookId,
        bookRef: input.brief.bookRef,
        briefHash: input.brief.briefHash,
        reason: precheck.reason,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
        searches: raw.searchUses,
        costUsd: raw.usd,
        requestingMeetingRef: input.requestingMeetingRef,
        rawRef,
        dossierRef,
        used: false
      }),
      BhResearchLedgerEntrySchema.parse({
        schemaVersion: "bh-research-ledger/1",
        step: "synth",
        provider: input.synthCallConfig.provider,
        model: synthUsage?.model ?? input.synthCallConfig.model,
        startedAt: input.researchedAt.toISOString(),
        completedAt: input.researchedAt.toISOString(),
        cycleId: input.synthCallConfig.cycleId,
        bookId: input.book.bookId,
        bookRef: input.brief.bookRef,
        briefHash: input.brief.briefHash,
        reason: precheck.reason,
        tokensIn: synthUsage?.tokensIn ?? 0,
        tokensOut: synthUsage?.tokensOut ?? 0,
        searches: 0,
        costUsd: normalized.usd,
        requestingMeetingRef: input.requestingMeetingRef,
        rawRef,
        dossierRef,
        used: false
      })
    ]);
    return { status: "researched", precheck, dossier, rawRef, dossierRef };
  } finally {
    try {
      if (releaseBookBrief) await releaseBookBrief();
    } finally {
      await releaseCycle();
    }
  }
}
