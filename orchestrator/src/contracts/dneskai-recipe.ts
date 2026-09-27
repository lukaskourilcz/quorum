import { z } from "zod";
import { LiveTemplateReferenceSchema } from "./carousel-template.js";
import { DateSchema, HttpsUrlSchema, Sha256Schema } from "./common.js";

/**
 * `dneskai-recipe/1` — a DNESKAi social post that is not one edition's carousel (quorum#592).
 *
 * The November plan gives DNESKAi four posts a week that no single edition produces: the Friday
 * tools carousel, the Sunday recap, the Saturday "how it was made" card, and a post on a day the
 * desk published nothing. Each is a deterministic template over records the company already keeps —
 * the week's packs and summaries, a meeting transcript, the budget ledger, the reader's own lesson —
 * so none costs anything and none says what its sources do not.
 *
 * The package is what a queue draft binds by hash. It records every rendered frame as
 * `{ path, sha256 }`, which is how the publisher's asset gate proves an approved package's frames.
 */
export const DNESKAI_RECIPES = ["friday-tools", "weekly-recap", "how-it-was-made", "no-edition"] as const;
export type DneskaiRecipe = (typeof DNESKAI_RECIPES)[number];

/** Left in a caption for the owner to replace; an approval refuses copy that still carries one. */
export const OWNER_SLOT_MARKER = "[DOPLNIT";

const FramePath = z.string().regex(/^\/social\/caught-up\/\d{4}-\d{2}-\d{2}\/[a-z-]+\/[a-z0-9-]+\.(?:jpg|png)$/u);

export const DneskaiRecipePackageSchema = z.strictObject({
  schemaVersion: z.literal("dneskai-recipe/1"),
  id: z.string().regex(/^dneskai-[a-z-]+-\d{4}-\d{2}-\d{2}$/u),
  recipe: z.enum(DNESKAI_RECIPES),
  date: DateSchema,
  /** The days the post draws on, inclusive. */
  window: z.strictObject({ from: DateSchema, to: DateSchema }),
  /** The records it was built from, as repository paths or URLs a reviewer can open. */
  sourceRefs: z.array(z.string().min(1).max(240)).min(1).max(20),
  slides: z.array(z.strictObject({ text: z.string().trim().min(1).max(400), alt: z.string().trim().min(1).max(300) })).min(1).max(10),
  visual: LiveTemplateReferenceSchema,
  /** Instagram's JPEG frames in slide order. */
  frames: z.array(z.strictObject({ path: FramePath, sha256: Sha256Schema })).min(1).max(10),
  /** A 1080 × 1920 story of the same post, for manual posting only. */
  story: z.strictObject({ frame: z.strictObject({ path: FramePath, sha256: Sha256Schema }), link: HttpsUrlSchema }).optional(),
  destination: HttpsUrlSchema,
  instagram: z.strictObject({ caption: z.string().trim().min(1).max(2_200) }),
  threads: z.strictObject({ text: z.string().trim().min(1).max(500) }),
  /** Facts the owner has to add before approving, named; the caption carries a marker for each. */
  ownerSlots: z.array(z.strictObject({ label: z.string().min(1).max(120) })).max(5),
  status: z.literal("draft"),
  spendUsd: z.literal(0)
});

export type DneskaiRecipePackage = z.infer<typeof DneskaiRecipePackageSchema>;
