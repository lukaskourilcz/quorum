import { z } from "zod";
import { DateSchema, DateTimeSchema } from "./common.js";

const SignalIdSchema = z.string().regex(/^ts-signal-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const HarvestIdSchema = z.string().regex(/^ts-signal-harvest-[a-f0-9]{20}$/);
const BoundedTextSchema = z.string().trim().min(1).max(600);

/**
 * Community comments are leads, never evidence. Keeping the classification and the only two
 * permitted uses inside every item prevents a later caller from treating a recollection as a
 * product fact merely because it arrived in a structured record.
 */
export const TehdejsiRecollectionSchema = z.strictObject({
  text: BoundedTextSchema,
  classification: z.literal("recollection-not-fact"),
  allowedUses: z.tuple([z.literal("research-question"), z.literal("prompt-seed")])
});

export const TehdejsiSignalHarvestSchema = z.strictObject({
  schemaVersion: z.literal("ts-signal/1"),
  kind: z.literal("harvest"),
  id: HarvestIdSchema,
  ventureId: z.literal("tehdejsi-svet"),
  source: z.literal("owner-paste"),
  sourceLabel: z.string().trim().min(1).max(120),
  pastedAt: DateTimeSchema,
  /** Text only: the route has no author, account, platform API or scrape fields. */
  comments: z.array(BoundedTextSchema).min(1).max(50)
}).superRefine((harvest, context) => {
  const normalized = harvest.comments.map((comment) => comment.toLocaleLowerCase("und"));
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({ code: "custom", message: "Duplicate pasted comment", path: ["comments"] });
  }
});

const RecurrenceSchema = z.strictObject({
  label: z.string().trim().min(1).max(120),
  recurrence: z.number().int().min(1).max(1_000),
  lastSeenAt: DateTimeSchema
});

export const TehdejsiSignalRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("city"),
    value: z.string().trim().min(1).max(120),
    recurrence: z.number().int().min(1).max(1_000),
    lastSeenAt: DateTimeSchema
  }),
  z.strictObject({
    kind: z.literal("year"),
    value: z.string().regex(/^(?:19|20)\d{2}$/),
    recurrence: z.number().int().min(1).max(1_000),
    lastSeenAt: DateTimeSchema
  })
]);

export const TehdejsiSignalDigestSchema = z.strictObject({
  schemaVersion: z.literal("ts-signal/1"),
  kind: z.literal("sunday-digest"),
  id: SignalIdSchema,
  ventureId: z.literal("tehdejsi-svet"),
  date: DateSchema,
  extractedAt: DateTimeSchema,
  sourceHarvestIds: z.array(HarvestIdSchema).min(1).max(200),
  recollections: z.array(TehdejsiRecollectionSchema).min(1).max(2_000),
  themes: z.array(RecurrenceSchema).max(200),
  requests: z.array(TehdejsiSignalRequestSchema).max(200),
  correctionClaims: z.array(TehdejsiRecollectionSchema).max(200)
}).superRefine((digest, context) => {
  for (const [path, values] of [
    ["sourceHarvestIds", digest.sourceHarvestIds],
    ["themes", digest.themes.map(({ label }) => label.toLocaleLowerCase("und"))],
    ["requests", digest.requests.map(({ kind, value }) => `${kind}:${value.toLocaleLowerCase("und")}`)],
    ["correctionClaims", digest.correctionClaims.map(({ text }) => text.toLocaleLowerCase("und"))]
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: `Duplicate ${path}`, path: [path] });
    }
  }
});

export const TehdejsiSignalSchema = z.discriminatedUnion("kind", [
  TehdejsiSignalHarvestSchema,
  TehdejsiSignalDigestSchema
]);

export type TehdejsiSignalHarvest = z.infer<typeof TehdejsiSignalHarvestSchema>;
export type TehdejsiSignalDigest = z.infer<typeof TehdejsiSignalDigestSchema>;
export type TehdejsiSignal = z.infer<typeof TehdejsiSignalSchema>;
