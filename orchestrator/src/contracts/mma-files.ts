import { z } from "zod";
import { DateSchema, DateTimeSchema, HttpsUrlSchema, Sha256Schema, openObject } from "./common.js";
import { BoutRecordSchema, EventCardSchema, FightAiQStatsEntrySchema, FighterRecordSchema, MmaOrgSchema } from "./mma.js";
import { ArticleImageSchema } from "./autonomy.js";
import { LiveTemplateReferenceSchema } from "./carousel-template.js";

export const ArticleFormatSchema = z.enum([
  "fight-week-preview", "post-event-recap", "fighter-profile",
  "data-story", "weigh-in-report", "desk-notes"
]);

const LocalizationSchema = openObject({
  title: z.string().trim().min(1).max(160),
  dek: z.string().trim().min(1).max(320),
  /** The carousel cover line the desk wrote. Absent on every article written before it existed. */
  altHeadline: z.string().trim().min(1).max(90).optional(),
  /*
   * The words that travel with the deck, written by the desk that wrote the article.
   *
   * The `altHeadline` precedent, and `state/ventures/mma-files/social/ASSIGNMENT.md:5-8` names
   * this exact pattern for captions: the copy rides the article's own call, so no new paid call
   * site exists and nothing new touches the ledger. All four are optional, because every article
   * written before them still has to load.
   */
  igCaption: z.string().trim().min(1).max(500).optional(),
  hashtags: z.array(z.string().trim().min(2).max(30)).max(10).optional(),
  threadsText: z.string().trim().min(1).max(480).optional(),
  storyLine: z.string().trim().min(1).max(66).optional(),
  bodyMDX: z.string().trim().min(1).max(40_000),
  imageAlt: z.string().trim().min(1).max(300).optional()
});

const ArticleSourceSchema = z.discriminatedUnion("kind", [
  openObject({ kind: z.literal("internal"), ref: z.string().trim().min(1).max(240) }),
  openObject({ kind: z.literal("external"), url: HttpsUrlSchema, retrievedAt: DateTimeSchema })
]);

const FrameSpecSchema = openObject({
  template: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  bindings: z.record(z.string().min(1).max(80), z.union([z.string().max(1_000), z.number().finite(), z.boolean()]))
});

/**
 * The one way a published article may be replaced, and the proof that has to travel with it.
 *
 * A delivered package is immutable by date and slot, on both sides of the wire: the store here
 * refuses to overwrite a published slot and the consumer refuses any different bytes under one
 * identity. That is the guard that stops a delivered piece being quietly swapped, and it stands.
 *
 * It also made an image correction impossible. Two articles shipped in the first week carrying
 * photographs of the wrong thing — a government official above a bantamweight, a firearms range
 * above a fighter's retirement — and the only ways to fix them were to weaken the guard or to
 * edit the consumer repository by hand. This is the third way: a correction states which package
 * it replaces and why, and both ends independently check that everything except the picture is
 * byte-identical. The words a reader read cannot change through this door.
 */
export const ArticleImageCorrectionSchema = openObject({
  schemaVersion: z.literal("article-image-correction/1"),
  /** The delivered package this one replaces. Must be the hash the consumer currently holds. */
  supersedesPackageHash: Sha256Schema,
  reason: z.string().trim().min(1).max(300),
  correctedAt: DateTimeSchema
});

export type MmaFilesOrganization = z.infer<typeof MmaOrgSchema>;

export function mmaOrganizationFromRef(reference: string | undefined): MmaFilesOrganization | undefined {
  const prefix = reference?.split(":", 1)[0];
  return prefix === "ufc" || prefix === "oktagon" ? prefix : undefined;
}

/** The consumer uses this same priority: an event leads, otherwise the first fighter does. */
export function articleOrganizationFromRefs(value: {
  eventRef?: string;
  fighterRefs: readonly string[];
}): MmaFilesOrganization | undefined {
  return mmaOrganizationFromRef(value.eventRef ?? value.fighterRefs[0]);
}

export const ArticlePackageSchema = openObject({
  schemaVersion: z.literal("article/1"),
  /**
   * Present only on a package that replaces a delivered one, and only to change its picture.
   * Absent on every first delivery, which is all but two packages on file.
   */
  correction: ArticleImageCorrectionSchema.optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  // Czech is the published locale. English is optional rather than removed: openObject is
  // z.looseObject, so the two sealed live packages keep their en key through a round-trip and
  // go on hashing to the value store.ts already holds. A strict object would strip it, the
  // recomputed hash would not match, and MMA delivery selection would throw on every cycle.
  localizations: openObject({ en: LocalizationSchema.optional(), cs: LocalizationSchema }),
  /** Optional only so sealed packages written before category delivery keep identical hashes. */
  organization: MmaOrgSchema.optional(),
  format: ArticleFormatSchema,
  sources: z.array(ArticleSourceSchema).min(1),
  image: ArticleImageSchema,
  heroSpec: FrameSpecSchema,
  fighterRefs: z.array(z.string().regex(/^(ufc|oktagon):[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  eventRef: z.string().regex(/^(ufc|oktagon):event:[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  modelVersion: z.string().regex(/^mma-\d+\.\d+\.\d+\+[a-f0-9]{8}$/).optional(),
  publishAt: DateTimeSchema,
  slot: z.enum(["am", "pm"]),
  status: z.enum(["draft", "blocked", "published", "killed"]),
  packageHash: Sha256Schema
}).superRefine((article, context) => {
  const derived = articleOrganizationFromRefs(article);
  if (article.organization && derived && article.organization !== derived) {
    context.addIssue({
      code: "custom",
      message: `organization ${article.organization} contradicts ${article.eventRef ?? article.fighterRefs[0]}`,
      path: ["organization"]
    });
  }
});

const SocialVariantSchema = openObject({
  id: z.enum(["A", "B"]),
  carousel: openObject({
    en: LiveTemplateReferenceSchema.optional(),
    cs: LiveTemplateReferenceSchema
  }),
  captions: openObject({
    en: openObject({ instagram: z.string().trim().min(1).max(2_200), threads: z.string().trim().min(1).max(500) }).optional(),
    cs: openObject({ instagram: z.string().trim().min(1).max(2_200), threads: z.string().trim().min(1).max(500) })
  }),
  designAxes: openObject({
    templateFamily: z.string().trim().min(1).max(80),
    colorScheme: z.string().trim().min(1).max(80),
    headlineFraming: z.string().trim().min(1).max(120),
    captionTone: z.string().trim().min(1).max(120)
  })
});

export const SocialVariantPackSchema = openObject({
  schemaVersion: z.literal("social-variant/1"),
  articleRef: z.string().trim().min(1).max(240),
  variants: z.tuple([SocialVariantSchema, SocialVariantSchema]),
  assignmentProtocolRef: z.string().trim().min(1).max(240),
  status: z.enum(["draft", "queued", "archived"])
}).superRefine((pack, context) => {
  if (pack.variants[0].id !== "A" || pack.variants[1].id !== "B") context.addIssue({ code: "custom", message: "Social variants must be ordered A then B", path: ["variants"] });
});

const SlateSlotSchema = openObject({
  slot: z.enum(["am", "pm"]),
  /** New slates set this at assignment; optional so recorded historical slates still parse. */
  organization: MmaOrgSchema.optional(),
  format: ArticleFormatSchema,
  subjectRefs: z.array(z.string().trim().min(1).max(240)).min(1),
  rationale: z.string().trim().min(1).max(240).refine((value) => value.split(/\s+/u).length <= 30, "Rationale must be 30 words or fewer"),
  assignedWriter: z.enum(["JAB", "QUILL"]),
  status: z.enum(["assigned", "killed"]),
  killedReason: z.string().trim().min(1).max(240).optional()
}).superRefine((slot, context) => {
  if (slot.status === "killed" && !slot.killedReason) context.addIssue({ code: "custom", message: "Killed slots need a reason", path: ["killedReason"] });
  if (slot.status === "assigned" && slot.killedReason) context.addIssue({ code: "custom", message: "Assigned slots cannot carry a killed reason", path: ["killedReason"] });
});

/**
 * One VAULT verdict, and the evidence it stands on.
 *
 * `evidenceRef` used to be required, so a verdict with no evidence a reviewer could open had
 * exactly one way to validate: name something. A slate written from the editorial-slate fixture
 * cited `state/ideas/mma-files/ledger.jsonl`, a file this repository has never held, and it was
 * stored as the desk's own citation. A dead path is worse than an admitted gap, so a verdict now
 * carries either a ref or `unresolvedEvidence` — a note saying what was removed and why — and
 * never neither. Never both either: a ref that resolved leaves nothing unresolved, and a verdict
 * carrying both would let the note be decoration next to a ref no one checked.
 */
const VaultVerdictSchema = openObject({
  subjectRef: z.string().trim().min(1).max(240),
  verdict: z.enum(["fresh", "repeat"]),
  evidenceRef: z.string().trim().min(1).max(240).optional(),
  unresolvedEvidence: z.string().trim().min(1).max(240).optional()
}).superRefine((verdict, context) => {
  if (!verdict.evidenceRef && !verdict.unresolvedEvidence) context.addIssue({ code: "custom", message: "A verdict needs an evidenceRef, or a note saying why it has none", path: ["evidenceRef"] });
  if (verdict.evidenceRef && verdict.unresolvedEvidence) context.addIssue({ code: "custom", message: "A verdict that cites evidence has nothing unresolved to note", path: ["unresolvedEvidence"] });
});

export const EditorialSlateSchema = openObject({
  schemaVersion: z.literal("editorial-slate/1"),
  date: DateSchema,
  slots: z.tuple([SlateSlotSchema, SlateSlotSchema]),
  vaultVerdicts: z.array(VaultVerdictSchema).min(2)
}).superRefine((slate, context) => {
  if (slate.slots[0].slot !== "am" || slate.slots[1].slot !== "pm") context.addIssue({ code: "custom", message: "Editorial slots must be ordered am then pm", path: ["slots"] });
  const verdicts = new Map(slate.vaultVerdicts.map((verdict) => [verdict.subjectRef, verdict.verdict]));
  for (const [index, slot] of slate.slots.entries()) for (const subject of slot.subjectRefs) {
    if (!verdicts.has(subject)) context.addIssue({ code: "custom", message: "Every subject needs a VAULT verdict", path: ["slots", index, "subjectRefs"] });
    if (slot.status === "assigned" && verdicts.get(subject) === "repeat") context.addIssue({ code: "custom", message: "A repeated subject cannot be assigned", path: ["slots", index, "subjectRefs"] });
  }
});

export const FightAiQDeliverySchema = openObject({
  schemaVersion: z.literal("fightaiq-delivery/2"),
  generatedAt: DateTimeSchema,
  fighters: z.array(FighterRecordSchema),
  events: z.array(EventCardSchema),
  bouts: z.array(BoutRecordSchema),
  statsEntries: z.array(FightAiQStatsEntrySchema),
  packageHash: Sha256Schema
});

export type ArticlePackage = z.infer<typeof ArticlePackageSchema>;
export type SocialVariantPack = z.infer<typeof SocialVariantPackSchema>;
export type EditorialSlate = z.infer<typeof EditorialSlateSchema>;
export type FightAiQDelivery = z.infer<typeof FightAiQDeliverySchema>;
