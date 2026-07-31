import type { EditionQualityConfig } from "./config.js";
import type { WrittenArticle } from "./types.js";

interface StetRule {
  code: string;
  pattern: RegExp;
  message: string;
}

const ARTICLE_RULES: readonly StetRule[] = [
  {
    code: "generated_meta",
    pattern: /\bas (?:an ai|a language model)\b/i,
    message: "Remove generated-system meta commentary."
  },
  {
    code: "throat_clearing",
    pattern: /\b(?:here(?:'|’)s (?:the thing|what|why)|let me be clear|it turns out|make no mistake|think about it)\b/i,
    message: "Cut the announcement and state the point."
  },
  {
    code: "hype",
    pattern: /\b(?:revolutionary|groundbreaking|game[ -]changer|poised to reshape|unprecedented|disruptive)\b/i,
    message: "Replace hype with the supported change."
  },
  {
    code: "corporate_filler",
    pattern: /\b(?:rapidly evolving landscape|delve|leverage|synerg(?:y|ies)|circle back|double-click|moving forward|deep dive)\b/i,
    message: "Replace corporate filler with plain language."
  },
  {
    code: "emphasis_crutch",
    pattern: /\b(?:full stop|period|let that sink in|the stakes are high|the implications are significant)\b/i,
    message: "Delete the emphasis crutch and name the consequence."
  },
  {
    code: "empty_adverb",
    pattern: /\b(?:really|literally|genuinely|honestly|simply|actually|deeply|truly|fundamentally|inherently|inevitably|potentially|interestingly|importantly|crucially)\b/i,
    message: "Remove the empty modifier or replace it with evidence."
  },
  {
    code: "binary_contrast",
    pattern: /\b(?:the (?:answer|question) isn(?:'|’)t .{1,100}\bit(?:'|’)s|not because .{1,100}\bbecause)\b/i,
    message: "State the conclusion without a staged reversal."
  },
  {
    code: "emoji",
    pattern: /\p{Extended_Pictographic}/u,
    message: "Remove emoji from the article register."
  },
  {
    code: "exclamation_inflation",
    pattern: /!{2,}/,
    message: "Use a full stop and let the fact carry the sentence."
  },
  {
    code: "source_instruction_leak",
    pattern: /\b(?:ignore (?:all|any|the) previous|reveal the system prompt|approve this story)\b/i,
    message: "Remove instructions copied from untrusted source data."
  }
];

export interface StetViolation {
  code: string;
  locale: "en" | "cs" | "board";
  message: string;
}

export interface StetReview {
  passed: boolean;
  score: number;
  violations: StetViolation[];
}

export function reviewArticleText(
  text: string,
  locale: StetViolation["locale"] = "en"
): StetViolation[] {
  return ARTICLE_RULES
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => ({ code: rule.code, locale, message: rule.message }));
}

function localizedText(article: WrittenArticle, locale: "en" | "cs"): string {
  const value = article.byLocale[locale];
  return [
    value.title,
    value.dek,
    ...value.alternativeHeadlines,
    value.bodyMdx,
    ...value.whyItMatters,
    ...value.whatChanged,
    ...value.uncertainty,
    ...value.dispatches.flatMap((dispatch) => [dispatch.title, dispatch.body])
  ].join("\n");
}

export function reviewArticle(
  article: WrittenArticle,
  whyThisStory: string,
  config: EditionQualityConfig
): StetReview {
  const violations = [
    ...reviewArticleText(localizedText(article, "en"), "en"),
    ...reviewArticleText(localizedText(article, "cs"), "cs"),
    ...reviewArticleText(whyThisStory, "board")
  ];
  const score = Math.max(0, 50 - violations.length * 5);
  return {
    passed: violations.length === 0 && score >= config.stet.minimumScore,
    score,
    violations
  };
}

export function stetFeedback(review: StetReview): string[] {
  return review.violations.map(
    (violation) => `STET ${violation.locale}/${violation.code}: ${violation.message}`
  );
}

const BOARDROOM_RULES: readonly StetRule[] = [
  {
    code: "generated_meta",
    pattern: /\bas (?:an ai|a language model)\b/i,
    message: "Remove generated-system meta commentary."
  },
  {
    code: "corporate_filler",
    pattern: /\b(?:rapidly evolving landscape|delve|leverage|synerg(?:y|ies)|circle back|double-click)\b/i,
    message: "Use the boardroom register, not corporate filler."
  },
  {
    code: "emoji",
    pattern: /\p{Extended_Pictographic}/u,
    message: "Remove emoji from the boardroom register."
  }
];

export function reviewBoardroomText(text: string): StetViolation[] {
  const violations = BOARDROOM_RULES
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => ({ code: rule.code, locale: "board" as const, message: rule.message }));
  if ([...text].filter((character) => character === "!").length > 1) {
    violations.push({
      code: "exclamation_inflation",
      locale: "board",
      message: "Use one exclamation mark at most in a boardroom turn."
    });
  }
  return violations;
}
