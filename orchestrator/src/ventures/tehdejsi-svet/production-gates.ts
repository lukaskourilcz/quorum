import type { TehdejsiFact } from "../../contracts/tehdejsi-facts.js";
import type { TsStoryBrief } from "../../contracts/ts-story-brief.js";
import type { GateIssue } from "./gates.js";
import { TS_MAX_SLIDE_WORDS, wordCount, type TsBilingualDraft } from "./produce.js";

/**
 * What has to be true of a finished package before it is stored as a draft.
 *
 * Every rule here fails the package rather than fixing it. A gate that repairs its input is a
 * gate that hides how often the room gets something wrong, and this venture's whole argument for
 * running unattended is that its failures are visible and counted.
 *
 * The order is deliberate: cheapest and most objective first, so the reason a package dropped is
 * the most specific one available rather than whichever check happened to run.
 */
export const TS_TAG_PROMPTS_PER_WEEK = 1;
export const TS_PRODUCT_LINK_SHARE = 0.5;

/**
 * Generic and clickbait phrasing, in both languages the venture publishes in.
 *
 * Two patterns rather than one, because `\b` is defined on `[A-Za-z0-9_]` and so never fires
 * beside a Cyrillic letter. A single pattern would silently pass every Ukrainian phrase in it
 * while looking exactly like a pattern that checked them.
 */
const STOP_SLOP_LATIN =
  /\b(?:delve|tapestry|game[ -]?changer|you won't believe|neuv[ěe][řr][íi]te|fascinuj[íi]c[íi] cesta|v dnešn[íi]m usp[ěe]chan[ée]m sv[ěe]t[ěe])\b|nen[íi] jen.{0,80}ale/iu;

const STOP_SLOP_CYRILLIC =
  /(?:ви не повірите|неймовірна історія|у сучасному швидкому світі|це змінить усе)/iu;

function isSlop(text: string): boolean {
  return STOP_SLOP_LATIN.test(text) || STOP_SLOP_CYRILLIC.test(text);
}

export interface TsPriorFeature {
  /** Package id, so a duplicate names the feature it duplicates. */
  id: string;
  date: string;
  factIds: readonly string[];
  ctaKind: string;
  slidesCs: readonly string[];
  slidesUa: readonly string[];
}

export interface TsProductionGateInput {
  brief: TsStoryBrief;
  draft: TsBilingualDraft;
  /** The facts the brief selected, for resolving claims and their sourcing. */
  facts: readonly TehdejsiFact[];
  priorFeatures: readonly TsPriorFeature[];
  /** Quotes the copy is allowed to contain, verbatim, from facts or dossiers. */
  permittedQuotes?: readonly string[];
  date: string;
}

function normalise(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function fingerprint(slides: readonly string[]): string {
  return normalise(slides.join(" "));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * Every claim resolves to a fact this repository holds or a dossier this brief read.
 *
 * A claim whose only evidence is one source may still ship, but only in single-source framing —
 * the brief marks it and the copy has to carry it. What is refused is the other direction: a
 * claim marked as settled that one source is all there is behind.
 */
function claimIssues(input: TsProductionGateInput): GateIssue[] {
  const issues: GateIssue[] = [];
  const byId = new Map(input.facts.map((fact) => [fact.id, fact]));
  for (const claim of input.brief.claims) {
    const resolved = claim.factIds.filter((factId) => byId.has(factId));
    if (resolved.length === 0 && claim.dossierRefs.length === 0) {
      issues.push({
        rule: "claims:unresolved",
        detail: `Claim ${claim.claimId} resolves to no fact and no dossier.`
      });
      continue;
    }
    const sources = resolved.reduce((sum, factId) => sum + (byId.get(factId)?.sources.length ?? 0), 0)
      + claim.dossierRefs.length;
    if (sources < 2 && !claim.singleSourceFraming) {
      issues.push({
        rule: "claims:single-source-unframed",
        detail: `Claim ${claim.claimId} rests on one source and is not marked for single-source framing.`
      });
    }
  }
  return issues;
}

/**
 * A quote in the copy is a quote somebody said.
 *
 * Anything between quotation marks has to appear verbatim in a permitted source string. The
 * check is substring rather than equality because the copy legitimately quotes part of a
 * sentence, and it is deliberately blind to which language the quote is in — a Czech quotation
 * of a Ukrainian source is a translation of a quotation, which is not a quotation.
 */
function quoteIssues(input: TsProductionGateInput): GateIssue[] {
  const permitted = (input.permittedQuotes ?? []).map(normalise);
  const issues: GateIssue[] = [];
  const texts = input.draft.slides.flatMap((slide) => [slide.cs, slide.ua])
    .concat([input.draft.captionCs, input.draft.captionUa]);
  for (const text of texts) {
    for (const match of text.matchAll(/[„“"«»]([^„“"«»]{4,300})[„“"«»]/gu)) {
      const quoted = normalise(match[1]!);
      if (quoted.length === 0) continue;
      if (!permitted.some((source) => source.includes(quoted))) {
        issues.push({
          rule: "quotes:unsourced",
          detail: `The copy quotes "${match[1]!.slice(0, 60)}", which appears in no permitted source.`
        });
      }
    }
  }
  return issues;
}

/**
 * The CTA budget, counted over what actually shipped.
 *
 * Tag prompts at most once a week and product links at most half of features: the two ways a
 * feed stops being about the past and starts being about itself. Both are counted over the prior
 * features plus this one, because a limit that excludes the package being judged is a limit the
 * package always passes.
 */
function ctaIssues(input: TsProductionGateInput): GateIssue[] {
  const issues: GateIssue[] = [];
  const recent = input.priorFeatures.filter((prior) => daysBetween(prior.date, input.date) < 7);
  if (input.brief.ctaKind === "tag-a-friend") {
    const tags = recent.filter((prior) => prior.ctaKind === "tag-a-friend").length + 1;
    if (tags > TS_TAG_PROMPTS_PER_WEEK) {
      issues.push({
        rule: "cta:tag-prompt-frequency",
        detail: `This would be tag prompt ${tags} in seven days; the limit is ${TS_TAG_PROMPTS_PER_WEEK}.`
      });
    }
  }
  if (input.brief.ctaKind === "product-link") {
    const total = input.priorFeatures.length + 1;
    const links = input.priorFeatures.filter((prior) => prior.ctaKind === "product-link").length + 1;
    if (links > total * TS_PRODUCT_LINK_SHARE) {
      issues.push({
        rule: "cta:product-link-share",
        detail: `This would make ${links} of ${total} features product links; the limit is half.`
      });
    }
  }
  return issues;
}

/**
 * Duplicates and near-repeats, judged per language.
 *
 * An exact fingerprint match is a duplicate. A feature about a fact the desk already used inside
 * three weeks is a repeat even when the words differ, because the reader recognises the subject
 * rather than the sentence.
 */
function duplicateIssues(input: TsProductionGateInput): GateIssue[] {
  const issues: GateIssue[] = [];
  const csPrint = fingerprint(input.draft.slides.map((slide) => slide.cs));
  const uaPrint = fingerprint(input.draft.slides.map((slide) => slide.ua));
  for (const prior of input.priorFeatures) {
    if (fingerprint(prior.slidesCs) === csPrint || fingerprint(prior.slidesUa) === uaPrint) {
      issues.push({ rule: "duplicate:copy", detail: `This copy already shipped as ${prior.id}.` });
      break;
    }
  }
  const repeated = input.priorFeatures.find((prior) =>
    daysBetween(prior.date, input.date) < 21 &&
    prior.factIds.some((factId) => input.brief.factIds.includes(factId)));
  if (repeated) {
    issues.push({
      rule: "duplicate:recent-subject",
      detail: `${repeated.id} used the same fact on ${repeated.date}, inside the three-week window.`
    });
  }
  return issues;
}

export interface TsProductionVerdict {
  passed: boolean;
  issues: GateIssue[];
}

/**
 * The whole verdict on a finished package.
 *
 * Craft and anti-mirror findings from the two passes are carried in rather than re-derived, so
 * the package is judged once on everything that was checked about it.
 */
export function gateTsPackage(input: TsProductionGateInput): TsProductionVerdict {
  const issues: GateIssue[] = [];

  for (const slide of input.draft.slides) {
    for (const [language, text] of [["cs", slide.cs], ["uk", slide.ua]] as const) {
      if (text.trim().length === 0) {
        issues.push({ rule: "slides:empty", detail: `Slide ${slide.ordinal} has no ${language} copy.` });
        continue;
      }
      const count = wordCount(text);
      if (count > TS_MAX_SLIDE_WORDS) {
        issues.push({
          rule: "slides:word-cap",
          detail: `Slide ${slide.ordinal} ${language} runs to ${count} words; the cap is ${TS_MAX_SLIDE_WORDS}.`
        });
      }
    }
  }
  if (input.draft.slides.length !== input.brief.slideBeats.length) {
    issues.push({
      rule: "slides:beat-count",
      detail: `The brief planned ${input.brief.slideBeats.length} slides and the package has ${input.draft.slides.length}.`
    });
  }
  if (input.brief.contextLineRequired && (input.draft.contextLine ?? "").trim().length === 0) {
    issues.push({
      rule: "tier1:missing-context-line",
      detail: "A tier-1 feature carries one honest line about the system the everyday detail sat inside."
    });
  }

  for (const [language, text] of [
    ["cs", [...input.draft.slides.map((slide) => slide.cs), input.draft.captionCs].join("\n")],
    ["uk", [...input.draft.slides.map((slide) => slide.ua), input.draft.captionUa].join("\n")]
  ] as const) {
    if (isSlop(text)) {
      issues.push({ rule: `stop-slop:${language}`, detail: `The ${language} copy carries banned generic phrasing.` });
    }
  }

  issues.push(...claimIssues(input), ...quoteIssues(input), ...ctaIssues(input), ...duplicateIssues(input));
  // Findings the two passes already produced. Carried, not recomputed: a second computation is a
  // second chance to disagree with the first.
  issues.push(...input.draft.findings.map((finding) => ({ rule: finding.rule, detail: finding.detail })));

  return { passed: issues.length === 0, issues };
}

export interface TsDropTally {
  attempted: number;
  stored: number;
  dropped: number;
  /** How many packages each rule cost, so a rule that fires constantly is visible. */
  byRule: Record<string, number>;
}

/**
 * Failed packages drop, and the drop is counted.
 *
 * The tally is the venture's own evidence about itself. A rule that drops every package is
 * either a broken rule or a broken room, and neither shows up anywhere if the failures are
 * silent.
 */
export function tallyDrops(verdicts: readonly TsProductionVerdict[]): TsDropTally {
  const byRule: Record<string, number> = {};
  for (const verdict of verdicts) {
    // One count per rule per package: a package failing the word cap on six slides failed one
    // rule, and counting six would make the cap look like the venture's biggest problem.
    for (const rule of new Set(verdict.issues.map((issue) => issue.rule))) {
      byRule[rule] = (byRule[rule] ?? 0) + 1;
    }
  }
  const stored = verdicts.filter((verdict) => verdict.passed).length;
  return { attempted: verdicts.length, stored, dropped: verdicts.length - stored, byRule };
}

/**
 * The path a stored draft takes, which is a function of the cycle and the story and nothing else.
 *
 * Idempotency lives in the name rather than in a check before the write: two runs of the same
 * cycle over the same story write the same file, so a re-run corrects rather than duplicates.
 */
export function draftPath(cycleId: string, briefId: string): string {
  return `ventures/tehdejsi-svet/drafts/${cycleId}--${briefId}.json`;
}
