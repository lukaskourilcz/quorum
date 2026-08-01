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

function linkedFighterLabels(body: string): string[] {
  return [...body.matchAll(/\[([^\]]+)\]\(\/fighters\/(?:ufc|ksw|oktagon)\/[a-z0-9-]+\)/giu)]
    .map((match) => match[1]!)
    .sort();
}

function figures(body: string): string[] {
  return [...body.matchAll(/\b\d+(?:[.,]\d+)?(?:%|[-–]\d+)?\b/gu)]
    .map((match) => match[0]!.replace(",", "."))
    .sort();
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
  const enFigures = figures(article.localizations.en.bodyMDX);
  const csFigures = figures(article.localizations.cs.bodyMDX);
  if (JSON.stringify(enFigures) !== JSON.stringify(csFigures)) {
    violations.push({ code: "figure-parity", locale: "cs", message: "English and Czech bodies must carry the same figures." });
  }
  const enNames = linkedFighterLabels(article.localizations.en.bodyMDX);
  const csNames = linkedFighterLabels(article.localizations.cs.bodyMDX);
  if (JSON.stringify(enNames) !== JSON.stringify(csNames)) {
    violations.push({ code: "fighter-name-parity", locale: "cs", message: "Fighter names must stay unchanged across languages." });
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
