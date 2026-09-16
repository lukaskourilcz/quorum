import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema } from "./common.js";

/**
 * The owner's weekly brief as a document, in a fixed order that never varies.
 *
 * The brief already existed as a `marketing-plan/1`: a machine artifact five desks parse
 * `Trend call:` lines out of. That stays exactly as it is. This is the other half — the thing the
 * owner reads — and it is a separate contract because a plan cannot carry what makes a brief fast
 * to read: a fixed section order, a reading time, numbered opportunities and a section that is
 * required to be there even when nobody objected.
 *
 * Trends.vc's order is the skeleton (Problem, Solution, Players, Predictions, Opportunities, Key
 * Lessons, Haters, Links). Marketing Examples' 3-2-1 rhythm is a cap rather than a shape: three
 * opportunities, two lessons and one thing to start with, so the brief cannot grow into the thing
 * it exists to replace. The one is `opportunities[0]`, printed at the top of the rendered document
 * and derived from the numbering rather than chosen — a favourite nobody can recompute is a
 * favourite nobody can check. Haters is the uncertainty note and is mandatory: a week where nothing
 * was doubted is a week where nobody wrote the doubt down, not a week without doubt.
 */

export const GOVIRAL_BRIEF_SECTION_KEYS = [
  "problem",
  "solution",
  "players",
  "predictions",
  "opportunities",
  "key-lessons",
  "haters",
  "links"
] as const;

export type GoViralBriefSectionKey = (typeof GOVIRAL_BRIEF_SECTION_KEYS)[number];

/** The rate the reading time is computed at. Printed beside the figure so it can be checked. */
export const GOVIRAL_BRIEF_WORDS_PER_MINUTE = 200;

export const GOVIRAL_BRIEF_MAX_OPPORTUNITIES = 3;
export const GOVIRAL_BRIEF_MAX_LESSONS = 2;

export function readingTimeMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / GOVIRAL_BRIEF_WORDS_PER_MINUTE));
}

export const GoViralBriefSectionSchema = z.strictObject({
  key: z.enum(GOVIRAL_BRIEF_SECTION_KEYS),
  heading: z.string().trim().min(1).max(120),
  /**
   * At least one line, always. A section with nothing in it names its own emptiness instead of
   * disappearing: an omitted section reads as "nothing happened" and a present one reads as
   * "nothing was recorded", and only the second is true.
   */
  lines: z.array(z.string().trim().min(1).max(600)).min(1).max(12)
});

export const GoViralBriefOpportunitySchema = z.strictObject({
  /** Stable and citeable: `state/CONTENT_INVENTORY.json` can point an entry at one of these. */
  id: z.string().regex(/^GV-\d{4}-\d{2}-\d{2}-O[1-9]$/),
  number: z.number().int().min(1).max(GOVIRAL_BRIEF_MAX_OPPORTUNITIES),
  /** As the seat wrote it. The room's own convention puts the desk first: "DNESKAi: …". */
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(400),
  evidenceRefs: z.array(EvidenceRefSchema).max(12)
});

export const GoViralWeeklyBriefSchema = z.strictObject({
  schemaVersion: z.literal("goviral-weekly-brief/1"),
  ventureId: z.literal("goviral"),
  date: DateSchema,
  title: z.string().trim().min(1).max(160),
  /** The `marketing-plan/1` written by the same room; the two are always a pair. */
  planRef: z.string().regex(/^state\/ventures\/goviral\/plans\/plan-\d{4}-\d{2}-\d{2}-weekly-brief\.json$/),
  wordCount: z.number().int().nonnegative(),
  readingTimeMinutes: z.number().int().min(1).max(60),
  sections: z.array(GoViralBriefSectionSchema).length(GOVIRAL_BRIEF_SECTION_KEYS.length),
  opportunities: z.array(GoViralBriefOpportunitySchema).max(GOVIRAL_BRIEF_MAX_OPPORTUNITIES),
  /** Draft when AUDIT vetoed, for the same reason the plan is: a veto is about the calls. */
  status: z.enum(["draft", "approved"]),
  generatedAt: DateTimeSchema
}).superRefine((brief, context) => {
  const keys = brief.sections.map(({ key }) => key);
  if (keys.join("|") !== GOVIRAL_BRIEF_SECTION_KEYS.join("|")) {
    context.addIssue({
      code: "custom",
      path: ["sections"],
      message: `The skeleton is fixed: ${GOVIRAL_BRIEF_SECTION_KEYS.join(", ")}, in that order`
    });
  }
  // Stated separately from the section-order check although the order check implies presence,
  // because this is the rule the brief exists to enforce and a future re-ordering must not take
  // it out silently.
  if ((brief.sections.find(({ key }) => key === "haters")?.lines.length ?? 0) === 0) {
    context.addIssue({ code: "custom", path: ["sections"], message: "Haters is the uncertainty note and is never empty" });
  }
  // A reading time nobody can recompute is a decoration. This one is derived from the word count
  // stored beside it, so a brief that overstates its own length fails to parse.
  if (brief.readingTimeMinutes !== readingTimeMinutes(brief.wordCount)) {
    context.addIssue({
      code: "custom",
      path: ["readingTimeMinutes"],
      message: `Reading time must be the word count at ${GOVIRAL_BRIEF_WORDS_PER_MINUTE} words per minute`
    });
  }
  brief.opportunities.forEach((opportunity, index) => {
    if (opportunity.number !== index + 1) {
      context.addIssue({ code: "custom", path: ["opportunities", index, "number"], message: "Opportunities are numbered from one, consecutively" });
    }
    if (opportunity.id !== `GV-${brief.date}-O${opportunity.number}`) {
      context.addIssue({ code: "custom", path: ["opportunities", index, "id"], message: "An opportunity id is its brief's date and its own number" });
    }
  });
  if (!brief.planRef.includes(brief.date)) {
    context.addIssue({ code: "custom", path: ["planRef"], message: "The brief and its plan carry the same date" });
  }
});

export type GoViralWeeklyBrief = z.infer<typeof GoViralWeeklyBriefSchema>;
export type GoViralBriefSection = z.infer<typeof GoViralBriefSectionSchema>;
export type GoViralBriefOpportunity = z.infer<typeof GoViralBriefOpportunitySchema>;
