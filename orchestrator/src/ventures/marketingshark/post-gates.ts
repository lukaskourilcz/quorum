import { OWNER_COPY_PLACEHOLDER } from "./announcement.js";
import type { Brand } from "./config.js";
import {
  captionViolations,
  LIMITS,
  linkedinViolations,
  numerals,
  promisesEngagementReward,
  type GateViolation
} from "./gates.js";
import { POST_KIND_ROLES, WRITER_FIELDS, writerRoles, type CopyField, type PostDeckKind } from "./kinds.js";
import type { PostWriterOutput } from "./package.js";
import type { PostDayPlan } from "./post-plan.js";
import { postFitViolations, type PostSlideWords } from "./post-render.js";

/**
 * The deterministic checks between a post kind's copy and a committed package (quorum#576).
 *
 * The quiz's gates ask whether copy is true of a question. These ask whether it stayed on the
 * slides and fields that are the writer's, inside the same caps and caption rules, with no number
 * the day's sources do not contain, no reward for engagement, and — per kind — no code on a
 * challenge teaser, no talk of trends on the weekly note, and no placeholder left in the owner's
 * announcement. None of them judges the writing.
 */

/** Code on a slide or caption: inline code, braces, arrows, statements, declarations, method calls. */
const CODE_LIKE = /`|=>|[{}]|\b(?:return|function)\s|\b(?:const|let|var)\s+[A-Za-z_$]|\.[a-z]\w*\(/u;
/** A call written out, `double(numbers)`: allowed only when the prompt itself names it. */
const CALL = /\b[A-Za-z_$][\w$]*\([^)]*\)/gu;

/** Whether a text writes code a teaser may not carry: anything code-like, or a call the prompt does not name. */
export function writesCode(text: string, prompt: string): boolean {
  return CODE_LIKE.test(text) || [...text.matchAll(CALL)].some((match) => !prompt.includes(match[0]));
}
const TREND_TALK = /\b(?:trend(?:s|ing|y)?|viral|engagement)\b/iu;

/** Numbers a text states. A hashtag is a label and "Slide 3" a position, so neither is a claim. */
function statedNumbers(text: string): string[] {
  return numerals(text.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\bslides?\s+\d\b/giu, ""));
}

/** The fixture's marker, however a hashtag spells it: "OWNER COPY", "#OWNER_COPY_A". */
function isPlaceholder(text: string): boolean {
  return text.toUpperCase().replace(/[_-]/gu, " ").includes(OWNER_COPY_PLACEHOLDER);
}

/** The whole deck: code's slides as planned, the writer's (or the owner's) fields laid over them. */
export function assemblePostSlides(plan: PostDayPlan, output: PostWriterOutput): PostSlideWords[] {
  const fields = WRITER_FIELDS[plan.kind] as Partial<Record<string, readonly CopyField[]>>;
  return (POST_KIND_ROLES[plan.kind] as readonly string[]).map((role) => {
    const code = plan.codeSlides[role] ?? { headline: "", body: "", alt: "" };
    const written = output.slides.find((slide) => slide.role === role);
    const owned = fields[role] ?? [];
    return {
      role,
      headline: owned.includes("headline") ? written?.headline ?? "" : code.headline,
      body: owned.includes("body") ? written?.body ?? "" : code.body,
      alt: written && owned.length > 0 ? written.alt : code.alt
    };
  });
}

export function runPostGates(input: { output: PostWriterOutput; brand: Brand; plan: PostDayPlan }): GateViolation[] {
  const { output, plan } = input;
  const violations: GateViolation[] = [];
  const add = (gate: string, detail: string) => violations.push({ gate, locale: "en", detail });
  const kind: PostDeckKind = plan.kind;
  const expected = writerRoles(kind) as readonly string[];
  const fields = WRITER_FIELDS[kind] as Partial<Record<string, readonly CopyField[]>>;

  if (output.slides.map((slide) => slide.role).join(",") !== expected.join(",")) {
    add("slide-roles", `return exactly the slides ${expected.join(", ")}, in that order`);
    return violations;
  }
  for (const slide of output.slides) {
    const owned = fields[slide.role] ?? [];
    for (const field of ["headline", "body"] as const) {
      const value = slide[field];
      if (owned.includes(field) && !value?.trim()) add("field-present", `${slide.role} ${field} is empty`);
      if (!owned.includes(field) && value !== undefined && value.trim() !== "") add("field-owned", `${slide.role} ${field} is code's; leave it out`);
    }
  }

  const slides = assemblePostSlides(plan, output);
  slides.forEach((slide, index) => {
    const headlineCap = index === 0 ? LIMITS.hookChars : LIMITS.headlineChars;
    if (slide.headline.length > headlineCap) add("headline-length", `${slide.role} headline is ${slide.headline.length} characters, cap is ${headlineCap}`);
    if (slide.body.length > LIMITS.bodyChars) add("body-length", `${slide.role} body is ${slide.body.length} characters, cap is ${LIMITS.bodyChars}`);
    if (slide.alt.trim().length === 0) add("alt-present", `${slide.role} has no alt text`);
    if (slide.alt.length > LIMITS.altChars) add("alt-length", `${slide.role} alt text is ${slide.alt.length} characters, cap is ${LIMITS.altChars}`);
    const unfilled = `${slide.headline} ${slide.body}`.match(/\{[a-z]+\}/giu);
    if (unfilled) add("slot-filled", `${slide.role} still contains ${unfilled.join(", ")}`);
  });
  const altTotal = slides.map((slide) => slide.alt).join(" ").length;
  if (altTotal > LIMITS.altTotalChars) add("alt-total", `the five alt texts are ${altTotal} characters together, cap is ${LIMITS.altTotalChars}`);

  // What the writer wrote, every field of it, and the three captions.
  const writerText = [
    ...output.slides.flatMap((slide) => [slide.headline ?? "", slide.body ?? "", slide.alt]),
    output.descriptions.instagram.en,
    output.descriptions.threads.en,
    output.descriptions.linkedin.en
  ];
  const allowed = new Set(statedNumbers(plan.numberSource));
  const invented = [...new Set(writerText.flatMap(statedNumbers).filter((numeral) => !allowed.has(numeral)))];
  if (invented.length > 0) {
    add("no-invented-numbers", `${invented.join(", ")} ${invented.length === 1 ? "is" : "are"} in none of the day's facts; state only numbers the facts contain`);
  }
  if (kind === "challenge-teaser" && writerText.some((text) => writesCode(text, plan.codeSlides.prompt?.body ?? ""))) {
    add("no-solution", "a teaser carries no code, in any form: the reader writes it");
  }
  if (kind === "this-week" && writerText.some((text) => TREND_TALK.test(text))) {
    add("trend-mention", "the weekly note never says trending, viral or engagement");
  }
  if (kind === "announcement" && [...writerText, ...output.hashtags.instagram.en, ...output.hashtags.threads.en, ...output.hashtags.linkedin.en].some(isPlaceholder)) {
    add("owner-copy", `the announcement still carries the fixture's "${OWNER_COPY_PLACEHOLDER}" placeholders`);
  }

  violations.push(...captionViolations({
    locale: "en",
    instagram: output.descriptions.instagram.en,
    threads: output.descriptions.threads.en,
    instagramTags: output.hashtags.instagram.en,
    threadsTags: output.hashtags.threads.en
  }));
  if ([...writerText, ...output.hashtags.instagram.en, ...output.hashtags.threads.en, ...output.hashtags.linkedin.en].some(promisesEngagementReward)) {
    add("engagement-reward", "no slide, caption or hashtag may promise coins, discounts, access or any reward for following, liking, sharing or commenting");
  }
  violations.push(...linkedinViolations({
    linkedin: output.descriptions.linkedin.en,
    linkedinTags: output.hashtags.linkedin.en,
    instagram: output.descriptions.instagram.en,
    threads: output.descriptions.threads.en
  }));
  return violations;
}

/**
 * The canvas check on the whole deck. A clip in a field the writer fills goes back to the writer
 * with the slot's budget; a clip in code's own words cannot be fixed by a retry, so it is reported
 * as such and the room stops before spending again.
 */
export function runPostFitGate(input: { output: PostWriterOutput; brand: Brand; plan: PostDayPlan }): { violations: GateViolation[]; codeClipped: string[] } {
  const fields = WRITER_FIELDS[input.plan.kind] as Partial<Record<string, readonly CopyField[]>>;
  const violations: GateViolation[] = [];
  const codeClipped: string[] = [];
  for (const violation of postFitViolations({ brand: input.brand, kind: input.plan.kind, slides: assemblePostSlides(input.plan, input.output) })) {
    if ((fields[violation.role] ?? []).includes(violation.field)) {
      violations.push({
        gate: "slot-fit",
        locale: "en",
        detail: `${violation.role} ${violation.field} does not fit the ${violation.slot} slot: at most ${violation.maxChars} characters on ${violation.maxLines} line${violation.maxLines === 1 ? "" : "s"}`
      });
    } else {
      codeClipped.push(`${violation.role}:${violation.slot}`);
    }
  }
  return { violations, codeClipped };
}
