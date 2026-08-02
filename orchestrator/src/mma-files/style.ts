import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ArticlePackage } from "../contracts/mma-files.js";
import { repoRoot } from "../paths.js";

export type MmaFilesLocale = "en" | "cs";

export interface CopyViolation {
  code: string;
  locale: MmaFilesLocale;
  message: string;
}

const slopTells: Record<MmaFilesLocale, readonly string[]> = {
  en: [
    "in the world of mma", "epic showdown", "look no further", "testament to",
    "electrifying clash", "fans are in for a treat", "only time will tell",
    "left an indelible mark", "pivotal moment", "delve into"
  ],
  cs: [
    "ve světě mma", "epický souboj", "podívejme se blíže", "v neposlední řadě",
    "zanechal nesmazatelnou stopu", "fanoušci se mají na co těšit", "jen čas ukáže",
    "klíčový milník", "elektrizující střet", "pojďme se ponořit"
  ]
};

const toutWords = /\b(?:lock|can't lose|cannot lose|guaranteed|smash|sure thing|easy money|units?)\b/iu;
const czechToutWords = /\b(?:jistota|nemůže prohrát|garantovan[áýé]|snadné peníze)\b/iu;
const sourceMarker = /(?:\[\^source-\d+\]|\[source:[^\]]+\])/iu;

/**
 * Remove the grounding markers from copy that is about to be read by a person.
 *
 * A marker is how a writer proves a figure came from a record, and reviewArticleCopy rejects
 * any line carrying a figure without one. It is not a citation a reader can use: it names a
 * path inside this repository, and the first published article printed
 * "[source:state/mma/fighters/ufc:valentina-shevchenko.json]" in the middle of a Czech
 * sentence. The article package keeps every one of those paths in its sources array, so the
 * provenance survives; only the prose is cleaned, and only after the gate has checked it.
 */
export function stripSourceMarkers(body: string): string {
  return body
    .replaceAll(new RegExp(sourceMarker.source, "giu"), "")
    // A marker almost always trails a sentence, so removing it leaves a space before the full
    // stop or a double space mid-paragraph. Neither should reach the page.
    .replaceAll(/[ \t]+([.,;:!?])/gu, "$1")
    .replaceAll(/[ \t]{2,}/gu, " ")
    .replaceAll(/[ \t]+$/gmu, "")
    .trim();
}
const quoteLine = /^\s*>/u;
const numericClaim = /(?:\d|%|\$|€|£)/u;
const probabilityClaim = /(?:\bchance\b|\bprobabilit|\bpravděpodob|\bšanc[ei]\b)[^\n]{0,48}%|%[^\n]{0,48}(?:\bchance\b|\bprobabilit|\bpravděpodob|\bšanc[ei]\b)/iu;

const uninflectedCzechNames = [
  /\b(?:s|se)\s+Vémola\b/iu,
  /\bproti\s+Végh\b/iu,
  /\bo\s+Procházka\b/iu
];

function linesWithClaims(body: string): string[] {
  return body.split(/\r?\n/u).filter((line) =>
    (numericClaim.test(line) || quoteLine.test(line)) && !/^\s*(?:import|export)\b/u.test(line)
  );
}

function fighterPath(reference: string): string {
  const [org, slug] = reference.split(":");
  return `/fighters/${org}/${slug}`;
}

function linkedFighters(body: string): Array<{ href: string; label: string }> {
  return [...body.matchAll(/\[([^\]]+)\]\((\/fighters\/(?:ufc|oktagon)\/[a-z0-9-]+)\)/giu)]
    .map((match) => ({ href: match[2]!.toLowerCase(), label: match[1]! }))
    .sort((left, right) => left.href.localeCompare(right.href) || left.label.localeCompare(right.label));
}

/**
 * Whether a Czech label is the same name as its English counterpart, allowing for declension.
 *
 * Czech puts names in grammatical case, so Alexa Grasso becomes "Alexu Grasso" in the
 * accusative. Comparing the labels byte for byte therefore rejected every Czech article that
 * followed the stylebook, which asks HACEK to decline names naturally: the desk's first
 * fighter profile was blocked on exactly this, with the two bodies agreeing on every figure,
 * every source and every link target. A declension keeps the stem and changes the ending, so
 * that is what this compares, word by word.
 */
function sameNameAcrossLocales(english: string, czech: string): boolean {
  const left = english.split(/\s+/u).filter(Boolean);
  const right = czech.split(/\s+/u).filter(Boolean);
  if (left.length !== right.length) return false;
  return left.every((word, index) => {
    const other = right[index]!;
    const lowerWord = word.toLowerCase();
    const lowerOther = other.toLowerCase();
    let shared = 0;
    while (shared < lowerWord.length && shared < lowerOther.length && lowerWord[shared] === lowerOther[shared]) shared += 1;
    // A short name has no room to lose three characters and still mean the same person, so the
    // stem must be at least three characters and must survive all but the final few.
    return shared >= 3 && shared >= Math.min(lowerWord.length, lowerOther.length) - 3;
  });
}

function figures(body: string): string[] {
  return [...body.matchAll(/\b\d+(?:[.,]\d+)?(?:%|[-–]\d+)?\b/gu)]
    .map((match) => match[0]!.replace(",", "."))
    .sort();
}

/** English groups thousands with a comma: 1,391 is one figure, not 1 and 391. */
function ungroupEnglish(body: string): string {
  return body.replaceAll(/(?<!\d)(\d{1,3}),(\d{3})(?!\d)/gu, "$1$2");
}

/**
 * Undo Czech thousands grouping, which is a space rather than a comma.
 *
 * A Czech "1 391" is the same figure as an English "1,391", and reading it as two numbers
 * blocked the desk's first fighter profile on figure-parity when both bodies said 1,391
 * seconds. Merging on the space alone would be too eager, since a Czech sentence can put a
 * three-digit number straight after another number, so a pair is only joined when English
 * states that exact figure. Parity is the question being asked, so English is the reference.
 *
 * The separator class holds the four characters a writer or an editor may produce for this:
 * space, no-break space, narrow no-break space, thin space.
 */
function ungroupCzech(body: string, englishFigures: ReadonlySet<string>): string {
  return body.replaceAll(
    /(?<!\d)(\d{1,3})[    ](\d{3})(?!\d)/gu,
    (match, lead: string, tail: string) => englishFigures.has(`${lead}${tail}`) ? `${lead}${tail}` : match
  );
}

export async function loadStylebook(
  root = repoRoot
): Promise<string> {
  return readFile(path.join(root, "state", "ventures", "mma-files", "STYLEBOOK.md"), "utf8");
}

export function stylebookPacket(raw: string, locale: MmaFilesLocale): string {
  const start = locale === "en" ? "## English desk" : "## Czech desk";
  const end = locale === "en" ? "## Czech desk" : null;
  const startIndex = raw.indexOf(start);
  if (startIndex < 0) throw new Error(`STYLEBOOK.md is missing ${start}`);
  const endIndex = end ? raw.indexOf(end, startIndex + start.length) : raw.length;
  const packet = raw.slice(startIndex, endIndex < 0 ? raw.length : endIndex).trim();
  if (!packet.includes("Slop tells") && !packet.includes("Znaky strojového textu")) {
    throw new Error(`STYLEBOOK.md is missing the ${locale} slop-tells section`);
  }
  return packet;
}

export function validateStylebook(raw: string): string[] {
  const violations: string[] = [];
  for (const heading of [
    "## English desk", "### Ledes", "### Recaps and previews", "### Slop tells",
    "## Czech desk", "### Začátky článků", "### Reporty a pozvánky",
    "### Slovník a skloňování", "### Znaky strojového textu"
  ]) if (!raw.includes(heading)) violations.push(`missing:${heading}`);
  const borrowedFragments = [...raw.matchAll(/[“"]([^”"]+)[”"]/gu)]
    .map((match) => match[1]!)
    .filter((fragment) => !fragment.startsWith("http"));
  for (const fragment of borrowedFragments) {
    if (fragment.trim().split(/\s+/u).length > 12) violations.push(`fragment-over-12:${fragment}`);
  }
  return violations;
}

export function reviewArticleCopy(
  article: ArticlePackage,
  locale: MmaFilesLocale,
  options: { mode: "data-only" | "live-analysis" }
): CopyViolation[] {
  const copy = article.localizations[locale];
  const combined = `${copy.title}\n${copy.dek}\n${copy.bodyMDX}`;
  const lower = combined.toLocaleLowerCase(locale === "cs" ? "cs-CZ" : "en-US");
  const violations: CopyViolation[] = [];
  const add = (code: string, message: string) => violations.push({ code, locale, message });

  for (const phrase of slopTells[locale]) {
    if (lower.includes(phrase)) add("stylebook-slop", `Remove the machine-written phrase “${phrase}”.`);
  }
  if ((locale === "en" ? toutWords : czechToutWords).test(combined)) {
    add("tout-language", "Betting-tout language is not allowed.");
  }
  if (combined.includes("—")) add("em-dash", "Use a full stop, comma or colon instead of an em dash.");
  for (const line of linesWithClaims(copy.bodyMDX)) {
    if (!sourceMarker.test(line)) add("ungrounded-claim", `A figure or quote has no source marker: ${line.slice(0, 100)}`);
  }
  for (const fighterRef of article.fighterRefs) {
    if (!copy.bodyMDX.includes(`](${fighterPath(fighterRef)})`)) {
      add("missing-fighter-link", `The article must link ${fighterRef} to ${fighterPath(fighterRef)}.`);
    }
  }
  if (locale === "cs" && uninflectedCzechNames.some((pattern) => pattern.test(combined))) {
    add("czech-declension", "A known fighter name is not declined in running Czech text.");
  }
  if (probabilityClaim.test(combined)) {
    if (options.mode === "data-only") add("mode-probability", "Probabilities stay out of articles while FightAIQ is data-only.");
    if (!article.modelVersion) add("missing-model-version", "A probability needs the exact model version.");
    if (article.modelVersion && !combined.includes(article.modelVersion)) add("model-version-not-shown", "Show the model version beside the probability.");
  }
  if (article.format === "post-event-recap") {
    const required = locale === "cs" ? "co jsme psali před zápasem" : "what we said beforehand";
    if (!lower.includes(required)) add("recap-honesty", `A recap must include “${required}”.`);
  }
  return violations;
}

export function reviewBilingualParity(article: ArticlePackage): CopyViolation[] {
  const violations: CopyViolation[] = [];
  const enFigures = figures(ungroupEnglish(article.localizations.en.bodyMDX));
  const csFigures = figures(ungroupCzech(article.localizations.cs.bodyMDX, new Set(enFigures)));
  if (JSON.stringify(enFigures) !== JSON.stringify(csFigures)) {
    violations.push({ code: "figure-parity", locale: "cs", message: "English and Czech bodies must carry the same figures." });
  }
  // Identity lives in the link target, not the spelling. The old check compared labels only,
  // so an English body could hang Grasso's name on Shevchenko's page and pass; now the two
  // bodies must point at the same profiles, and each label must be the same name as its
  // counterpart once Czech declension is allowed for.
  const enLinks = linkedFighters(article.localizations.en.bodyMDX);
  const csLinks = linkedFighters(article.localizations.cs.bodyMDX);
  if (JSON.stringify(enLinks.map(({ href }) => href)) !== JSON.stringify(csLinks.map(({ href }) => href))) {
    violations.push({ code: "fighter-link-parity", locale: "cs", message: "English and Czech bodies must link the same fighter profiles." });
  } else if (enLinks.some((link, index) => !sameNameAcrossLocales(link.label, csLinks[index]!.label))) {
    violations.push({ code: "fighter-name-parity", locale: "cs", message: "A Czech fighter name may be declined but must stay the same name." });
  }
  return violations;
}

export function reviewArticle(
  article: ArticlePackage,
  options: { mode: "data-only" | "live-analysis" }
): CopyViolation[] {
  return [
    ...reviewArticleCopy(article, "en", options),
    ...reviewArticleCopy(article, "cs", options),
    ...reviewBilingualParity(article)
  ];
}
