import { z } from "zod";

/**
 * The one thing the Tehdejsi svet desk reads.
 *
 * The venture markets a product this repository has no connection to: no workflow, CLI, clone,
 * token or API call reaches the product repository, which is named in the founding decision and
 * deliberately nowhere that runs. What crosses is a file a human copies here by hand, carrying
 * the era and history facts worth writing about and the source of each one. The room generates
 * from this file and from nothing else, so what the file refuses is what the venture can never
 * say.
 *
 * Three refusals are structural rather than checked at use, because a filter at use is a filter
 * someone can forget to call:
 *
 * - `shareSafe` is the literal `true`. The product marks records it considers unsafe to share —
 *   every leader profile among them — and those are omitted when the file is built. A `false`
 *   here is not a fact to skip later; it is a file that does not load.
 * - There is no media field at all. Excluded imagery cannot be referenced by a shape that has
 *   nowhere to put it, and a licensed photograph is attached by the Design Lab against its own
 *   licence record, never carried in from here.
 * - A tier-2 fact needs two independent sources. The founding decision makes human review
 *   blocking for those subjects; this makes single-sourcing impossible before review is reached.
 */
export const TehdejsiFactSourceSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url().nullable(),
  note: z.string().max(400).nullable()
}).strict();

export const TehdejsiFactSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  kind: z.enum(["everyday", "culture", "city", "price", "media", "event"]),
  country: z.enum(["cz", "ua"]),
  /** A place name in the form it held in the year the fact is about, or null for a whole country. */
  place: z.string().min(1).max(120).nullable(),
  yearFrom: z.number().int().min(1900).max(2030),
  yearTo: z.number().int().min(1900).max(2030),
  /** 0 everyday, 1 political context present, 2 the subjects human review must clear first. */
  sensitivityTier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  shareSafe: z.literal(true),
  text: z.string().min(20).max(600),
  sources: z.array(TehdejsiFactSourceSchema).min(1).max(6),
  /** The date a human last checked this against its sources. `null` is unknown, never "today". */
  verified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
}).strict().superRefine((fact, context) => {
  if (fact.yearTo < fact.yearFrom) {
    context.addIssue({ code: "custom", message: "yearTo precedes yearFrom", path: ["yearTo"] });
  }
  if (fact.sensitivityTier === 2 && fact.sources.length < 2) {
    context.addIssue({
      code: "custom",
      message: "A tier-2 fact needs two independent sources",
      path: ["sources"]
    });
  }
});
export type TehdejsiFact = z.infer<typeof TehdejsiFactSchema>;

export const TehdejsiFactsFileSchema = z.object({
  schemaVersion: z.literal("tehdejsi-facts/1"),
  /** Plain words about where these facts came from. Never a repository URL: nothing here reads one. */
  copiedFrom: z.string().min(1).max(300),
  copiedAt: z.iso.datetime({ offset: true }),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  facts: z.array(TehdejsiFactSchema).min(1)
}).strict().superRefine((file, context) => {
  const seen = new Set<string>();
  for (const [index, fact] of file.facts.entries()) {
    if (seen.has(fact.id)) {
      context.addIssue({ code: "custom", message: `Duplicate fact id ${fact.id}`, path: ["facts", index, "id"] });
    }
    seen.add(fact.id);
  }
});
export type TehdejsiFactsFile = z.infer<typeof TehdejsiFactsFileSchema>;
