import { readFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "../../paths.js";
import type { NormalizedQuestion } from "./bank.js";
import { brandLocales, type Brand, type FactSheet, type MarketingSharkLocale } from "./config.js";
import { LIMITS, violationReport, type GateViolation, type HookLines } from "./gates.js";
import { SLIDE_ROLES } from "./package.js";
import { writerLimits } from "./render.js";

export const CRAFT_PROMPT_PATH = "orchestrator/prompts/marketingshark/craft.md";
export const STRATEGY_PROMPT_PATH = "orchestrator/prompts/marketingshark/strategy.md";

export async function readCraftRules(root = repoRoot): Promise<string> {
  return readFile(path.join(root, CRAFT_PROMPT_PATH), "utf8");
}

/**
 * The JSON shape CHUM must return, stated in the packet.
 *
 * Written out rather than generated from the zod schema: the model reads this, and a
 * machine-generated JSON Schema costs three times the tokens to say the same thing against a
 * ~4,000-token input budget.
 */
export function outputShape(locales: readonly MarketingSharkLocale[]): string {
  const deck = `{ "slides": [ { "role": "hook|context|reveal|why|footer", "headline": "string", "body": "string (optional)", "alt": "string" } x5 ] }`;
  const carousels = locales.map((locale, index) =>
    `    "${locale}": ${index === 0 ? deck : `{ "slides": [ ...same five roles, in the same order... ] }`}`).join(",\n");
  const pair = (value: string) => `{ ${locales.map((locale) => `"${locale}": ${value}`).join(", ")} }`;
  return `{
  "carousels": {
${carousels}
  },
  "descriptions": {
    "instagram": ${pair('"string"')},
    "threads":   ${pair('"string"')}
  },
  "hashtags": {
    "instagram": ${pair('["#tag", ...]')},
    "threads":   ${pair('["topic"]')}
  }
}`;
}

/**
 * The product as it stands, stated to the writer so the copy cannot outrun it.
 *
 * Everything CHUM knew about devShark was a name, an address and two footer lines, all in the
 * present tense of a shipped product. The fact sheet is the owner's own description: what is true
 * today, what may be said, what may never be said. It is data the writer obeys, not a claim it may
 * embellish.
 */
function productFacts(facts: FactSheet): string {
  return `## Product facts (recorded by the owner ${facts.recordedAt}; write nothing beyond them)\n`
    + `maturity: ${facts.maturity}\n`
    + `what a visitor can do today: ${facts.whatVisitorsCanDo}\n`
    + `call to action: ${facts.callToAction}\n`
    + `you may say:\n${facts.allowedClaims.map((claim) => `- ${claim}`).join("\n")}\n`
    + `never say:\n${facts.neverClaim.map((claim) => `- ${claim}`).join("\n")}`;
}

function optionLines(options: readonly string[]): string {
  return options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join("\n");
}

/**
 * Everything CHUM is allowed to see, and nothing it is allowed to decide.
 *
 * The question, the two patterns and the brand block arrive already chosen. The packet states the
 * caps the gates enforce, so a retry is a correction the model can act on rather than a wall it
 * keeps hitting.
 */
export function buildChumPacket(input: {
  brand: Brand;
  question: NormalizedQuestion;
  /** The assigned line per locale, or null on the `no-hook` fallback. */
  hookLines: HookLines | null;
  hookId: string | null;
  date: string;
  /** The brand's measured hashtags from GoVIRAL's snapshot; empty when none is current. */
  trendLines?: readonly string[];
  violations?: readonly GateViolation[];
}): string {
  const { brand, question } = input;
  const tone = brand.tone;
  const locales = brandLocales(brand);
  const writesCzech = locales.includes("cs");
  const czech = question.cs;
  const perLocale = (label: (locale: string) => string, value: (locale: MarketingSharkLocale) => string) =>
    locales.map((locale) => `${label(locale.toUpperCase())}: ${value(locale)}`).join("\n");

  const sections = [
    `## Brand\n`
    + `id: ${brand.id}\n`
    + `name: ${brand.displayName}\n`
    + `tone: ${tone}\n`
    + `languages: ${locales.join(", ")}${writesCzech ? "" : " (English only: write no Czech field at all)"}\n`
    + `product URL: ${brand.productUrl}\n`
    + `${perLocale((code) => `slide-5 line (${code}, copy verbatim)`, (locale) => brand.slide5[locale])}\n`
    + `${perLocale((code) => `base Instagram hashtags ${code}`, (locale) => brand.hashtags.instagram[locale].join(" "))}\n`
    + perLocale((code) => `Threads topic tag ${code}`, (locale) => brand.hashtags.threadsTopic[locale]),

    ...(brand.factSheet ? [productFacts(brand.factSheet)] : []),

    `## The question (already selected — do not choose another)\n`
    + `id: ${question.id}\n`
    + `category: ${question.category}\n`
    + `difficulty: ${question.difficulty} of 5\n`
    + (question.en.introduction ? `\nIntroduction (EN):\n${question.en.introduction}\n` : "")
    + `\nQuestion (EN):\n${question.en.question}\n`
    + `\nOptions (EN):\n${optionLines(question.en.options)}\n`
    + `\nCorrect answer: ${String.fromCharCode(65 + question.correctIndex)} — ${question.en.options[question.correctIndex]}\n`
    + `\nExplanation (EN):\n${question.en.explanation}`,

    // The Czech reference is for a brand that writes Czech. For one that does not, it is paid input
    // with nothing to inform.
    ...(!writesCzech ? [] : [czech
      ? `## Czech reference from the product (partial by design — write native Czech, do not translate this)\n`
        + (czech.question ? `Question (CS):\n${czech.question}\n\n` : "")
        + (czech.options ? `Options (CS):\n${optionLines(czech.options)}\n\n` : "")
        + (czech.explanation ? `Explanation (CS):\n${czech.explanation}` : "")
      : `## Czech reference\nNone exists for this question. Write the Czech carousel from the English source, in native register.`]),

    input.hookLines
      ? `## Slide 1 is already written — copy it verbatim\n`
        + `hook id: ${input.hookId}\n`
        + `${perLocale((code) => code, (locale) => input.hookLines![locale] ?? "")}\n`
        + `${locales.length > 1 ? "These lines come" : "This line comes"} from the central hook library and`
        + ` ${locales.length > 1 ? "are" : "is"} already gate-licensed and length-budgeted. Reproduce`
        + ` ${locales.length > 1 ? "them" : "it"} character for character on the hook slide`
        + `${locales.length > 1 ? ", in both languages" : ""}. Do not rewrite, translate, shorten or`
        + ` punctuate ${locales.length > 1 ? "them" : "it"} differently. Write slides 2 to 5 so that they`
        + ` cash the promise slide 1 makes.`
      : `## Slide 1 is yours this time\n`
        + `No hook was eligible for this question, so write the hook slide yourself as a plain,`
        + ` concrete headline about the question. Claim nothing about the reader, the difficulty`
        + ` or any statistic. Keep it under ${LIMITS.hookChars} characters${locales.length > 1 ? " in both languages" : ""}.`,

    ...(input.trendLines?.length
      ? [`## This week's measured hashtags for ${brand.displayName} (GoVIRAL, expiring)\n`
        + `Ranked by engagement per hour in the latest scout. They are signals, not copy: use one to`
        + ` choose between equally true angles, or as an Instagram hashtag when it fits this question.`
        + ` Never mention trends, reach or engagement in the post.\n`
        + input.trendLines.map((line) => `- ${line}`).join("\n")]
      : []),

    `## Hard limits, checked in code after you answer\n`
    + (input.hookLines
      ? `- the hook slide carries the assigned hook line above, unchanged\n`
      : `- hook headline ≤ ${LIMITS.hookChars} characters${locales.length > 1 ? ", both languages" : ""}\n`)
    + `- why slide ≤ ${LIMITS.whyWords} words\n`
    + writerLimits(brand, question).map((line) => `- ${line}\n`).join("")
    + `- every slide is rendered before anything is kept; text that would be clipped on the canvas fails the check\n`
    + `- Instagram ≤ ${LIMITS.instagramBeforeHashtags} characters before hashtags\n`
    + `- Threads ≤ ${LIMITS.threadsChars} characters\n`
    + `- alt text ≤ ${LIMITS.altChars} characters per slide\n`
    + `- Instagram ${LIMITS.instagramHashtagsMin}–${LIMITS.instagramHashtagsMax} hashtags, Threads exactly one topic tag\n`
    + `- the footer slide carries the brand's slide-5 line unchanged\n`
    + `- any fenced code block in the question appears on the context slide byte for byte\n`
    + `- no number in a hook that is not in the question or in the pattern's own wording\n`
    + `- slide roles, in order: ${SLIDE_ROLES.join(", ")}`,

    `## Return exactly this JSON and nothing else\n${outputShape(locales)}`
  ];

  if (input.violations?.length) {
    sections.push(
      `## Your previous answer failed these checks — fix exactly these and return the whole object again\n`
      + violationReport(input.violations)
    );
  }

  return sections.join("\n\n");
}

/** MAKO's weekly packet: the strategy file plus the week's own record, nothing external. */
export async function readStrategyRules(root = repoRoot): Promise<string> {
  return readFile(path.join(root, STRATEGY_PROMPT_PATH), "utf8");
}
