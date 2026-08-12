import { z } from "zod";
import { DateTimeSchema } from "./common.js";

/**
 * What the desk bought, and whether anything ever used it.
 *
 * The ledger is append-only JSONL, which is what makes it a ledger: a line that can be rewritten
 * is a line that can be made to say the spend never happened. So "this dossier was used" is not
 * a flag flipped on the purchase — it is a second append that points back at it. Usage becomes a
 * query over the file rather than a mutation of it, and the file keeps the property that makes
 * it worth having.
 *
 * The two ceilings are carried here rather than in a comment: no single brief above `$0.30` and
 * no month above `$2.00`, both inside the venture's `$4.00` target and the standing `$30`
 * all-in operating cap. A schema that accepts a cost it is not allowed to spend is a schema that
 * will eventually record one.
 */
export const TS_RESEARCH_BRIEF_CEILING_USD = 0.3;
export const TS_RESEARCH_MONTHLY_CEILING_USD = 2;

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const StatePathSchema = z.string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^state\/[a-zA-Z0-9._/-]+$/)
  .refine((value) => !value.includes(".."), "State paths cannot traverse directories");

/**
 * A purchase: one provider call, one brief, one dossier.
 *
 * `topicKey` and `briefHash` together are the idempotency key. The topic says what was asked
 * about and the hash says exactly what was asked, so a brief whose wording changed is a
 * different purchase and a brief that did not change is never bought twice.
 */
export const TsResearchPurchaseSchema = z.strictObject({
  schemaVersion: z.literal("ts-research-ledger/1"),
  kind: z.literal("purchase"),
  topicKey: SlugSchema,
  briefHash: z.string().regex(/^[a-f0-9]{64}$/),
  cycleId: z.string().min(1).max(120),
  provider: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(160),
  startedAt: DateTimeSchema,
  completedAt: DateTimeSchema,
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  searches: z.number().int().min(0).max(8),
  costUsd: z.number().min(0).max(TS_RESEARCH_BRIEF_CEILING_USD),
  dossierRef: StatePathSchema
}).superRefine((entry, context) => {
  if (entry.completedAt < entry.startedAt) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "Research cannot complete before it starts" });
  }
});

/**
 * A use: a package cited a dossier this ledger paid for.
 *
 * It costs nothing and is recorded anyway, because the question the ledger has to answer at the
 * end of a month is not "what did we spend" but "what did the spend buy". A purchase with no use
 * beside it is the venture's own evidence that a brief priority was wrong.
 */
export const TsResearchUseSchema = z.strictObject({
  schemaVersion: z.literal("ts-research-ledger/1"),
  kind: z.literal("use"),
  topicKey: SlugSchema,
  briefHash: z.string().regex(/^[a-f0-9]{64}$/),
  at: DateTimeSchema,
  /** The recommendation that cited it. */
  recommendationId: SlugSchema
});

export const TsResearchLedgerEntrySchema = z.discriminatedUnion("kind", [
  TsResearchPurchaseSchema,
  TsResearchUseSchema
]);

export type TsResearchPurchase = z.infer<typeof TsResearchPurchaseSchema>;
export type TsResearchUse = z.infer<typeof TsResearchUseSchema>;
export type TsResearchLedgerEntry = z.infer<typeof TsResearchLedgerEntrySchema>;

/**
 * A standing brief priority: what the desk would research next if it were researching anything.
 *
 * Data rather than prose, so the order is reviewable in a diff and the desk cannot quietly
 * re-rank it. `rank` is what the desk works through; `rationale` is why a reviewer should agree.
 */
export const TsBriefPrioritySchema = z.strictObject({
  topicKey: SlugSchema,
  rank: z.number().int().min(1).max(20),
  question: z.string().trim().min(20).max(400),
  language: z.enum(["cs", "uk", "both"]),
  rationale: z.string().trim().min(20).max(400)
});

export const TsBriefPrioritiesSchema = z.strictObject({
  schemaVersion: z.literal("ts-brief-priorities/1"),
  _comment: z.string().optional(),
  priorities: z.array(TsBriefPrioritySchema).min(1).max(20)
}).superRefine((file, context) => {
  const ranks = file.priorities.map((priority) => priority.rank);
  if (JSON.stringify([...ranks].sort((a, b) => a - b)) !== JSON.stringify(ranks.map((_, index) => index + 1))) {
    context.addIssue({ code: "custom", path: ["priorities"], message: "Ranks must be unique and sequential from 1" });
  }
  const keys = file.priorities.map((priority) => priority.topicKey);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["priorities"], message: "A topic appears twice" });
  }
});

export type TsBriefPriority = z.infer<typeof TsBriefPrioritySchema>;
export type TsBriefPriorities = z.infer<typeof TsBriefPrioritiesSchema>;
