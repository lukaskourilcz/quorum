import { createHash } from "node:crypto";
import { z } from "zod";
import {
  BhResearchBriefBundleSchema,
  type BhResearchBriefBundle,
  type BhResearchBriefEntry
} from "../../contracts/bh-research-brief.js";
import type { BhSeedRecord } from "../../contracts/bh-seed.js";
import type { BhShortlist } from "../../contracts/bh-shortlist.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";
import { atomicWriteJson } from "../../state.js";
import { BH_SHELF_STORY_THRESHOLD } from "./score.js";

export const BH_THIRD_CANDIDATE_RESERVE_USD = 0.15;

const FolioCandidateSchema = z.strictObject({
  bookId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  selectionReason: z.string().trim().min(8).max(400),
  objective: z.string().trim().min(12).max(500),
  investigateSpecifically: z.array(z.string().trim().min(8).max(400)).min(1).max(5),
  lookFor: z.array(z.string().trim().min(8).max(400)).min(1).max(5),
  avoid: z.array(z.string().trim().min(8).max(400)).min(1).max(5)
});

const FolioBriefSelectionSchema = z.strictObject({
  selected: z.array(FolioCandidateSchema).min(2).max(3)
}).superRefine((output, context) => {
  const ids = output.selected.map(({ bookId }) => bookId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "FOLIO candidate ids must be unique", path: ["selected"] });
  }
});

type FolioBriefSelection = z.infer<typeof FolioBriefSelectionSchema>;

export interface BhAngleHistoryEntry {
  bookId: string;
  angle: string;
  featureRef: string;
}

export interface BhShelfDossierSummary {
  bookId: string;
  dossierRef: string;
  stories: ReadonlyArray<{ storyId: string; score: number; used: boolean }>;
}

export interface BhShelfShortcut {
  bookId: string;
  dossierRef: string;
  storyId: string;
  score: number;
  candidateSet: [{
    candidateId: string;
    source: "shelf";
    briefRef: null;
    dossierRef: string;
  }];
}

/** Paid knowledge posts first: only the top-ranked candidate can end selection immediately. */
export function findBhShelfShortcut(
  shortlist: BhShortlist,
  shelf: readonly BhShelfDossierSummary[]
): BhShelfShortcut | null {
  const top = shortlist.entries[0];
  if (!top || top.factors.shelfBonus.highestScore === null) return null;
  const dossier = shelf.find(({ bookId }) => bookId === top.bookId);
  if (!dossier) return null;
  const eligibleIds = new Set(top.factors.shelfBonus.eligibleStoryIds);
  const story = dossier.stories
    .filter((candidate) => !candidate.used && candidate.score >= BH_SHELF_STORY_THRESHOLD && eligibleIds.has(candidate.storyId))
    .sort((left, right) => right.score - left.score || left.storyId.localeCompare(right.storyId))[0];
  if (!story) return null;
  return {
    bookId: top.bookId,
    dossierRef: dossier.dossierRef,
    storyId: story.storyId,
    score: story.score,
    candidateSet: [{
      candidateId: top.bookId,
      source: "shelf",
      briefRef: null,
      dossierRef: dossier.dossierRef
    }]
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hashBrief(brief: Omit<BhResearchBriefEntry, "briefHash">): string {
  return createHash("sha256").update(JSON.stringify(brief)).digest("hex");
}

function folioPacket(input: {
  shortlist: BhShortlist;
  books: readonly BhSeedRecord[];
  angleHistory: readonly BhAngleHistoryEntry[];
  maximumCandidates: 2 | 3;
}): string {
  const bookById = new Map(input.books.map((book) => [book.bookId, book]));
  return JSON.stringify({
    task: "Rank the recorded shortlist and return tailored research briefs for no more than maximumCandidates.",
    maximumCandidates: input.maximumCandidates,
    shortlist: input.shortlist.entries.map((entry) => {
      const book = bookById.get(entry.bookId);
      if (!book) throw new Error(`Shortlist book ${entry.bookId} is absent from the seed library`);
      return {
        rank: entry.rank,
        score: entry.totalScore,
        factors: entry.factors,
        book: {
          bookId: book.bookId,
          title: book.title,
          originalTitle: book.originalTitle,
          author: book.author,
          year: book.year,
          originalLanguage: book.originalLanguage,
          genres: book.genres,
          contentCategories: book.contentCategories,
          geographies: book.scoringMetadata.geographies,
          angleTypes: book.scoringMetadata.angleTypes
        },
        angleHistory: input.angleHistory
          .filter((history) => history.bookId === book.bookId)
          .map(({ angle, featureRef }) => ({ angle, featureRef }))
      };
    }),
    output: {
      selected: [{
        bookId: "seed book id",
        selectionReason: "why this candidate survives",
        objective: "one concrete research objective",
        investigateSpecifically: ["specific question"],
        lookFor: ["evidence or source type"],
        avoid: ["known trap or repeated angle"]
      }]
    }
  });
}

function assembleBrief(input: {
  candidate: FolioBriefSelection["selected"][number];
  shortlist: BhShortlist;
  book: BhSeedRecord;
  angleHistory: readonly BhAngleHistoryEntry[];
}): BhResearchBriefEntry {
  const shortlistEntry = input.shortlist.entries.find(({ bookId }) => bookId === input.book.bookId);
  if (!shortlistEntry) throw new Error(`FOLIO selected a book outside the shortlist: ${input.book.bookId}`);
  const history = input.angleHistory.filter(({ bookId }) => bookId === input.book.bookId);
  const priorAngles = unique(history.map(({ angle }) => angle));
  const unusedSeedAngle = input.book.scoringMetadata.angleTypes.find((angle) => !priorAngles.includes(angle))
    ?? input.book.scoringMetadata.angleTypes[0]!;
  const withoutHash = {
    bookId: input.book.bookId,
    bookRef: shortlistEntry.bookRef,
    shortlistRank: shortlistEntry.rank,
    selectionReason: input.candidate.selectionReason,
    objective: `Research ${input.book.title} (${input.book.year}) by ${input.book.author}: ${input.candidate.objective}`,
    investigateSpecifically: unique([
      `Establish the publication context of ${input.book.title} in ${input.book.year}, without inventing a precise date.`,
      ...input.candidate.investigateSpecifically
    ]),
    lookFor: unique([
      `Look for attributable evidence around the ${unusedSeedAngle} angle for ${input.book.bookId}.`,
      ...input.candidate.lookFor
    ]),
    avoid: unique([
      "Avoid generic plot summary, unsupported biography, cover artwork and unverified anecdote presented as fact.",
      ...(priorAngles.length > 0 ? [`Avoid repeating the already-used angles: ${priorAngles.join(", ")}.`] : []),
      ...input.candidate.avoid
    ]),
    angleHistoryRefs: unique(history.map(({ featureRef }) => featureRef))
  } satisfies Omit<BhResearchBriefEntry, "briefHash">;
  return { ...withoutHash, briefHash: hashBrief(withoutHash) };
}

export type BhFolioCallConfig = Omit<
  GuardedCallInput<FolioBriefSelection>,
  "input" | "parse"
>;

export interface GenerateBhResearchBriefsInput {
  date: string;
  shortlist: BhShortlist;
  shortlistRef: string;
  requestingMeetingRef: string;
  books: readonly BhSeedRecord[];
  angleHistory: readonly BhAngleHistoryEntry[];
  monthlyResearchHeadroomUsd: number;
  generatedAt: Date;
  callConfig: BhFolioCallConfig;
  call?: typeof guardedJsonCall;
}

/** One FOLIO call chooses survivors; deterministic assembly binds each brief to seed/history. */
export async function generateBhResearchBriefs(
  input: GenerateBhResearchBriefsInput
): Promise<BhResearchBriefBundle> {
  if (!Number.isFinite(input.monthlyResearchHeadroomUsd) ||
      input.monthlyResearchHeadroomUsd < 0 ||
      input.monthlyResearchHeadroomUsd > 5) {
    throw new Error("Recorded monthly research headroom must be between $0 and $5");
  }
  const maximumCandidates = input.monthlyResearchHeadroomUsd >= BH_THIRD_CANDIDATE_RESERVE_USD ? 3 : 2;
  if (input.shortlist.entries.length < 2) throw new Error("FOLIO requires at least two shortlisted books");
  const invoke = input.call ?? guardedJsonCall;
  const response = await invoke({
    ...input.callConfig,
    input: folioPacket({
      shortlist: input.shortlist,
      books: input.books,
      angleHistory: input.angleHistory,
      maximumCandidates
    }),
    parse: (text) => FolioBriefSelectionSchema.parse(JSON.parse(text))
  });
  const selection = FolioBriefSelectionSchema.parse(response.value);
  if (selection.selected.length > maximumCandidates) {
    throw new Error(`FOLIO selected ${selection.selected.length} candidates but recorded headroom permits ${maximumCandidates}`);
  }
  const bookById = new Map(input.books.map((book) => [book.bookId, book]));
  const briefs = selection.selected.map((candidate) => {
    const book = bookById.get(candidate.bookId);
    if (!book) throw new Error(`FOLIO selected a book outside the seed library: ${candidate.bookId}`);
    return assembleBrief({ candidate, shortlist: input.shortlist, book, angleHistory: input.angleHistory });
  });
  return BhResearchBriefBundleSchema.parse({
    schemaVersion: "bh-research-brief/1",
    date: input.date,
    cycleId: input.shortlist.cycleId,
    shortlistRef: input.shortlistRef,
    requestingMeetingRef: input.requestingMeetingRef,
    monthlyResearchHeadroomUsd: input.monthlyResearchHeadroomUsd,
    thirdCandidateReserveUsd: BH_THIRD_CANDIDATE_RESERVE_USD,
    maximumCandidates,
    briefs,
    generatedAt: input.generatedAt.toISOString()
  });
}

export type BhEditorialSelectionPlan =
  | { kind: "shelf-shortcut"; shortcut: BhShelfShortcut }
  | { kind: "research"; briefs: BhResearchBriefBundle };

/** Shelf eligibility is decided before FOLIO, so a paid dossier can never trigger another call. */
export async function planBhEditorialSelection(
  input: GenerateBhResearchBriefsInput & { shelf: readonly BhShelfDossierSummary[] }
): Promise<BhEditorialSelectionPlan> {
  const shortcut = findBhShelfShortcut(input.shortlist, input.shelf);
  if (shortcut) return { kind: "shelf-shortcut", shortcut };
  const { shelf: _shelf, ...briefInput } = input;
  return { kind: "research", briefs: await generateBhResearchBriefs(briefInput) };
}

export function bhResearchBriefPath(date: string): string {
  return `ventures/booksofhistory/briefs/${date}.json`;
}

export async function writeBhResearchBriefs(root: string, bundle: BhResearchBriefBundle): Promise<string> {
  const relative = bhResearchBriefPath(bundle.date);
  await atomicWriteJson(root, relative, BhResearchBriefBundleSchema.parse(bundle));
  return relative;
}

export function candidateSetForBhBriefs(bundle: BhResearchBriefBundle) {
  const briefPath = bhResearchBriefPath(bundle.date);
  return bundle.briefs.map((brief) => ({
    candidateId: brief.bookId,
    source: "shortlist" as const,
    briefRef: `${briefPath}#${brief.bookId}`,
    dossierRef: null
  }));
}
