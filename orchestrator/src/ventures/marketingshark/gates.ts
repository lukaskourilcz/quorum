import type { NormalizedQuestion } from "./bank.js";
import type { Brand } from "./config.js";
import { SLIDE_ROLES, type ChumOutput } from "./package.js";

/**
 * The caps the craft rules state, restated here as numbers a check can apply.
 *
 * They live in one place because the prompt and the gate have to agree: a cap the prompt asks for
 * and the gate does not enforce is a suggestion, and a cap the gate enforces and the prompt never
 * mentions is a retry the model cannot learn its way out of.
 */
export const LIMITS = {
  hookChars: 80,
  whyWords: 40,
  instagramBeforeHashtags: 500,
  threadsChars: 300,
  altChars: 200,
  instagramHashtagsMin: 3,
  instagramHashtagsMax: 5,
  /**
   * The package schema's own caps, restated so the gates can catch a breach as a violation the
   * retry can act on.
   *
   * They were not here, and the consequence was a crash rather than a retry: the craft caps bound
   * the hook, the why slide, the descriptions and the alt text, but nothing bound a context or
   * reveal headline, a slide body, or an Instagram caption once its hashtags were appended. An
   * ordinary reply with a 130-character question on slide 2 passed every gate and then threw an
   * uncaught ZodError inside assemblePackage, after the call was paid for and both carousels were
   * rendered.
   */
  headlineChars: 120,
  bodyChars: 600,
  instagramTotalChars: 2_200,
  threadsTotalChars: 500
} as const;

export interface GateViolation {
  gate: string;
  locale: "cs" | "en" | "both";
  detail: string;
}

const words = (value: string): number => value.trim().split(/\s+/u).filter(Boolean).length;

/** Numerals in a string, as whole tokens: "10" from "10 seconds", nothing from "v8". */
function numerals(value: string): string[] {
  return [...value.matchAll(/\d+(?:[.,]\d+)?/gu)].map((match) => match[0]);
}

/** Inner text of every fenced block, without the fence markers or the language tag. */
export function fencedBlocks(value: string): string[] {
  return [...value.matchAll(/```[a-z0-9+#-]*\n([\s\S]*?)```/giu)]
    .map((match) => (match[1] ?? "").replace(/\s+$/u, ""))
    .filter((block) => block.length > 0);
}

/**
 * Every deterministic check that stands between CHUM's output and a committed package.
 *
 * None of these asks whether the copy is good. They ask whether it is true of the question, whether
 * it stayed inside the caps the prompt promised, and whether the two things code owns -- the
 * brand's slide-5 line and the source code block -- survived unedited. A model cannot mark its own
 * homework here; step 6 produced the text and step 7 is the only thing that lets it through.
 */
export function runTruthGates(input: {
  output: ChumOutput;
  brand: Brand;
  question: NormalizedQuestion;
  /** The assigned hook's line per locale, or null when the pack takes its `no-hook` fallback. */
  hookLines: { cs: string; en: string } | null;
}): GateViolation[] {
  const { output, brand, question } = input;
  const violations: GateViolation[] = [];
  const add = (gate: string, locale: GateViolation["locale"], detail: string) =>
    violations.push({ gate, locale, detail });

  // Everything the question and the pattern legitimately let a hook say a number about.
  const sourceText = [
    question.en.question,
    question.en.introduction,
    question.en.explanation,
    ...question.en.options,
    question.cs?.question ?? "",
    question.cs?.explanation ?? "",
    ...(question.cs?.options ?? [])
  ].join("\n");

  for (const locale of ["cs", "en"] as const) {
    const slides = output.carousels[locale].slides;

    if (slides.map((slide) => slide.role).join(",") !== SLIDE_ROLES.join(",")) {
      add("slide-roles", locale, `slides must be ${SLIDE_ROLES.join(", ")} in order`);
      continue;
    }

    const [hook, context, , why, footer] = slides;

    // Slide 1 is the library's line, checked the way the brand's slide-5 line is: verbatim or not
    // at all. The char budget is the hook lint's job upstream — by the time a line reaches here it
    // has already cleared EN 58 / CS 66, and re-capping it at 80 here would only hide a mismatch.
    if (input.hookLines && hook!.headline.trim() !== input.hookLines[locale].trim()) {
      add("hook-verbatim", locale, "slide 1 does not carry the assigned hook line unchanged");
    }
    if (!input.hookLines && hook!.headline.length > LIMITS.hookChars) {
      // The `no-hook` fallback is the one path where the model still writes slide 1.
      add("hook-length", locale, `fallback headline is ${hook!.headline.length} characters, cap is ${LIMITS.hookChars}`);
    }

    // An unfilled {topic} reaching a slide is the pattern leaking its own template into the feed.
    for (const slide of slides) {
      const unfilled = [slide.headline, slide.body ?? ""].join(" ").match(/\{[a-z]+\}/giu);
      if (unfilled) add("slot-filled", locale, `${slide.role} still contains ${unfilled.join(", ")}`);
    }

    // A number in a hook has to come from the question or from the pattern's own wording. This is
    // the never-invent-a-statistic rule in the only form a check can apply it.
    const allowed = new Set([
      ...numerals(sourceText),
      ...numerals(input.hookLines?.en ?? ""),
      ...numerals(input.hookLines?.cs ?? "")
    ]);
    for (const numeral of numerals(hook!.headline)) {
      if (!allowed.has(numeral)) {
        add("no-invented-numbers", locale, `hook states ${numeral}, which is in neither the question nor the pattern`);
      }
    }

    if (words(why!.headline + " " + (why!.body ?? "")) > LIMITS.whyWords) {
      add("why-length", locale, `why slide is ${words(why!.headline + " " + (why!.body ?? ""))} words, cap is ${LIMITS.whyWords}`);
    }

    // The brand's line is code's, not the model's. Verbatim means verbatim.
    if (footer!.headline.trim() !== brand.slide5[locale].trim()) {
      add("slide5-verbatim", locale, "footer slide does not carry the brand's slide-5 line unchanged");
    }

    for (const slide of slides) {
      if (slide.headline.length > LIMITS.headlineChars) {
        add("headline-length", locale, `${slide.role} headline is ${slide.headline.length} characters, cap is ${LIMITS.headlineChars}`);
      }
      if ((slide.body ?? "").length > LIMITS.bodyChars) {
        add("body-length", locale, `${slide.role} body is ${(slide.body ?? "").length} characters, cap is ${LIMITS.bodyChars}`);
      }
      if (slide.alt.length > LIMITS.altChars) {
        add("alt-length", locale, `${slide.role} alt text is ${slide.alt.length} characters, cap is ${LIMITS.altChars}`);
      }
      if (slide.alt.trim().length === 0) {
        add("alt-present", locale, `${slide.role} has no alt text`);
      }
    }

    // Code reaches the slide byte for byte or it does not reach it. A retyped snippet is a
    // different program.
    const contextText = [context!.headline, context!.body ?? ""].join("\n");
    for (const block of fencedBlocks(`${question.en.introduction}\n${question.en.question}`)) {
      if (!contextText.includes(block)) {
        add("code-verbatim", locale, "the question's code block is not on the context slide byte for byte");
      }
    }

    const description = output.descriptions.instagram[locale];
    const beforeHashtags = description.split(/(?=#)/u)[0] ?? description;
    if (beforeHashtags.length > LIMITS.instagramBeforeHashtags) {
      add("instagram-length", locale, `${beforeHashtags.length} characters before hashtags, cap is ${LIMITS.instagramBeforeHashtags}`);
    }
    if (output.descriptions.threads[locale].length > LIMITS.threadsChars) {
      add("threads-length", locale, `${output.descriptions.threads[locale].length} characters, cap is ${LIMITS.threadsChars}`);
    }
    // The schema caps the stored field, and the stored Instagram field is the description with its
    // hashtags appended -- so the cap has to be measured on that, not on the description alone.
    const instagramStored = `${description}\n\n${output.hashtags.instagram[locale].join(" ")}`;
    if (instagramStored.length > LIMITS.instagramTotalChars) {
      add("instagram-total", locale, `${instagramStored.length} characters with hashtags, schema cap is ${LIMITS.instagramTotalChars}`);
    }
    if (output.descriptions.threads[locale].length > LIMITS.threadsTotalChars) {
      add("threads-total", locale, `${output.descriptions.threads[locale].length} characters, schema cap is ${LIMITS.threadsTotalChars}`);
    }

    const instagramTags = output.hashtags.instagram[locale];
    if (instagramTags.length < LIMITS.instagramHashtagsMin || instagramTags.length > LIMITS.instagramHashtagsMax) {
      add("instagram-hashtags", locale, `${instagramTags.length} hashtags, allowed ${LIMITS.instagramHashtagsMin}-${LIMITS.instagramHashtagsMax}`);
    }
    if (instagramTags.some((tag) => !tag.startsWith("#"))) {
      add("instagram-hashtags", locale, "every Instagram hashtag must start with #");
    }
    if (output.hashtags.threads[locale].length !== 1) {
      add("threads-topic", locale, `Threads carries one topic tag, received ${output.hashtags.threads[locale].length}`);
    }
  }

  // The `ab-record` gate is gone with the field it checked. Both hook lines now come from the
  // central library, so neither can be empty, over-long or invented — the hook lint proved that
  // before either was eligible to be assigned.

  return violations;
}

/** One line per violation, in the shape the single retry appends to the packet. */
export function violationReport(violations: readonly GateViolation[]): string {
  return violations
    .map((violation) => `- [${violation.gate}] ${violation.locale}: ${violation.detail}`)
    .join("\n");
}
