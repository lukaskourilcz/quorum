import { readFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "../../paths.js";
import type { NormalizedQuestion } from "./bank.js";
import type { Brand } from "./config.js";
import { LIMITS, violationReport, type GateViolation } from "./gates.js";
import { SLIDE_ROLES } from "./package.js";

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
export const OUTPUT_SHAPE = `{
  "carousels": {
    "cs": { "slides": [ { "role": "hook|context|reveal|why|footer", "headline": "string", "body": "string (optional)", "alt": "string" } x5 ] },
    "en": { "slides": [ ...same five roles, in the same order... ] }
  },
  "descriptions": {
    "instagram": { "cs": "string", "en": "string" },
    "threads":   { "cs": "string", "en": "string" }
  },
  "hashtags": {
    "instagram": { "cs": ["#tag", ...], "en": ["#tag", ...] },
    "threads":   { "cs": ["topic"], "en": ["topic"] }
  }
}`;

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
  hookLines: { cs: string; en: string } | null;
  hookId: string | null;
  date: string;
  violations?: readonly GateViolation[];
}): string {
  const { brand, question } = input;
  const tone = brand.tone;
  const czech = question.cs;

  const sections = [
    `## Brand\n`
    + `id: ${brand.id}\n`
    + `name: ${brand.displayName}\n`
    + `tone: ${tone}\n`
    + `product URL: ${brand.productUrl}\n`
    + `slide-5 line (EN, copy verbatim): ${brand.slide5.en}\n`
    + `slide-5 line (CS, copy verbatim): ${brand.slide5.cs}\n`
    + `base Instagram hashtags EN: ${brand.hashtags.instagram.en.join(" ")}\n`
    + `base Instagram hashtags CS: ${brand.hashtags.instagram.cs.join(" ")}\n`
    + `Threads topic tag EN: ${brand.hashtags.threadsTopic.en}\n`
    + `Threads topic tag CS: ${brand.hashtags.threadsTopic.cs}`,

    `## The question (already selected — do not choose another)\n`
    + `id: ${question.id}\n`
    + `category: ${question.category}\n`
    + `difficulty: ${question.difficulty} of 5\n`
    + (question.en.introduction ? `\nIntroduction (EN):\n${question.en.introduction}\n` : "")
    + `\nQuestion (EN):\n${question.en.question}\n`
    + `\nOptions (EN):\n${optionLines(question.en.options)}\n`
    + `\nCorrect answer: ${String.fromCharCode(65 + question.correctIndex)} — ${question.en.options[question.correctIndex]}\n`
    + `\nExplanation (EN):\n${question.en.explanation}`,

    czech
      ? `## Czech reference from the product (partial by design — write native Czech, do not translate this)\n`
        + (czech.question ? `Question (CS):\n${czech.question}\n\n` : "")
        + (czech.options ? `Options (CS):\n${optionLines(czech.options)}\n\n` : "")
        + (czech.explanation ? `Explanation (CS):\n${czech.explanation}` : "")
      : `## Czech reference\nNone exists for this question. Write the Czech carousel from the English source, in native register.`,

    input.hookLines
      ? `## Slide 1 is already written — copy it verbatim\n`
        + `hook id: ${input.hookId}\n`
        + `EN: ${input.hookLines.en}\n`
        + `CS: ${input.hookLines.cs}\n`
        + `These lines come from the central hook library and are already gate-licensed and`
        + ` length-budgeted. Reproduce them character for character on the hook slide, in both`
        + ` languages. Do not rewrite, translate, shorten or punctuate them differently. Write`
        + ` slides 2 to 5 so that they cash the promise slide 1 makes.`
      : `## Slide 1 is yours this time\n`
        + `No hook was eligible for this question, so write the hook slide yourself as a plain,`
        + ` concrete headline about the question. Claim nothing about the reader, the difficulty`
        + ` or any statistic. Keep it under ${LIMITS.hookChars} characters in both languages.`,

    `## Hard limits, checked in code after you answer\n`
    + (input.hookLines
      ? `- the hook slide carries the assigned hook line above, unchanged\n`
      : `- hook headline ≤ ${LIMITS.hookChars} characters, both languages\n`)
    + `- why slide ≤ ${LIMITS.whyWords} words\n`
    + `- Instagram ≤ ${LIMITS.instagramBeforeHashtags} characters before hashtags\n`
    + `- Threads ≤ ${LIMITS.threadsChars} characters\n`
    + `- alt text ≤ ${LIMITS.altChars} characters per slide\n`
    + `- Instagram ${LIMITS.instagramHashtagsMin}–${LIMITS.instagramHashtagsMax} hashtags, Threads exactly one topic tag\n`
    + `- the footer slide carries the brand's slide-5 line unchanged\n`
    + `- any fenced code block in the question appears on the context slide byte for byte\n`
    + `- no number in a hook that is not in the question or in the pattern's own wording\n`
    + `- slide roles, in order: ${SLIDE_ROLES.join(", ")}`,

    `## Return exactly this JSON and nothing else\n${OUTPUT_SHAPE}`
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
