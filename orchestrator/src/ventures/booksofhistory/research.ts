import { z } from "zod";
import type { BhResearchBriefEntry } from "../../contracts/bh-research-brief.js";
import type { BhSeedRecord } from "../../contracts/bh-seed.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";
import type { RawResearch, ResearchProvider } from "../../research/provider.js";
import { atomicWriteJson, readJson } from "../../state.js";
import { BH_SHELF_STORY_THRESHOLD } from "./score.js";

export const BH_DOSSIER_STALE_DAYS = 90;

const VerificationStateSchema = z.enum([
  "verified",
  "probable",
  "single-source",
  "legend",
  "rejected"
]);

const SourceSchema = z.strictObject({
  url: z.string().url(),
  title: z.string().trim().min(1).max(300),
  category: z.enum(["primary", "archive", "scholarship", "journalism", "reference"])
});

const ClaimSchema = z.strictObject({
  claimId: z.string().regex(/^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  text: z.string().trim().min(8).max(1_000),
  sources: z.array(SourceSchema).min(1).max(20),
  confidence: z.number().min(0).max(1),
  corroboration: z.number().int().min(1).max(20),
  verificationState: VerificationStateSchema,
  publicationSuitable: z.boolean()
}).superRefine((claim, context) => {
  if (claim.corroboration > claim.sources.length) {
    context.addIssue({ code: "custom", message: "Corroboration cannot exceed cited sources", path: ["corroboration"] });
  }
  if (["legend", "rejected"].includes(claim.verificationState) && claim.publicationSuitable) {
    context.addIssue({ code: "custom", message: "Legend and rejected claims are not initially publication-suitable", path: ["publicationSuitable"] });
  }
});

const StoryCandidateSchema = z.strictObject({
  storyId: z.string().regex(/^story-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  angle: z.string().trim().min(8).max(300),
  score: z.number().min(0).max(100),
  claimRefs: z.array(z.string().regex(/^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(20),
  used: z.literal(false)
});

const QuoteSchema = z.strictObject({
  text: z.string().trim().min(1).max(300),
  attribution: z.string().trim().min(1).max(300),
  sourceUrl: z.string().url(),
  claimRef: z.string().regex(/^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/)
});

const VisualNoteSchema = z.string().trim().min(8).max(500).refine(
  (note) => !/\b(?:book[ -]?)?cover(?:s| art| artwork)?\b/iu.test(note),
  "Visual notes cannot request or describe cover artwork"
);

/** Internal normalization boundary; BH-11b publishes the same shape as a repository contract. */
export const BhDossierSynthesisSchema = z.strictObject({
  claims: z.array(ClaimSchema).min(1).max(100),
  storyCandidates: z.array(StoryCandidateSchema).min(1).max(30),
  quotes: z.array(QuoteSchema).max(30),
  visualNotes: z.array(VisualNoteSchema).max(30)
}).superRefine((dossier, context) => {
  const claimIds = new Set(dossier.claims.map(({ claimId }) => claimId));
  for (const [storyIndex, story] of dossier.storyCandidates.entries()) {
    for (const claimRef of story.claimRefs) {
      if (!claimIds.has(claimRef)) {
        context.addIssue({ code: "custom", message: "Story references an unknown claim", path: ["storyCandidates", storyIndex, "claimRefs"] });
      }
    }
  }
  for (const [quoteIndex, quote] of dossier.quotes.entries()) {
    if (!claimIds.has(quote.claimRef)) {
      context.addIssue({ code: "custom", message: "Quote references an unknown claim", path: ["quotes", quoteIndex, "claimRef"] });
    }
  }
});

export const BhDossierDraftSchema = BhDossierSynthesisSchema.extend({
  schemaVersion: z.literal("bh-dossier/1"),
  bookId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  bookRef: z.string().min(1).max(500),
  title: z.string().trim().min(1).max(240),
  author: z.string().trim().min(1).max(160),
  answeredBriefHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(100),
  rawRefs: z.array(z.string().min(1).max(500)).min(1).max(100),
  supplementRefs: z.array(z.string().min(1).max(500)).max(100),
  researchedAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type BhDossierDraft = z.infer<typeof BhDossierDraftSchema>;

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
  const parsed = BhDossierDraftSchema.safeParse(input.dossier);
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

export type BhSynthCallConfig = Omit<
  GuardedCallInput<z.infer<typeof BhDossierSynthesisSchema>>,
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
      acceptedInitialStates: VerificationStateSchema.options
    }
  });
}

export type BhCandidateResearchResult =
  | { status: "reused"; precheck: BhResearchPrecheck; dossier: BhDossierDraft }
  | { status: "researched"; precheck: BhResearchPrecheck; dossier: BhDossierDraft; rawRef: string; dossierRef: string };

/** The sole writer for normalized BOOKSOFHISTORY dossiers and their retained raw response. */
export async function runBhCandidateResearch(input: {
  root: string;
  book: BhSeedRecord;
  brief: BhResearchBriefEntry;
  provider: ResearchProvider;
  gatherEnvelopeUsd: number;
  researchedAt: Date;
  synthCallConfig: BhSynthCallConfig;
  synthCall?: typeof guardedJsonCall;
}): Promise<BhCandidateResearchResult> {
  const dossierRef = bhDossierPath(input.book.bookId);
  const stored = await readJson<unknown | null>(input.root, dossierRef, null);
  const precheck = assessBhResearchNeed({
    dossier: stored,
    briefHash: input.brief.briefHash,
    now: input.researchedAt
  });
  if (precheck.decision === "reuse") {
    return { status: "reused", precheck, dossier: BhDossierDraftSchema.parse(stored) };
  }

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
  const previous = BhDossierDraftSchema.safeParse(stored);
  const dossier = BhDossierDraftSchema.parse({
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
  return { status: "researched", precheck, dossier, rawRef, dossierRef };
}
