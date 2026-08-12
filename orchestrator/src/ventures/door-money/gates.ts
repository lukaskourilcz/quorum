import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { StyleProfileSchema, type StyleProfile } from "../../contracts/style-profile.js";
import {
  VentureRecommendationSchema,
  type VentureRecommendation
} from "../../contracts/venture-recommendation.js";
import { reviewArticleText } from "../../edition/stet.js";
import { configRoot } from "../../paths.js";
import { atomicWriteJson, readText } from "../../state.js";
import type { DoorMoneyDeskPacket, PrivateBookChunk } from "./kb.js";
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function occurrences(text: string, terms: readonly string[]): number {
  const lower = text.toLocaleLowerCase("en-US");
  return terms.reduce((total, term) => {
    const escaped = escapeRegExp(term.toLocaleLowerCase("en-US"));
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

type RecommendationGateResult = VentureRecommendation["gateResults"][number];

export interface DoorMoneyPackageGateResult {
  passed: boolean;
  gateResults: RecommendationGateResult[];
  failedGates: RecommendationGateResult["gate"][];
  recommendation: VentureRecommendation | null;
}

export interface StoredDoorMoneyDraft {
  recommendation: VentureRecommendation;
  relativePath: string;
  created: boolean;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function recommendationText(item: Pick<
  VentureRecommendation,
  "hook" | "copyBlocks" | "curiosityBridge" | "cta"
>): string {
  return normalizedText([
    item.hook,
    ...item.copyBlocks.map(({ text }) => text),
    item.curiosityBridge,
    item.cta.text ?? ""
  ].join("\n"));
}

function characterTrigrams(value: string): Set<string> {
  const characters = [...value];
  if (characters.length < 3) return new Set(value ? [value] : []);
  return new Set(Array.from(
    { length: characters.length - 2 },
    (_, index) => characters.slice(index, index + 3).join("")
  ));
}

export function doorMoneyRecommendationSimilarity(
  candidate: Pick<VentureRecommendation, "hook" | "copyBlocks" | "curiosityBridge" | "cta">,
  prior: Pick<VentureRecommendation, "hook" | "copyBlocks" | "curiosityBridge" | "cta">
): number {
  const left = characterTrigrams(recommendationText(candidate));
  const right = characterTrigrams(recommendationText(prior));
  if (left.size === 0 && right.size === 0) return 1;
  const shared = [...left].filter((part) => right.has(part)).length;
  return Number(((2 * shared) / (left.size + right.size)).toFixed(8));
}

export async function loadDoorMoneyDuplicateThreshold(
  filePath = path.join(configRoot, "social-policy.json")
): Promise<number> {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as { duplicateThreshold?: unknown };
  if (typeof raw.duplicateThreshold !== "number" || !Number.isFinite(raw.duplicateThreshold) ||
      raw.duplicateThreshold < 0 || raw.duplicateThreshold > 1) {
    throw new Error("Social policy duplicateThreshold must be a finite ratio from 0 to 1");
  }
  return raw.duplicateThreshold;
}

export function doorMoneyRecommendationId(date: string, chunkIds: readonly string[]): string {
  const key = `${date}\n${[...chunkIds].sort().join("\n")}`;
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return `dm-${date}-${digest}`;
}

function privateChunks(packet: DoorMoneyDeskPacket): PrivateBookChunk[] {
  const chunks = new Map<string, PrivateBookChunk>();
  for (const passage of packet.passages) {
    chunks.set(passage.source.id, passage.source);
    for (const neighbor of passage.neighbors) chunks.set(neighbor.id, neighbor);
  }
  return [...chunks.values()];
}

function normalizedWhitespace(value: string): string {
  return value.normalize("NFKC").replaceAll(/\s+/gu, " ").trim();
}

function copiesMoreThanExcerptCap(text: string, sources: readonly string[]): boolean {
  const normalized = normalizedWhitespace(text);
  if (normalized.length <= 600) return false;
  const normalizedSources = sources.map(normalizedWhitespace);
  for (let index = 0; index <= normalized.length - 601; index += 1) {
    const window = normalized.slice(index, index + 601);
    if (normalizedSources.some((source) => source.includes(window))) return true;
  }
  return false;
}

function sentenceSurfaces(item: GhostDeskPackage): Array<{ path: string; sentence: string }> {
  return surfaces(item).flatMap((surface) => surface.text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => ({ path: surface.path, sentence: sentence.trim() }))
    .filter(({ sentence }) => sentence.length > 0));
}

function mentions(text: string, label: string): boolean {
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(label)}(?![\\p{L}\\p{N}_])`,
    "iu"
  ).test(text);
}

const NAME_LEAD_WORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "my", "our", "his", "her",
  "their", "one", "no", "only"
]);
const NON_PERSON_NAMES = new Set(["door money"]);

function nameLikeCandidates(sentence: string): string[] {
  return [...sentence.matchAll(
    /(?<![\p{L}\p{N}_])(\p{Lu}[\p{L}\p{M}'’.-]+(?:\s+\p{Lu}[\p{L}\p{M}'’.-]+)+)(?![\p{L}\p{N}_])/gu
  )]
    .map((match) => match[1]!)
    .filter((candidate) => !NAME_LEAD_WORDS.has(candidate.split(/\s+/u)[0]!.toLocaleLowerCase("en-US")))
    .filter((candidate) => {
      const lower = candidate.toLocaleLowerCase("en-US");
      return ![...NON_PERSON_NAMES].some((name) => lower === name || lower.endsWith(` ${name}`));
    });
}

function livingPersonFailures(item: GhostDeskPackage, packet: DoorMoneyDeskPacket): string[] {
  const chunks = packet.passages.map(({ source }) => source);
  const entities = [...new Map(chunks
    .flatMap(({ annotation }) => annotation.entities)
    .map((entity) => [entity.id, entity])).values()];
  const knownLabels = new Set(entities.map(({ label }) => label.toLocaleLowerCase("en-US")));
  const sensitiveLabels = entities
    .filter(({ kind, personSensitive }) => kind === "person" && personSensitive)
    .map(({ label }) => label);
  const failures = new Set<string>();
  for (const { path: surfacePath, sentence } of sentenceSurfaces(item)) {
    const exactSourceSentence = chunks.some(({ text }) => text.includes(sentence));
    for (const label of sensitiveLabels) {
      if (mentions(sentence, label) && !exactSourceSentence) failures.add(`${surfacePath}:${label}`);
    }
    for (const candidate of nameLikeCandidates(sentence)) {
      if (!knownLabels.has(candidate.toLocaleLowerCase("en-US")) && !exactSourceSentence) {
        failures.add(`${surfacePath}:${candidate}`);
      }
    }
  }
  return [...failures].sort();
}

function boundedExcerpt(value: string): string {
  let excerpt = "";
  for (const character of value.trim()) {
    if ((excerpt + character).length > 600) break;
    excerpt += character;
  }
  return excerpt.trim();
}

function receipt(
  gate: RecommendationGateResult["gate"],
  passed: boolean,
  detail: string
): RecommendationGateResult {
  return { gate, passed, detail: detail.slice(0, 500) };
}

function recommendationShape(item: GhostDeskPackage) {
  return {
    hook: item.hook,
    copyBlocks: item.copyBlocks,
    curiosityBridge: item.curiosityBridge,
    cta: item.cta
  };
}

export function gateDoorMoneyPackage(input: {
  package: GhostDeskPackage;
  packet: DoorMoneyDeskPacket;
  priorRecommendations: readonly VentureRecommendation[];
  duplicateThreshold: number;
  now: Date;
}): DoorMoneyPackageGateResult {
  if (!Number.isFinite(input.duplicateThreshold) || input.duplicateThreshold < 0 ||
      input.duplicateThreshold > 1) {
    throw new Error("Door Money duplicate threshold must be a finite ratio from 0 to 1");
  }
  const item = input.package;
  const selected = new Map(input.packet.passages.map((passage) => [passage.source.id, passage]));
  const candidateId = doorMoneyRecommendationId(input.packet.date, item.sourceRefs);
  const voice = lintDoorMoneyVoice({ package: item, styleProfile: input.packet.styleProfile });
  const claimFailures = item.bookClaims.length === 0 ? ["missing-declarations"] : [];
  for (const sourceRef of item.sourceRefs) {
    if (!selected.has(sourceRef)) claimFailures.push(`unresolved-source:${sourceRef}`);
  }
  for (const [claimIndex, claim] of item.bookClaims.entries()) {
    for (const chunkId of claim.chunkIds) {
      if (!item.sourceRefs.includes(chunkId) || !selected.has(chunkId)) {
        claimFailures.push(`claim-${claimIndex}:${chunkId}`);
      }
    }
  }

  const quoteFailures: string[] = [];
  for (const [quoteIndex, quote] of item.verbatimQuotes.entries()) {
    const source = selected.get(quote.chunkId)?.source.text;
    if (!source || !source.includes(quote.text)) quoteFailures.push(`quote-${quoteIndex}`);
  }

  const sourceTexts = privateChunks(input.packet).map(({ text }) => text);
  const capFailures = surfaces(item)
    .filter(({ text }) => copiesMoreThanExcerptCap(text, sourceTexts))
    .map(({ path: surfacePath }) => surfacePath);
  if (item.verbatimQuotes.some(({ text }) => text.length > 600)) capFailures.push("verbatimQuotes");

  const prior = input.priorRecommendations.filter(({ id }) => id !== candidateId);
  const closest = prior
    .map((recommendation) => ({
      recommendation,
      score: doorMoneyRecommendationSimilarity(recommendationShape(item), recommendation)
    }))
    .sort((left, right) => right.score - left.score || left.recommendation.id.localeCompare(right.recommendation.id))[0];
  const duplicatePassed = !closest || closest.score < input.duplicateThreshold;

  const candidateDay = Date.parse(`${input.packet.date}T00:00:00.000Z`);
  const recentExplicit = prior.filter((recommendation) => {
    const days = (candidateDay - Date.parse(`${recommendation.date}T00:00:00.000Z`)) / 86_400_000;
    return days >= 0 && days < 7 && recommendation.cta.mode === "explicit-buy-book";
  });
  const ctaPassed = item.cta.mode !== "explicit-buy-book" || recentExplicit.length === 0;
  const personFailures = livingPersonFailures(item, input.packet);

  const gateResults: RecommendationGateResult[] = [
    receipt(
      "voice",
      voice.passed,
      voice.passed
        ? `Profile v${voice.metrics.profileVersion} (${voice.metrics.profileFingerprintHash}) passed deterministic voice lint.`
        : `${voice.violations.length} deterministic voice violation(s) blocked this package.`
    ),
    receipt(
      "claims",
      claimFailures.length === 0,
      claimFailures.length === 0
        ? `${item.bookClaims.length} declared book claim(s) resolve only to selected chunk refs.`
        : `${claimFailures.length} book-claim reference failure(s) blocked this package.`
    ),
    receipt(
      "quotes",
      quoteFailures.length === 0,
      quoteFailures.length === 0
        ? `${item.verbatimQuotes.length} declared quote(s) are exact selected-chunk substrings.`
        : `${quoteFailures.length} quote substring failure(s) blocked this package.`
    ),
    receipt(
      "excerpt-cap",
      capFailures.length === 0,
      capFailures.length === 0
        ? "No generated surface copies more than the 600-character source ceiling."
        : `${capFailures.length} source-copy cap failure(s) exceeded 600 characters.`
    ),
    receipt(
      "duplicate",
      duplicatePassed,
      closest
        ? `Closest prior package ${closest.recommendation.id} scored ${closest.score}; threshold ${input.duplicateThreshold}.`
        : `No prior package exists; threshold ${input.duplicateThreshold}.`
    ),
    receipt(
      "cta-frequency",
      ctaPassed,
      ctaPassed
        ? "The rolling seven-day history permits this CTA mode."
        : `${recentExplicit.length} explicit buy-the-book CTA(s) already occupy the rolling seven-day window.`
    ),
    receipt(
      "living-person",
      personFailures.length === 0,
      personFailures.length === 0
        ? "Named-person copy adds no factual sentence absent from the selected manuscript chunks."
        : `${personFailures.length} named-person sentence(s) lack exact selected-manuscript support.`
    )
  ];
  const failedGates = gateResults.filter(({ passed }) => !passed).map(({ gate }) => gate);
  if (failedGates.length > 0) {
    return { passed: false, gateResults, failedGates, recommendation: null };
  }

  const excerptChunkId = item.sourceRefs[0]!;
  const passage = selected.get(excerptChunkId)!;
  const excerpt = boundedExcerpt(passage.source.text);
  if (excerpt.length === 0) throw new Error("Door Money cannot store an empty source excerpt");
  const timestamp = input.now.toISOString();
  const recommendation = VentureRecommendationSchema.parse({
    schemaVersion: "venture-recommendation/1",
    id: candidateId,
    ventureId: "door-money",
    date: input.packet.date,
    status: "draft",
    hook: item.hook,
    formats: unique(item.formatPlans.map(({ format }) => format)),
    platforms: unique(item.formatPlans.flatMap(({ platforms }) => platforms)),
    copyBlocks: item.copyBlocks,
    rationale: item.rationale,
    curiosityBridge: item.curiosityBridge,
    cta: item.cta,
    evidence: {
      kind: "book-passage",
      manuscriptHash: input.packet.manuscriptHash,
      chunkIds: item.sourceRefs,
      scoresAtSelection: item.sourceRefs.map((chunkId) => ({
        chunkId,
        scores: selected.get(chunkId)!.selection.scoresAtSelection
      })),
      excerptChunkId,
      excerpt,
      privateStoreLink: `private-book://sha256/${input.packet.manuscriptHash.slice("sha256:".length)}/chunks/${excerptChunkId}.json`
    },
    gateResults,
    designLab: {
      eligible: item.formatPlans.some(({ format }) => format === "carousel" || format === "single-image"),
      summaryPath: null,
      readyAt: null
    },
    owner: {
      editedCopyBlocks: null,
      approvalNote: null,
      rejectionReason: null,
      approvedAt: null,
      rejectedAt: null,
      postedAt: null,
      archivedAt: null,
      postedUrl: null,
      resultIds: [],
      ratingRef: null
    },
    statusHistory: [{ from: null, to: "draft", at: timestamp, actor: "system", reason: null }],
    generatedAt: timestamp,
    updatedAt: timestamp
  });
  return { passed: true, gateResults, failedGates: [], recommendation };
}

export async function storeDoorMoneyDraft(
  root: string,
  recommendation: VentureRecommendation
): Promise<StoredDoorMoneyDraft> {
  const checked = VentureRecommendationSchema.parse(recommendation);
  const relativePath = `ventures/door-money/recommendations/${checked.id}.json`;
  const existingRaw = await readText(root, relativePath);
  if (existingRaw) {
    const existing = VentureRecommendationSchema.parse(JSON.parse(existingRaw));
    const sameIdentity = existing.id === checked.id && existing.date === checked.date &&
      [...existing.evidence.chunkIds].sort().join("\n") === [...checked.evidence.chunkIds].sort().join("\n");
    if (!sameIdentity) throw new Error("Door Money recommendation id collided with different date or chunks");
    return { recommendation: existing, relativePath, created: false };
  }
  await atomicWriteJson(root, relativePath, checked);
  return { recommendation: checked, relativePath, created: true };
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
    // Social adaptations compress the manuscript cadence; the recorded p10 remains the
    // anchor, with room for a short cover or spoken line but not package-wide fragments.
    min: rounded(Math.max(1, profile.sentenceRhythm.p10WordsPerSentence * 0.35), 2),
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
