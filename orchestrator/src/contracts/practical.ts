import { z } from "zod";
import { DateSchema, HttpsUrlSchema, openObject } from "./common.js";

/**
 * The practical item: the one part of an edition a reader can act on the same morning.
 *
 * Everything else the edition carries is reporting — what happened, why it matters, what is
 * still unknown. This is the prompt, the tool or the term a reader forwards to a colleague, and
 * it is the part of a daily briefing readers come back for. It is optional everywhere and absent
 * is the normal state: a day whose sources documented nothing usable ships without it rather than
 * with something invented, which is the same posture the image ladder takes when no licensed
 * photograph exists.
 *
 * The delivered shape is the cross-repository contract the reader renders (aifirst#99,
 * `CONTRACTS.md` §2 of the November launch): one item, `type`, `title`, `text`, an optional `url`
 * and `verified_at`. It replaced a quorum-only `{ variant, items[] }` block that no reader could
 * parse; the Friday tools issue it carried is now the `friday-tools` social recipe, which reads the
 * week's items instead of asking one Friday edition for four (quorum#592).
 *
 * It lives in the article's frontmatter rather than at the package's top level, because the
 * delivery writes dated MDX and images and nothing else. A field outside the frontmatter would
 * never reach a reader.
 */
export const PRACTICAL_TYPES = ["prompt", "tool", "term"] as const;
export type PracticalType = (typeof PRACTICAL_TYPES)[number];

export const PRACTICAL_TITLE_MAXIMUM = 80;
/** A text short enough to be a headline is not an instruction anybody can follow. */
export const PRACTICAL_TEXT_MINIMUM = 40;
/** The reader's limit: long enough for a real prompt, short enough to stay an extra. */
export const PRACTICAL_TEXT_MAXIMUM = 400;

/** What the writing desk files: the item and the approved source that documents it. */
export const PracticalFiledSchema = openObject({
  type: z.enum(PRACTICAL_TYPES),
  title: z.string().trim().min(1).max(PRACTICAL_TITLE_MAXIMUM),
  text: z.string().trim().min(PRACTICAL_TEXT_MINIMUM).max(PRACTICAL_TEXT_MAXIMUM),
  source_url: HttpsUrlSchema
});
export type PracticalFiled = z.infer<typeof PracticalFiledSchema>;

/** The item as the frontmatter carries it, and as the reader validates it. */
export type PracticalShape = {
  type: PracticalType;
  title: string;
  text: string;
  url?: string;
  verified_at?: string;
};

/** The rules the item obeys wherever it is attached. One list for the schema and the boundary. */
export function practicalShapeErrors(item: PracticalShape): string[] {
  const errors: string[] = [];
  if (item.type === "tool" && !item.url) errors.push("a practical tool needs the url that documents it");
  if (item.url && !item.verified_at) errors.push("a practical item with a url needs verified_at");
  if (/https?:\/\//iu.test(`${item.title} ${item.text}`)) {
    errors.push(`practical item "${item.title}" carries a link in its text; url is the only URL`);
  }
  return errors;
}

export const PracticalSchema = openObject({
  type: z.enum(PRACTICAL_TYPES),
  title: z.string().trim().min(1).max(PRACTICAL_TITLE_MAXIMUM),
  text: z.string().trim().min(PRACTICAL_TEXT_MINIMUM).max(PRACTICAL_TEXT_MAXIMUM),
  url: HttpsUrlSchema.optional(),
  verified_at: DateSchema.optional()
}).superRefine((item, context) => {
  for (const message of practicalShapeErrors(item)) context.addIssue({ code: "custom", message });
});

export type Practical = z.infer<typeof PracticalSchema>;

export interface PracticalGroundingInput {
  practical: PracticalShape;
  /** The edition's own date: nothing can be verified after the day it ships. */
  date: string;
  /** Every URL the edition can prove: its cited sources and its Watchlist. */
  groundedUrls: ReadonlySet<string>;
}

/**
 * Everything wrong with an item on the edition it is attached to, or an empty list.
 *
 * Grounding is the rule that matters. A tool tip whose source is a URL the edition does not
 * carry is a recommendation from memory, and a magazine that fabricates one source has
 * fabricated all of them as far as a reader can tell. `verified_at` is the edition's date because
 * that is the day the source was read; a later date would claim a check that has not happened.
 */
export function practicalErrors(input: PracticalGroundingInput): string[] {
  const errors = practicalShapeErrors(input.practical);
  if (input.practical.url && !input.groundedUrls.has(input.practical.url)) {
    errors.push(
      `practical item "${input.practical.title}" cites ${input.practical.url}, which the edition carries neither as a source nor on the Watchlist`
    );
  }
  if (input.practical.verified_at && input.practical.verified_at > input.date) {
    errors.push(`practical item "${input.practical.title}" is verified on ${input.practical.verified_at}, after its edition of ${input.date}`);
  }
  return errors;
}

/** The delivered item for a filed one: the source becomes the url, checked on the edition's day. */
export function deliveredPractical(filed: PracticalFiled, date: string): PracticalShape {
  return { type: filed.type, title: filed.title.trim(), text: filed.text.trim(), url: filed.source_url, verified_at: date };
}
