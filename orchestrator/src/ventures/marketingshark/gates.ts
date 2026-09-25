import { QUIZ_SLIDE_LIMITS } from "@boardlessai/carousel-studio";
import { fencedBlocks, type NormalizedQuestion } from "./bank.js";
import { brandLocales, type Brand, type MarketingSharkLocale } from "./config.js";
import { SLIDE_ROLES, type CarouselCopy, type ChumOutput } from "./package.js";
import { correctLetter, fitViolations, type FitViolation } from "./render.js";
import { LINKEDIN_LINK_RESERVE, LINKEDIN_TEXT_LIMIT } from "../../social/linkedin-text.js";

/**
 * The caps the craft rules state, restated here as numbers a check can apply.
 *
 * They live in one place because the prompt and the gate have to agree: a cap the prompt asks for
 * and the gate does not enforce is a suggestion, and a cap the gate enforces and the prompt never
 * mentions is a retry the model cannot learn its way out of.
 */
export const LIMITS = {
  /**
   * The per-slide caps (hook, why, headline, body and alt text, alone and together) live in the
   * render package, because the Design Lab holds an owner's edit to the same numbers (quorum#575).
   */
  ...QUIZ_SLIDE_LIMITS,
  instagramBeforeHashtags: 500,
  threadsChars: 300,
  instagramHashtagsMin: 3,
  instagramHashtagsMax: 5,
  /**
   * The package schema's own caps, restated so the gates can catch a breach as a violation the
   * retry can act on. The headline and body caps arrive through the spread above.
   *
   * They were not here, and the consequence was a crash rather than a retry: the craft caps bound
   * the hook, the why slide, the descriptions and the alt text, but nothing bound a context or
   * reveal headline, a slide body, or an Instagram caption once its hashtags were appended. An
   * ordinary reply with a 130-character question on slide 2 passed every gate and then threw an
   * uncaught ZodError inside assemblePackage, after the call was paid for and both carousels were
   * rendered.
   */
  instagramTotalChars: 2_200,
  threadsTotalChars: 500,
  /**
   * The caption with its hashtags appended, as it is queued. LinkedIn allows 3,000, and a
   * single-image post through Buffer adds a blank line and the tracked link, so the room keeps
   * `LINKEDIN_LINK_RESERVE` of it free: a caption that passed here was otherwise held at send time.
   */
  linkedinTotalChars: LINKEDIN_TEXT_LIMIT - LINKEDIN_LINK_RESERVE,
  /**
   * LinkedIn cuts a post after roughly the first 140 characters on a phone, behind "…see more", so
   * the first line has to stand alone within that.
   */
  linkedinFirstLineChars: 140,
  linkedinHashtagsMax: 3
} as const;

/** The first non-empty line of a caption, trimmed: what a feed shows before it truncates. */
export function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

const comparable = (text: string): string => text.toLowerCase().replace(/\s+/gu, " ").trim();

/*
 * Engagement bait, in the one form a check can recognise without flagging ordinary developer copy:
 * a call to follow, like, share, comment on or tag the brand or the post, in the same sentence as a
 * reward. "Share this with a friend who still uses var" passes; "Follow us for 50 coins" does not.
 */
const ENGAGEMENT_CALL = /\b(?:follow|like|share|comment(?:\s+on)?|repost|tag|subscribe(?:\s+to)?|save)\s+(?:us|this|it|our|devshark|the\s+(?:page|post|carousel|profile)|a\s+friend|below)\b|\bfor\s+(?:following|liking|sharing|commenting|reposting|tagging|subscribing)\b|(?:^|\s)(?:sleduj(?:te)?|lajkni(?:te)?|sdílej(?:te)?|okomentuj(?:te)?)(?=\s|$)/iu;
const ENGAGEMENT_REWARD = /\b(?:coins?|discounts?|rewards?|giveaways?|prizes?|promo\s+codes?|unlock(?:s|ed)?|premium|free\s+(?:access|months?|trial))\b|\d+\s*%\s*off\b|(?:^|\s)(?:minc\p{L}*|slev\p{L}*|odměn\p{L}*)/iu;

/** Whether any sentence of a text promises a reward for engagement. */
export function promisesEngagementReward(text: string): boolean {
  return text.split(/[.!?\n]+/u).some((sentence) => ENGAGEMENT_CALL.test(sentence) && ENGAGEMENT_REWARD.test(sentence));
}

/** The assigned slide-1 line per language: English always, Czech for a brand that writes it. */
export interface HookLines {
  en: string;
  cs?: string;
}

export interface GateViolation {
  gate: string;
  locale: "cs" | "en" | "both";
  detail: string;
}

const words = (value: string): number => value.trim().split(/\s+/u).filter(Boolean).length;

/** Numerals in a string, as whole tokens: "10" from "10 seconds", nothing from "v8". */
export function numerals(value: string): string[] {
  return [...value.matchAll(/\d+(?:[.,]\d+)?/gu)].map((match) => match[0]);
}

export { fencedBlocks } from "./bank.js";

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
  hookLines: HookLines | null;
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

  for (const locale of brandLocales(brand)) {
    const carousel = output.carousels[locale];
    const instagramText = output.descriptions.instagram[locale];
    const threadsText = output.descriptions.threads[locale];
    const instagramTags = output.hashtags.instagram[locale];
    const threadsTags = output.hashtags.threads[locale];
    if (!carousel || instagramText === undefined || threadsText === undefined || !instagramTags || !threadsTags) {
      // A language the brand writes and the reply left out. English is always required; Czech only
      // for a brand that names it.
      add("locale-missing", locale, `the ${locale} carousel, descriptions and hashtags are all required for ${brand.displayName}`);
      continue;
    }
    const slides = carousel.slides;

    if (slides.map((slide) => slide.role).join(",") !== SLIDE_ROLES.join(",")) {
      add("slide-roles", locale, `slides must be ${SLIDE_ROLES.join(", ")} in order`);
      continue;
    }

    const [hook, context, , why, footer] = slides;

    // Slide 1 is the library's line, checked the way the brand's slide-5 line is: verbatim or not
    // at all. The char budget is the hook lint's job upstream — by the time a line reaches here it
    // has already cleared EN 58 / CS 66, and re-capping it at 80 here would only hide a mismatch.
    if (input.hookLines && hook!.headline.trim() !== (input.hookLines[locale] ?? "").trim()) {
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

    // The reveal is the one slide that can be false in a way no length cap sees. Code prints the
    // correct letter on it; a reveal whose own words name another letter contradicts the slide.
    const reveal = slides[2]!;
    const named = [reveal.headline, reveal.body ?? ""]
      .map((value) => /^\s*([A-D])(?:\s*[.):\u2013\u2014-]|\s*$)/u.exec(value)?.[1])
      .find(Boolean);
    if (named && named !== correctLetter(question)) {
      add("reveal-answer", locale, `the reveal names ${named}, the correct answer is ${correctLetter(question)}`);
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
    // The queue carries the five alt texts as one field, joined the way the queue joins them.
    const altTotal = slides.map((slide) => slide.alt).join(" ").length;
    if (altTotal > LIMITS.altTotalChars) {
      add("alt-total", locale, `the five alt texts are ${altTotal} characters together, cap is ${LIMITS.altTotalChars}`);
    }

    // Code reaches the slide byte for byte or it does not reach it. A retyped snippet is a
    // different program.
    const contextText = [context!.headline, context!.body ?? ""].join("\n");
    for (const block of fencedBlocks(`${question.en.introduction}\n${question.en.question}`)) {
      if (!contextText.includes(block)) {
        add("code-verbatim", locale, "the question's code block is not on the context slide byte for byte");
      }
    }

    const description = instagramText;
    violations.push(...captionViolations({ locale, instagram: description, threads: threadsText, instagramTags, threadsTags }));

    const written = [
      ...slides.flatMap((slide) => [slide.headline, slide.body ?? "", slide.alt]),
      description,
      threadsText,
      ...(locale === "en" ? [output.descriptions.linkedin.en] : [])
    ];
    if (written.some(promisesEngagementReward)) {
      add("engagement-reward", locale, "no slide, caption or hashtag may promise coins, discounts, access or any reward for following, liking, sharing or commenting");
    }
  }

  // LinkedIn is English only: one caption, written for LinkedIn, never another channel's text.
  violations.push(...linkedinViolations({
    linkedin: output.descriptions.linkedin.en,
    linkedinTags: output.hashtags.linkedin.en,
    instagram: output.descriptions.instagram.en,
    threads: output.descriptions.threads.en
  }));

  // The `ab-record` gate is gone with the field it checked. Both hook lines now come from the
  // central library, so neither can be empty, over-long or invented — the hook lint proved that
  // before either was eligible to be assigned.

  return violations;
}

/**
 * The Instagram and Threads rules for one language, shared by every post kind. The checks and their
 * order are the quiz's own, moved here unchanged so a weekly note cannot pass a caption the quiz
 * would have sent back.
 */
export function captionViolations(input: {
  locale: GateViolation["locale"];
  instagram: string;
  threads: string;
  instagramTags: readonly string[];
  threadsTags: readonly string[];
}): GateViolation[] {
  const violations: GateViolation[] = [];
  const add = (gate: string, detail: string) => violations.push({ gate, locale: input.locale, detail });
  const description = input.instagram;
  const beforeHashtags = description.split(/(?=#)/u)[0] ?? description;
  if (beforeHashtags.length > LIMITS.instagramBeforeHashtags) {
    add("instagram-length", `${beforeHashtags.length} characters before hashtags, cap is ${LIMITS.instagramBeforeHashtags}`);
  }
  if (input.threads.length > LIMITS.threadsChars) {
    add("threads-length", `${input.threads.length} characters, cap is ${LIMITS.threadsChars}`);
  }
  // The schema caps the stored field, and the stored Instagram field is the description with its
  // hashtags appended -- so the cap has to be measured on that, not on the description alone.
  const instagramStored = `${description}\n\n${input.instagramTags.join(" ")}`;
  if (instagramStored.length > LIMITS.instagramTotalChars) {
    add("instagram-total", `${instagramStored.length} characters with hashtags, schema cap is ${LIMITS.instagramTotalChars}`);
  }
  if (input.threads.length > LIMITS.threadsTotalChars) {
    add("threads-total", `${input.threads.length} characters, schema cap is ${LIMITS.threadsTotalChars}`);
  }

  if (input.instagramTags.length < LIMITS.instagramHashtagsMin || input.instagramTags.length > LIMITS.instagramHashtagsMax) {
    add("instagram-hashtags", `${input.instagramTags.length} hashtags, allowed ${LIMITS.instagramHashtagsMin}-${LIMITS.instagramHashtagsMax}`);
  }
  if (input.instagramTags.some((tag) => !tag.startsWith("#"))) {
    add("instagram-hashtags", "every Instagram hashtag must start with #");
  }
  if (input.threadsTags.length !== 1) {
    add("threads-topic", `Threads carries one topic tag, received ${input.threadsTags.length}`);
  }
  return violations;
}

/** LinkedIn's rules: its own caption, its first line, its few hashtags, and never another channel's text. */
export function linkedinViolations(input: { linkedin: string; linkedinTags: readonly string[]; instagram: string; threads: string }): GateViolation[] {
  const violations: GateViolation[] = [];
  const add = (gate: string, detail: string) => violations.push({ gate, locale: "en", detail });
  const { linkedin, linkedinTags } = input;
  const linkedinStored = linkedinTags.length > 0 ? `${linkedin}\n\n${linkedinTags.join(" ")}` : linkedin;
  if (linkedin.trim().length === 0) {
    add("linkedin-present", "the LinkedIn caption is empty");
  }
  if (linkedinStored.length > LIMITS.linkedinTotalChars) {
    add("linkedin-length", `${linkedinStored.length} characters with hashtags, cap is ${LIMITS.linkedinTotalChars}`);
  }
  const opening = firstLine(linkedin);
  if (opening.length > LIMITS.linkedinFirstLineChars) {
    add("linkedin-first-line", `the first line is ${opening.length} characters; LinkedIn shows about ${LIMITS.linkedinFirstLineChars} before "see more", so it must stand alone within that`);
  }
  if (linkedinTags.length > LIMITS.linkedinHashtagsMax || linkedinTags.some((tag) => !tag.startsWith("#"))) {
    add("linkedin-hashtags", `LinkedIn carries at most ${LIMITS.linkedinHashtagsMax} hashtags, each starting with #; received ${linkedinTags.length}`);
  }
  if (/(?:^|\s)#[\p{L}\p{N}_]+/u.test(linkedin)) {
    add("linkedin-hashtags", "hashtags go in the LinkedIn hashtag list, not inside the caption");
  }
  if ([input.instagram, input.threads].some((other) => comparable(other) === comparable(linkedin))) {
    add("linkedin-distinct", "the LinkedIn caption repeats another channel's text; write it for LinkedIn");
  } else if (opening && [input.instagram, input.threads].some((other) => comparable(firstLine(other)) === comparable(opening))) {
    add("linkedin-distinct", "the LinkedIn first line repeats another channel's first line; write its own hook");
  }
  return violations;
}

/**
 * The canvas check, as violations the retry can act on.
 *
 * Runs only on output that cleared the truth gates, because it renders both carousels and a
 * malformed reply is already going back to the writer for other reasons.
 */
export function runFitGate(input: {
  output: ChumOutput;
  brand: Brand;
  question: NormalizedQuestion;
}): GateViolation[] {
  const copy: Partial<Record<MarketingSharkLocale, CarouselCopy>> = {};
  for (const locale of brandLocales(input.brand)) {
    const carousel = input.output.carousels[locale];
    // A missing language is the truth gates' violation to report; the canvas has nothing to draw.
    if (!carousel) continue;
    copy[locale] = {
      slides: carousel.slides.map((slide, index) => ({
        role: SLIDE_ROLES[index]!,
        templateId: "",
        headline: slide.headline,
        ...(slide.body ? { body: slide.body } : {}),
        alt: slide.alt
      }))
    };
  }
  return fitViolations({ brand: input.brand, question: input.question, copy })
    .map((violation) => ({
      gate: "slot-fit",
      locale: violation.locale,
      detail: violation.field === "code"
        ? codeSlotAdvice(violation)
        : `${violation.role} ${violation.field} does not fit the ${violation.slot} slot: at most ${violation.maxChars} characters on ${violation.maxLines} line${violation.maxLines === 1 ? "" : "s"}`
    }));
}

/**
 * What the writer can change when a slot that code fills from the context body overflows.
 *
 * Every slot is fitted in its own frame, so a shorter headline gives the code or the options no
 * room; the retry used to say exactly that and sent the model after the one field that could not
 * help. Selection already skips a question whose own code and options overflow, so an overflow
 * here is something the writer added to the body: commentary beside the code, or restated options
 * longer than the bank's.
 */
function codeSlotAdvice(violation: FitViolation): string {
  const room = `at most ${violation.maxChars} characters on ${violation.maxLines} lines`;
  return violation.slot === "code-block"
    ? `${violation.role}: the code-block slot holds ${room}; the context body carries the question's code byte for byte and nothing else`
    : `${violation.role}: the restated options do not fit the ${violation.slot} slot (${room}); leave them out of the context body and code prints the question's own`;
}

/** One line per violation, in the shape the single retry appends to the packet. */
export function violationReport(violations: readonly GateViolation[]): string {
  return violations
    .map((violation) => `- [${violation.gate}] ${violation.locale}: ${violation.detail}`)
    .join("\n");
}
