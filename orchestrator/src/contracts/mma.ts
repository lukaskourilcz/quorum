import { z } from "zod";
import {
  DateTimeSchema,
  HttpsUrlSchema,
  Sha256Schema,
  openObject
} from "./common.js";

export const MmaOrgSchema = z.enum(["ufc", "ksw", "oktagon"]);
export const MmaFieldStatusSchema = z.enum(["verified", "provisional", "disputed"]);

const FieldValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number().finite(), z.boolean()]))
]);

export const SourcedFieldSchema = openObject({
  value: FieldValueSchema,
  sourceRefs: z.array(z.string().trim().min(1).max(240)).min(1),
  retrievedAt: DateTimeSchema,
  status: MmaFieldStatusSchema,
  corroborated: z.boolean()
});

const DiscrepancySchema = openObject({
  field: z.string().trim().min(1).max(80),
  values: z.array(openObject({ value: FieldValueSchema, sourceRef: z.string().trim().min(1) })).min(2),
  status: z.enum(["open", "resolved"]),
  resolution: z.string().trim().min(1).max(280).optional()
});

export const FighterRecordSchema = openObject({
  schemaVersion: z.literal("fighter-record/1"),
  id: z.string().regex(/^(ufc|ksw|oktagon):[a-z0-9]+(?:-[a-z0-9]+)*$/),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  org: MmaOrgSchema,
  fields: z.record(z.string().min(1), SourcedFieldSchema),
  criticalFields: z.array(z.string().trim().min(1)).min(1),
  discrepancies: z.array(DiscrepancySchema),
  completeness: z.number().finite().min(0).max(1),
  corroboration: z.number().finite().min(0).max(1),
  modelEligible: z.boolean(),
  modelVersion: z.string().trim().min(1),
  updatedAt: DateTimeSchema
}).superRefine((record, context) => {
  if (record.id !== `${record.org}:${record.slug}`) {
    context.addIssue({ code: "custom", message: "Fighter id must match org and slug", path: ["id"] });
  }
  const openFields = new Set(record.discrepancies.filter((item) => item.status === "open").map((item) => item.field));
  let eligible = true;
  for (const fieldName of record.criticalFields) {
    const field = record.fields[fieldName];
    if (!field || field.sourceRefs.length < 2 || !field.corroborated || field.status !== "verified" || openFields.has(fieldName)) {
      eligible = false;
    }
  }
  if (record.modelEligible !== eligible) {
    context.addIssue({ code: "custom", message: "modelEligible must reflect critical-field corroboration", path: ["modelEligible"] });
  }
});

const FighterRefSchema = z.string().regex(/^(ufc|ksw|oktagon):[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const EventCardSchema = openObject({
  schemaVersion: z.literal("event-card/1"),
  id: z.string().regex(/^(ufc|ksw|oktagon):event:[a-z0-9]+(?:-[a-z0-9]+)*$/),
  org: MmaOrgSchema,
  name: z.string().trim().min(1).max(160),
  venue: z.string().trim().min(1).max(160),
  startsAtLocal: DateTimeSchema,
  timeZone: z.string().trim().min(1).max(80),
  startsAtUtc: DateTimeSchema,
  sourceRefs: z.array(z.string().trim().min(1)).min(1),
  bouts: z.array(openObject({
    id: z.string().trim().min(1).max(160),
    red: FighterRefSchema,
    blue: FighterRefSchema,
    division: z.string().trim().min(1).max(80),
    scheduledRounds: z.union([z.literal(3), z.literal(5)]),
    status: z.enum(["announced", "weigh-in", "complete", "cancelled"])
  })).min(1),
  updatedAt: DateTimeSchema
});

export const OddsSnapshotSchema = openObject({
  schemaVersion: z.literal("odds-snapshot/1"),
  boutRef: z.string().trim().min(1),
  phase: z.enum(["t3", "t1", "closing"]),
  source: z.enum(["odds-api", "owner-entry"]),
  market: z.string().trim().min(1).max(80),
  prices: z.array(openObject({ pick: z.string().trim().min(1), decimal: z.number().finite().gt(1) })).min(2),
  capturedAt: DateTimeSchema
});

export const AdjustmentEntrySchema = openObject({
  schemaVersion: z.literal("adjustment-entry/1"),
  boutRef: z.string().trim().min(1),
  author: z.literal("TAPE"),
  deltaPct: z.number().finite().min(-3).max(3),
  direction: z.enum(["red", "blue"]),
  evidenceRef: z.string().trim().min(1).max(240),
  expiresAt: DateTimeSchema
});

const ProbabilitySetSchema = openObject({
  redWin: z.number().finite().min(0).max(1),
  blueWin: z.number().finite().min(0).max(1),
  method: openObject({ koTko: z.number().finite().min(0).max(1), submission: z.number().finite().min(0).max(1), decision: z.number().finite().min(0).max(1) }),
  uncertainty: z.enum(["clear-lean", "lean", "coin-flip", "divergence"]),
  marketRedWin: z.number().finite().min(0).max(1).optional(),
  blendedRedWin: z.number().finite().min(0).max(1)
}).superRefine((probabilities, context) => {
  if (Math.abs(probabilities.redWin + probabilities.blueWin - 1) > 0.000001) {
    context.addIssue({ code: "custom", message: "Win probabilities must sum to one" });
  }
  const methodTotal = probabilities.method.koTko + probabilities.method.submission + probabilities.method.decision;
  if (Math.abs(methodTotal - 1) > 0.000001) {
    context.addIssue({ code: "custom", message: "Method probabilities must sum to one", path: ["method"] });
  }
});

export const ModelRunSchema = openObject({
  schemaVersion: z.literal("model-run/1"),
  modelVersion: z.string().regex(/^mma-\d+\.\d+\.\d+\+[a-f0-9]{8}$/),
  inputsHash: Sha256Schema,
  configHash: Sha256Schema,
  bouts: z.array(openObject({
    boutRef: z.string().trim().min(1),
    probabilities: ProbabilitySetSchema,
    adjustmentsApplied: z.array(AdjustmentEntrySchema),
    excludedInputs: z.array(z.string().trim().min(1))
  })).min(1),
  createdAt: DateTimeSchema
});

export const EdgeReportSchema = openObject({
  schemaVersion: z.literal("edge-report/1"),
  eventRef: z.string().trim().min(1),
  modelRunRef: z.string().trim().min(1),
  bouts: z.array(openObject({
    boutRef: z.string().trim().min(1),
    modelProbability: z.number().finite().min(0).max(1),
    marketProbability: z.number().finite().min(0).max(1).nullable(),
    divergence: z.number().finite().min(-1).max(1).nullable(),
    recommendation: z.string().trim().min(1).max(240)
  })).min(1),
  calibrationContext: z.string().trim().min(1).max(280),
  generatedAt: DateTimeSchema
});

export const BetTypeSchema = z.enum([
  "moneyline",
  "ko_tko",
  "submission",
  "decision",
  "round_exact",
  "ends_before_round",
  "over_under_rounds",
  "goes_distance"
]);

const ConcretePickSchema = openObject({
  boutRef: z.string().trim().min(1),
  betType: BetTypeSchema,
  pick: z.string().trim().min(1),
  modelProb: z.number().finite().gt(0).lt(1),
  fairOdds: z.number().finite().gt(1),
  bookOdds: z.number().finite().gt(1).optional()
});

const SlipLegSchema = ConcretePickSchema.extend({
  note: z.string().trim().min(1).max(180).refine((value) => value.split(/\s+/).length <= 25, "Slip note must be 25 words or fewer"),
  coverage: z.enum(["single", "both-corners"]),
  secondPick: openObject({
    pick: z.string().trim().min(1),
    modelProb: z.number().finite().gt(0).lt(1),
    fairOdds: z.number().finite().gt(1),
    bookOdds: z.number().finite().gt(1).optional()
  }).optional()
}).superRefine((leg, context) => {
  if ((leg.coverage === "both-corners") !== Boolean(leg.secondPick)) {
    context.addIssue({ code: "custom", message: "Both-corners legs require exactly one second pick", path: ["secondPick"] });
  }
});

export const SlipOfTenSchema = openObject({
  schemaVersion: z.literal("slip-of-ten/1"),
  eventRefs: z.array(z.string().trim().min(1)).min(1),
  modelRunRefs: z.array(z.string().trim().min(1)).min(1),
  legs: z.array(SlipLegSchema).length(10),
  tickets: z.array(openObject({
    id: z.string().trim().min(1),
    picks: z.array(ConcretePickSchema).length(10),
    combinedFairProbability: z.number().finite().gt(0).lt(1),
    combinedFairOdds: z.number().finite().gt(1)
  })).min(1).max(4),
  expectedLossLine: z.string().trim().min(1).max(280),
  stakeGuidance: z.literal("Entertainment only. Keep the total stake to a few dollars and never chase a loss."),
  generatedAt: DateTimeSchema
}).superRefine((slip, context) => {
  const splitLegs = slip.legs.filter((leg) => leg.coverage === "both-corners").length;
  if (splitLegs > 2) context.addIssue({ code: "custom", message: "At most two legs may cover both corners", path: ["legs"] });
  if (slip.tickets.length !== 2 ** splitLegs) context.addIssue({ code: "custom", message: "Ticket count must expand every both-corners leg", path: ["tickets"] });
});

export const TrackRecordSchema = openObject({
  schemaVersion: z.literal("track-record/1"),
  picks: z.array(openObject({
    id: z.string().trim().min(1),
    modelVersion: z.string().trim().min(1),
    org: MmaOrgSchema,
    predicted: z.number().finite().min(0).max(1),
    closing: z.number().finite().min(0).max(1).nullable(),
    result: z.enum(["win", "loss", "void", "pending"]),
    clv: z.number().finite().nullable(),
    brierContribution: z.number().finite().min(0).max(1).nullable(),
    publishedAt: DateTimeSchema
  })),
  rollups: z.array(openObject({ modelVersion: z.string().trim().min(1), org: MmaOrgSchema, picks: z.number().int().nonnegative(), brier: z.number().finite().min(0).max(1).nullable(), meanClv: z.number().finite().nullable() })),
  updatedAt: DateTimeSchema
});

export const BetTypeCatalogSchema = openObject({
  schemaVersion: z.literal("bet-type-catalog/1"),
  types: z.array(openObject({ id: BetTypeSchema, label: z.string().trim().min(1), plainExplanation: z.string().trim().min(1), ownerVerified: z.boolean() })).min(1),
  verifiedAt: DateTimeSchema.nullable()
});

export const SourceProposalSchema = openObject({
  schemaVersion: z.literal("source-proposal/1"),
  author: z.literal("SONAR"),
  url: HttpsUrlSchema,
  coverage: z.string().trim().min(1).max(280),
  dataOffered: z.array(z.string().trim().min(1)).min(1),
  accessMethod: z.enum(["api", "html", "rss", "dataset"]),
  tosVerdict: openObject({ status: z.enum(["allowed", "forbidden", "unclear"]), rationale: z.string().trim().min(1).max(400) }),
  costUsd: z.number().finite().nonnegative(),
  overlapNotes: z.string().trim().min(1).max(280),
  corroborationValue: z.string().trim().min(1).max(280),
  status: z.enum(["proposed", "approved", "rejected", "wired"]),
  checkedAt: DateTimeSchema
});

export type FighterRecord = z.infer<typeof FighterRecordSchema>;
export type EventCard = z.infer<typeof EventCardSchema>;
export type ModelRun = z.infer<typeof ModelRunSchema>;
export type SlipOfTen = z.infer<typeof SlipOfTenSchema>;
