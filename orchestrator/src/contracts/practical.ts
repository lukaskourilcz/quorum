import { z } from "zod";
import { HttpsUrlSchema, openObject } from "./common.js";

/**
 * The practical block: the one part of an edition a reader can act on the same morning.
 *
 * Everything else the edition carries is reporting — what happened, why it matters, what is
 * still unknown. This is the prompt, the tool or the how-to a reader forwards to a colleague,
 * and it is the part of a daily briefing readers come back for. It is optional everywhere and
 * absent is the normal state: a day whose sources documented nothing usable ships without it
 * rather than with something invented, which is the same posture the image ladder takes when
 * no licensed photograph exists.
 *
 * It lives in the article's frontmatter rather than at the package's top level, because the
 * delivery writes dated MDX and images and nothing else. A field outside the frontmatter would
 * never reach a reader.
 */
export const PRACTICAL_KINDS = ["prompt", "tool", "howto"] as const;
export type PracticalKind = (typeof PRACTICAL_KINDS)[number];

/**
 * Which shape a day carries. `daily` is one item of any kind; `friday-tools` is the Friday
 * tools issue. The variant is decided by the edition's own date, never by the desk, so nothing
 * can declare a Tuesday a Friday to file four items instead of one.
 */
export const PRACTICAL_VARIANTS = ["daily", "friday-tools"] as const;
export type PracticalVariant = (typeof PRACTICAL_VARIANTS)[number];

export const PRACTICAL_TITLE_MAXIMUM = 80;
/** A body short enough to be a headline is not an instruction anybody can follow. */
export const PRACTICAL_BODY_MINIMUM = 40;
/** Long enough for a real prompt, short enough that it stays an extra rather than a second article. */
export const PRACTICAL_BODY_MAXIMUM = 600;

export const FRIDAY_TOOLS = 3;
export const FRIDAY_PROMPTS = 1;
export const PRACTICAL_ITEMS_MAXIMUM = FRIDAY_TOOLS + FRIDAY_PROMPTS;

export const PracticalItemSchema = openObject({
  kind: z.enum(PRACTICAL_KINDS),
  title: z.string().trim().min(1).max(PRACTICAL_TITLE_MAXIMUM),
  body: z.string().trim().min(PRACTICAL_BODY_MINIMUM).max(PRACTICAL_BODY_MAXIMUM),
  /** The approved source that documents the item. Its grounding is checked at delivery. */
  source_url: HttpsUrlSchema
});

export type PracticalItem = z.infer<typeof PracticalItemSchema>;

/** The block as the producer builds it, before it is parsed back out of a package. */
export type PracticalBlockShape = {
  variant: PracticalVariant;
  items: PracticalItem[];
};

/**
 * The rules a block obeys whatever date it is attached to.
 *
 * Kept as a function rather than as zod refinements so the package schema, the writing desk
 * and the delivery boundary all read one list. A rule stated twice is two rules that will
 * disagree the first time one of them is edited.
 */
export function practicalShapeErrors(block: PracticalBlockShape): string[] {
  const errors: string[] = [];
  if (block.variant === "daily" && block.items.length !== 1) {
    errors.push(`a daily practical block carries one item, not ${block.items.length}`);
  }
  if (block.variant === "friday-tools") {
    const tools = block.items.filter((item) => item.kind === "tool").length;
    const prompts = block.items.filter((item) => item.kind === "prompt").length;
    if (tools !== FRIDAY_TOOLS || prompts !== FRIDAY_PROMPTS) {
      errors.push(
        `the Friday tools issue carries ${FRIDAY_TOOLS} tools and ${FRIDAY_PROMPTS} prompt, not ${tools} and ${prompts}`
      );
    }
  }
  const titles = block.items.map((item) => item.title.trim().toLocaleLowerCase("cs"));
  if (new Set(titles).size !== titles.length) {
    errors.push("two practical items share a title");
  }
  return errors;
}

export const PracticalBlockSchema = openObject({
  variant: z.enum(PRACTICAL_VARIANTS),
  items: z.array(PracticalItemSchema).min(1).max(PRACTICAL_ITEMS_MAXIMUM)
}).superRefine((block, context) => {
  for (const message of practicalShapeErrors(block)) {
    context.addIssue({ code: "custom", message });
  }
});

export type PracticalBlock = z.infer<typeof PracticalBlockSchema>;

/**
 * Whether a publishing date is a Friday.
 *
 * The date is the edition's own `YYYY-MM-DD`, a Prague publishing day by contract, and it is
 * read at noon UTC the way every other weekday question in this repository is read. Nothing
 * here consults a clock: the same date always answers the same way, on any machine, in any
 * month, which is what keeps a package hash reproducible.
 */
export function isFridayEdition(date: string): boolean {
  const at = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(at.getTime())) throw new Error(`practical: invalid edition date: ${date}`);
  return at.getUTCDay() === 5;
}

export function practicalVariantForDate(date: string): PracticalVariant {
  return isFridayEdition(date) ? "friday-tools" : "daily";
}

export interface PracticalGroundingInput {
  block: PracticalBlockShape;
  /** The edition's own date, which decides which variant the day is allowed to carry. */
  date: string;
  /** Every URL the edition can prove: its cited sources and its Watchlist. */
  groundedUrls: ReadonlySet<string>;
}

/**
 * Everything wrong with a block on the edition it is attached to, or an empty list.
 *
 * Grounding is the rule that matters. A tool tip whose source is a URL the edition does not
 * carry is a recommendation from memory, and a magazine that fabricates one source has
 * fabricated all of them as far as a reader can tell. A Friday shape on a Wednesday is the
 * other way the block can lie about itself.
 *
 * A `daily` block on a Friday is not an error: it is the honest fallback for a Friday whose
 * sources documented one usable thing instead of four.
 */
export function practicalBlockErrors(input: PracticalGroundingInput): string[] {
  const errors = practicalShapeErrors(input.block);
  if (input.block.variant === "friday-tools" && !isFridayEdition(input.date)) {
    errors.push(`the Friday tools issue is dated ${input.date}, which is not a Friday`);
  }
  for (const item of input.block.items) {
    if (!input.groundedUrls.has(item.source_url)) {
      errors.push(
        `practical item "${item.title}" cites ${item.source_url}, which the edition carries neither as a source nor on the Watchlist`
      );
    }
    if (/https?:\/\//iu.test(`${item.title} ${item.body}`)) {
      errors.push(`practical item "${item.title}" carries a link in its text; source_url is the only URL`);
    }
  }
  return errors;
}
