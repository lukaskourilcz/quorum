import { StyleProfileSchema, type StyleProfile } from "../../contracts/style-profile.js";
import { reviewArticleText } from "../../edition/stet.js";
import type { GhostDeskPackage } from "./run.js";

interface TextSurface {
  path: string;
  text: string;
  adaptedCopy: boolean;
}

interface PhraseRule {
  rule: string;
  pattern: RegExp;
  message: string;
}

const GENERIC_AI_RULES: readonly PhraseRule[] = [
  {
    rule: "fast-paced-world",
    pattern: /\bin today(?:'|’)s fast-paced world\b/iu,
    message: "Open with the concrete story, not a generic state-of-the-world preamble."
  },
  {
    rule: "world-where",
    pattern: /\bin a world where\b/iu,
    message: "Name the actual setting instead of inventing a universal one."
  },
  {
    rule: "important-to-note",
    pattern: /\bit(?:'|’)s important to (?:note|remember|recognize)|\bit is important to (?:note|remember|recognize)\b/iu,
    message: "State the point without announcing its importance."
  },
  {
    rule: "worth-noting",
    pattern: /\bit(?:'|’)s worth (?:noting|remembering)|\bit is worth (?:noting|remembering)\b/iu,
    message: "State the detail without an importance label."
  },
  {
    rule: "time-will-tell",
    pattern: /\bonly time will tell\b/iu,
    message: "Leave uncertainty specific instead of using a stock ending."
  },
  {
    rule: "indelible-mark",
    pattern: /\b(?:left|leaves?) an indelible mark\b/iu,
    message: "Name the observed effect instead of an indelible mark."
  },
  {
    rule: "rich-tapestry",
    pattern: /\b(?:rich|vibrant|complex) tapestry\b/iu,
    message: "Replace the tapestry metaphor with the concrete relationship."
  },
  {
    rule: "unlock-potential",
    pattern: /\bunlock(?:ing|s|ed)? (?:the |its |your )?(?:power|potential|possibilities)\b/iu,
    message: "Name the practical gain instead of promising unlocked potential."
  },
  {
    rule: "navigate-complexities",
    pattern: /\bnavigat(?:e|es|ed|ing) (?:the )?(?:complexities|challenges)\b/iu,
    message: "Describe the actual decision instead of navigating abstractions."
  },
  {
    rule: "embark-journey",
    pattern: /\bembark(?:s|ed|ing)? (?:on )?(?:a|the|this) journey\b/iu,
    message: "Begin the story without announcing a journey."
  },
  {
    rule: "serves-reminder",
    pattern: /\bserves? as (?:a|an) (?:powerful |important |timely )?reminder\b/iu,
    message: "Land on the story detail instead of a generic reminder."
  }
];

const EXTRA_STOP_SLOP_RULES: readonly PhraseRule[] = [
  {
    rule: "em_dash",
    pattern: /—/u,
    message: "Use a full stop, comma or colon instead of an em dash."
  },
  {
    rule: "staged_not_but",
    pattern: /\bnot (?:just|only|merely)\b.{1,120}\bbut\b/isu,
    message: "State the point without a staged not-this-but-that reveal."
  },
  {
    rule: "conclusion_label",
    pattern: /\b(?:in conclusion|to sum up|all in all)\b/iu,
    message: "Use a specific landing instead of labeling the conclusion."
  }
];

const COMMON_PROFANITY = [
  "asshole", "assholes", "bastard", "bastards", "bitch", "bitches", "bullshit",
  "fuck", "fucked", "fucker", "fuckers", "fucking", "shit", "shitty"
] as const;

export type DoorMoneyVoiceLintCode =
  | "generic-ai-construction"
  | "stop-slop"
  | "profile-negative-space"
  | "profile-sentence-length"
  | "profile-fragment-ratio"
  | "profile-profanity-register";

export interface DoorMoneyVoiceLintViolation {
  code: DoorMoneyVoiceLintCode;
  rule: string;
  path: string;
  message: string;
}

export interface DoorMoneyVoiceLintMetrics {
  profileVersion: number;
  profileFingerprintHash: string;
  sentenceCount: number;
  meanWordsPerSentence: number;
  fragmentRatio: number;
  allowedMeanWordsPerSentence: { min: number; max: number };
  allowedFragmentRatio: number;
}

export interface DoorMoneyVoiceLintResult {
  passed: boolean;
  violations: DoorMoneyVoiceLintViolation[];
  metrics: DoorMoneyVoiceLintMetrics;
}

function surfaces(item: GhostDeskPackage): TextSurface[] {
  return [
    { path: "hook", text: item.hook, adaptedCopy: true },
    ...item.formatPlans.map((plan, index) => ({
      path: `formatPlans.${index}.reason`,
      text: plan.reason,
      adaptedCopy: false
    })),
    ...item.copyBlocks.map((block, index) => ({
      path: `copyBlocks.${index}.text`,
      text: block.text,
      adaptedCopy: true
    })),
    { path: "rationale", text: item.rationale, adaptedCopy: false },
    { path: "curiosityBridge", text: item.curiosityBridge, adaptedCopy: true },
    ...(item.cta.text === null ? [] : [{ path: "cta.text", text: item.cta.text, adaptedCopy: true }]),
    ...item.bookClaims.map((claim, index) => ({
      path: `bookClaims.${index}.text`,
      text: claim.text,
      adaptedCopy: false
    }))
  ];
}

function wordCount(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function sentenceWordCounts(values: readonly TextSurface[]): number[] {
  return values.flatMap(({ text }) => text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => wordCount(sentence))
    .filter((count) => count > 0));
}

function rounded(value: number, places: number): number {
  return Number(value.toFixed(places));
}

function quotedNegativeSpace(profile: StyleProfile, formats: ReadonlySet<string>): string[] {
  const notes = [
    ...profile.negativeSpace,
    ...profile.formatAdaptations
      .filter(({ format }) => formats.has(format))
      .flatMap(({ avoid }) => avoid)
  ];
  const phrases = notes.flatMap((note) => [...note.matchAll(/[“"]([^”"]{2,80})[”"]/gu)]
    .map((match) => match[1]!.trim())
    .filter(Boolean));
  return [...new Set(phrases.map((phrase) => phrase.toLocaleLowerCase("en-US")))].sort();
}

function occurrences(text: string, terms: readonly string[]): number {
  const lower = text.toLocaleLowerCase("en-US");
  return terms.reduce((total, term) => {
    const escaped = term.toLocaleLowerCase("en-US").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return total + [...lower.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "gu"))].length;
  }, 0);
}

function profanityViolation(input: {
  text: string;
  wordTotal: number;
  profile: StyleProfile;
}): DoorMoneyVoiceLintViolation | null {
  const register = input.profile.vocabularySignature.profanityRegister;
  const terms = [...new Set([...COMMON_PROFANITY, ...register.terms.map(({ value }) => value)])];
  const found = occurrences(input.text, terms);
  const allowed = register.level === "none"
    ? 0
    : register.level === "rare"
      ? Math.max(1, Math.floor(input.wordTotal / 100))
      : register.level === "moderate"
        ? Math.max(2, Math.ceil(input.wordTotal / 25))
        : Number.POSITIVE_INFINITY;
  if (found <= allowed) return null;
  return {
    code: "profile-profanity-register",
    rule: register.level,
    path: "adaptedCopy",
    message: `Adapted copy contains ${found} profanity occurrence(s); profile register ${register.level} allows ${allowed}.`
  };
}

/**
 * Deterministic, zero-cost voice review for one already schema-parsed GHOST package.
 *
 * Verbatim quotations are deliberately absent from the reviewed surfaces: they are source text,
 * not generated voice. DM-15b separately proves that every quotation is an exact private-chunk
 * substring before any package can become a draft.
 */
export function lintDoorMoneyVoice(input: {
  package: GhostDeskPackage;
  styleProfile: StyleProfile;
}): DoorMoneyVoiceLintResult {
  const profile = StyleProfileSchema.parse(input.styleProfile);
  const allSurfaces = surfaces(input.package);
  const adaptedSurfaces = allSurfaces.filter(({ adaptedCopy }) => adaptedCopy);
  const violations: DoorMoneyVoiceLintViolation[] = [];

  for (const surface of allSurfaces) {
    for (const rule of GENERIC_AI_RULES) {
      if (rule.pattern.test(surface.text)) {
        violations.push({
          code: "generic-ai-construction",
          rule: rule.rule,
          path: surface.path,
          message: rule.message
        });
      }
    }
    for (const violation of reviewArticleText(surface.text, "en")) {
      violations.push({
        code: "stop-slop",
        rule: `stet:${violation.code}`,
        path: surface.path,
        message: violation.message
      });
    }
    for (const rule of EXTRA_STOP_SLOP_RULES) {
      if (rule.pattern.test(surface.text)) {
        violations.push({ code: "stop-slop", rule: rule.rule, path: surface.path, message: rule.message });
      }
    }
  }

  const formats = new Set(input.package.formatPlans.map(({ format }) => format));
  for (const phrase of quotedNegativeSpace(profile, formats)) {
    for (const surface of adaptedSurfaces) {
      if (surface.text.toLocaleLowerCase("en-US").includes(phrase)) {
        violations.push({
          code: "profile-negative-space",
          rule: phrase,
          path: surface.path,
          message: `Remove the profile-forbidden construction “${phrase}”.`
        });
      }
    }
  }

  const sentenceCounts = sentenceWordCounts(adaptedSurfaces);
  const wordTotal = sentenceCounts.reduce((sum, count) => sum + count, 0);
  const meanWordsPerSentence = sentenceCounts.length === 0 ? 0 : wordTotal / sentenceCounts.length;
  const fragmentRatio = sentenceCounts.length === 0
    ? 0
    : sentenceCounts.filter((count) => count <= 4).length / sentenceCounts.length;
  const allowedMeanWordsPerSentence = {
    min: rounded(Math.max(1, profile.sentenceRhythm.p10WordsPerSentence * 0.5), 2),
    max: rounded(Math.max(1, profile.sentenceRhythm.p90WordsPerSentence * 1.5), 2)
  };
  const allowedFragmentRatio = rounded(Math.min(1, profile.sentenceRhythm.fragmentRatio + 0.25), 4);

  if (sentenceCounts.length >= 4 && (
    meanWordsPerSentence < allowedMeanWordsPerSentence.min ||
    meanWordsPerSentence > allowedMeanWordsPerSentence.max
  )) {
    violations.push({
      code: "profile-sentence-length",
      rule: "package-mean",
      path: "adaptedCopy",
      message: `Mean sentence length ${rounded(meanWordsPerSentence, 2)} falls outside profile bounds ${allowedMeanWordsPerSentence.min}–${allowedMeanWordsPerSentence.max}.`
    });
  }
  if (sentenceCounts.length >= 4 && fragmentRatio > allowedFragmentRatio) {
    violations.push({
      code: "profile-fragment-ratio",
      rule: "package-fragments",
      path: "adaptedCopy",
      message: `Fragment ratio ${rounded(fragmentRatio, 4)} exceeds the profile-derived ceiling ${allowedFragmentRatio}.`
    });
  }
  const profanity = profanityViolation({
    text: adaptedSurfaces.map(({ text }) => text).join("\n"),
    wordTotal,
    profile
  });
  if (profanity) violations.push(profanity);

  return {
    passed: violations.length === 0,
    violations,
    metrics: {
      profileVersion: profile.profileVersion,
      profileFingerprintHash: profile.fingerprintHash,
      sentenceCount: sentenceCounts.length,
      meanWordsPerSentence: rounded(meanWordsPerSentence, 2),
      fragmentRatio: rounded(fragmentRatio, 4),
      allowedMeanWordsPerSentence,
      allowedFragmentRatio
    }
  };
}
