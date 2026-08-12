import { z } from "zod";
import { DateTimeSchema, HttpsUrlSchema, MeetingRefSchema } from "./common.js";

const BookIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const ClaimIdSchema = z.string().regex(/^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const StoryIdSchema = z.string().regex(/^story-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

export const BhVerificationStateSchema = z.enum([
  "verified",
  "probable",
  "single-source",
  "legend",
  "rejected"
]);

export const BhDossierSourceSchema = z.strictObject({
  url: HttpsUrlSchema,
  title: z.string().trim().min(1).max(300),
  category: z.enum(["primary", "archive", "scholarship", "journalism", "reference"])
});

export const BhDossierClaimSchema = z.strictObject({
  claimId: ClaimIdSchema,
  text: z.string().trim().min(8).max(1_000),
  sources: z.array(BhDossierSourceSchema).min(1).max(20),
  confidence: z.number().min(0).max(1),
  corroboration: z.number().int().min(1).max(20),
  verificationState: BhVerificationStateSchema,
  publicationSuitable: z.boolean()
}).superRefine((claim, context) => {
  if (claim.corroboration > claim.sources.length) {
    context.addIssue({ code: "custom", message: "Corroboration cannot exceed cited sources", path: ["corroboration"] });
  }
  if (["legend", "rejected"].includes(claim.verificationState) && claim.publicationSuitable) {
    context.addIssue({ code: "custom", message: "Legend and rejected claims are not publication-suitable", path: ["publicationSuitable"] });
  }
});

export const BhDossierStorySchema = z.strictObject({
  storyId: StoryIdSchema,
  angle: z.string().trim().min(8).max(300),
  score: z.number().min(0).max(100),
  claimRefs: z.array(ClaimIdSchema).min(1).max(20),
  used: z.boolean()
});

export const BhDossierQuoteSchema = z.strictObject({
  text: z.string().trim().min(1).max(300),
  attribution: z.string().trim().min(1).max(300),
  sourceUrl: HttpsUrlSchema,
  claimRef: ClaimIdSchema
});

export const BhDossierVisualNoteSchema = z.string().trim().min(8).max(500).refine(
  (note) => !/\b(?:book[ -]?)?cover(?:s| art| artwork)?\b/iu.test(note),
  "Visual notes cannot request or describe cover artwork"
);

const ContentShape = {
  claims: z.array(BhDossierClaimSchema).min(1).max(100),
  storyCandidates: z.array(BhDossierStorySchema).min(1).max(30),
  quotes: z.array(BhDossierQuoteSchema).max(30),
  visualNotes: z.array(BhDossierVisualNoteSchema).max(30)
};
const DossierContentSchema = z.strictObject(ContentShape);
type DossierContent = z.infer<typeof DossierContentSchema>;

function validateDossierContent(
  dossier: DossierContent,
  context: z.RefinementCtx
): void {
  const claimIds = new Set(dossier.claims.map(({ claimId }) => claimId));
  const claimById = new Map(dossier.claims.map((claim) => [claim.claimId, claim]));
  for (const [storyIndex, story] of dossier.storyCandidates.entries()) {
    for (const claimRef of story.claimRefs) {
      if (!claimIds.has(claimRef)) {
        context.addIssue({ code: "custom", message: "Story references an unknown claim", path: ["storyCandidates", storyIndex, "claimRefs"] });
      }
    }
  }
  for (const [quoteIndex, quote] of dossier.quotes.entries()) {
    const claim = claimById.get(quote.claimRef);
    if (!claim) {
      context.addIssue({ code: "custom", message: "Quote references an unknown claim", path: ["quotes", quoteIndex, "claimRef"] });
    } else if (!claim.sources.some(({ url }) => url === quote.sourceUrl)) {
      context.addIssue({ code: "custom", message: "Quote source must be cited by its claim", path: ["quotes", quoteIndex, "sourceUrl"] });
    }
  }
}

export const BhDossierSynthesisSchema = DossierContentSchema
  .superRefine((dossier, context) => {
    validateDossierContent(dossier, context);
    dossier.storyCandidates.forEach((story, index) => {
      if (story.used) {
        context.addIssue({ code: "custom", message: "Newly synthesized stories begin unused", path: ["storyCandidates", index, "used"] });
      }
    });
  });

export const BhDossierSchema = z.strictObject({
  schemaVersion: z.literal("bh-dossier/1"),
  bookId: BookIdSchema,
  bookRef: MeetingRefSchema,
  title: z.string().trim().min(1).max(240),
  author: z.string().trim().min(1).max(160),
  answeredBriefHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(100),
  rawRefs: z.array(MeetingRefSchema).min(1).max(100),
  supplementRefs: z.array(MeetingRefSchema).max(100),
  researchedAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  ...ContentShape
}).superRefine((dossier, context) => {
  validateDossierContent(dossier, context);
  for (const [field, values] of [
    ["answeredBriefHashes", dossier.answeredBriefHashes],
    ["rawRefs", dossier.rawRefs],
    ["supplementRefs", dossier.supplementRefs]
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: `${field} values must be unique`, path: [field] });
    }
  }
});

export const BhResearchLedgerEntrySchema = z.strictObject({
  schemaVersion: z.literal("bh-research-ledger/1"),
  step: z.enum(["gather", "synth"]),
  provider: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(160),
  startedAt: DateTimeSchema,
  completedAt: DateTimeSchema,
  bookId: BookIdSchema,
  bookRef: MeetingRefSchema,
  briefHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.enum(["missing-dossier", "unanswered-question", "untrustworthy", "stale", "thin-shelf"]),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  searches: z.number().int().min(0).max(8),
  costUsd: z.number().min(0).max(0.1),
  requestingMeetingRef: MeetingRefSchema,
  rawRef: MeetingRefSchema,
  dossierRef: MeetingRefSchema,
  used: z.boolean()
}).superRefine((entry, context) => {
  if (entry.completedAt < entry.startedAt) {
    context.addIssue({ code: "custom", message: "Research cannot complete before it starts", path: ["completedAt"] });
  }
  if (entry.step === "synth" && entry.searches !== 0) {
    context.addIssue({ code: "custom", message: "The synthesis step cannot report searches", path: ["searches"] });
  }
});

export type BhDossier = z.infer<typeof BhDossierSchema>;
export type BhDossierSynthesis = z.infer<typeof BhDossierSynthesisSchema>;
export type BhResearchLedgerEntry = z.infer<typeof BhResearchLedgerEntrySchema>;
