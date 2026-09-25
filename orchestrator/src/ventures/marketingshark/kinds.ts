import { QUIZ_SLIDE_ROLES } from "@boardlessai/carousel-studio";

/**
 * What marketingShark can draft on a given day (quorum#576).
 *
 * The room began with one kind, the quiz carousel. The envelope is still one paid call per brand
 * per day, so variety comes from rotating the kind by weekday rather than from more calls. Every
 * kind is a five-slide carousel with three captions, so the frames, the queue drafts, the asset
 * gate and the publisher treat them alike; what differs is where each slide's words come from.
 */
export const POST_KINDS = ["quiz", "feature-spotlight", "challenge-teaser", "this-week", "announcement"] as const;
export type PostKind = (typeof POST_KINDS)[number];

/** The kinds the weekday rotation may name. The launch announcement is the owner's, on the day they choose. */
export const ROTATION_KINDS = ["quiz", "feature-spotlight", "challenge-teaser", "this-week"] as const;
export type RotationKind = (typeof ROTATION_KINDS)[number];

/** Every kind but the quiz, which keeps its own question-and-hook path. */
export type PostDeckKind = Exclude<PostKind, "quiz">;

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Each kind's five slides, in order. Position is meaning: templates, frames and alt text follow it. */
export const POST_KIND_ROLES = {
  quiz: QUIZ_SLIDE_ROLES,
  "feature-spotlight": ["hook", "what", "how", "why", "footer"],
  "challenge-teaser": ["hook", "prompt", "hint", "try", "footer"],
  "this-week": ["hook", "theme", "recap", "pick", "footer"],
  announcement: ["hook", "news", "detail", "next", "footer"]
} as const satisfies Record<PostKind, readonly [string, string, string, string, string]>;

export type PostRole<K extends PostKind = PostKind> = (typeof POST_KIND_ROLES)[K][number];

export type CopyField = "headline" | "body";

/**
 * Which fields on which slides the writer fills; every other field is code's.
 *
 * Code owns what it already knows as fact — slide 1, the footer line, a challenge's prompt and first
 * hint, the week's recap — so the model is never asked to copy a fact it could misquote. The
 * announcement is the exception: the owner writes all five slides by hand.
 */
export const WRITER_FIELDS: { readonly [K in PostDeckKind]: Partial<Record<PostRole<K>, readonly CopyField[]>> } = {
  "feature-spotlight": { what: ["headline", "body"], how: ["headline", "body"], why: ["headline", "body"] },
  "challenge-teaser": { try: ["headline", "body"] },
  "this-week": { theme: ["body"], pick: ["headline", "body"] },
  announcement: {
    hook: ["headline", "body"],
    news: ["headline", "body"],
    detail: ["headline", "body"],
    next: ["headline", "body"],
    footer: ["headline", "body"]
  }
};

/** The roles a writer returns for a kind, in slide order. */
export function writerRoles<K extends PostDeckKind>(kind: K): Array<PostRole<K>> {
  const fields = WRITER_FIELDS[kind] as Partial<Record<string, readonly CopyField[]>>;
  return (POST_KIND_ROLES[kind] as readonly string[]).filter((role) => fields[role] !== undefined) as Array<PostRole<K>>;
}

/**
 * The placeholders a kind's slide-1 pattern may name. Each is a fact code fills from a source it
 * holds, so a filled pattern claims nothing its kind has not already established.
 */
export const HOOK_PATTERN_SLOTS = {
  "feature-spotlight": ["displayName", "screen"],
  "challenge-teaser": ["difficulty", "title"],
  "this-week": ["displayName"]
} as const;

/** The weekday of a calendar date, read as the date itself and not as an instant in any zone. */
export function weekdayOf(date: string): Weekday {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  if (Number.isNaN(day)) throw new Error(`${date} is not a calendar date`);
  return WEEKDAYS[(day + 6) % 7]!;
}

/** Whole weeks since the Monday 1970-01-05, so a weekly rotation turns over on Mondays. */
export function weekIndexOf(date: string): number {
  const days = Math.floor((Date.parse(`${date}T12:00:00.000Z`) - Date.parse("1970-01-05T12:00:00.000Z")) / 86_400_000);
  return Math.floor(days / 7);
}

/** Fill `{slot}` placeholders; an unknown slot stays visible so a gate can name it. */
export function fillPattern(pattern: string, values: Readonly<Record<string, string>>): string {
  return pattern.replace(/\{([a-zA-Z]+)\}/gu, (whole, slot: string) => values[slot] ?? whole);
}
