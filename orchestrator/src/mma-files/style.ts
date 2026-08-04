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
 * Remove any inline source marker from copy that is about to be read by a person.
 *
 * Nothing asks for one any more. The writer's instruction used to demand a [source:repo/path]
 * marker on every figure and reviewArticleCopy used to reject a figure without one; both are
 * gone, because a marker names a path inside this repository rather than a citation a reader
 * can follow, and the first published article printed
 * "[source:state/mma/fighters/ufc:valentina-shevchenko.json]" in the middle of a Czech
 * sentence. This stays as the normalizer that makes "no markers in the copy" true whatever the
 * model emits out of habit, the way the edition pipeline repairs a formatting fault rather than
 * throwing an already-billed article away over one. It runs before the copy gate, so the text
 * reviewed is the text stored. Provenance is unaffected: the package's sources array is built
 * from the files the evidence packet was read from, in code, and never from the prose.
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
const probabilityClaim = /(?:\bchance\b|\bprobabilit|\bpravděpodob|\bšanc[ei]\b)[^\n]{0,48}%|%[^\n]{0,48}(?:\bchance\b|\bprobabilit|\bpravděpodob|\bšanc[ei]\b)/iu;

const uninflectedCzechNames = [
  /\b(?:s|se)\s+Vémola\b/iu,
  /\bproti\s+Végh\b/iu,
  /\bo\s+Procházka\b/iu
];

function fighterPath(reference: string): string {
  const [org, slug] = reference.split(":");
  return `/fighters/${org}/${slug}`;
}

/**
 * Every fighter profile the body sends a reader to, however the path is spelled.
 *
 * Deliberately wider than `linkedFighters` below, which only recognizes the two orgs the desk
 * covers because it compares two tellings of one article. Here an unrecognized org is the
 * finding, not something to skip: `/fighters/pfl/somebody` points at a fighter this desk keeps
 * no record of, and a matcher that ignored it would let exactly that through.
 */
function linkedFighterPaths(body: string): string[] {
  return [...body.matchAll(/\[[^\]]+\]\((\/fighters\/[^)\s]+)\)/gu)].map((match) => match[1]!);
}

/**
 * Every absolute URL in the body, markdown-linked or bare.
 *
 * The character class is the edition writer's, from `everyHttpsUrl`, widened to http because a
 * plain-text link out is the thing being caught rather than a scheme being validated. Trailing
 * punctuation can ride along on a bare URL; that only ever makes a match fail to be one of the
 * supplied URLs, which is a finding either way.
 */
function bodyUrls(body: string): string[] {
  return [...body.matchAll(/https?:\/\/[^\s)\]}'"<>]+/gu)].map((match) => match[0]);
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

/**
 * The stylebook text a writer is handed.
 *
 * The desk writes Czech, so the packet is "## Czech desk" to the end of the file. The locale
 * argument survives because it is what the call site reads as, and it is typed "cs" because
 * there is nothing else to slice: STYLEBOOK.md used to open with an English desk section that
 * no packet ever carried, and that section is gone.
 */
export function stylebookPacket(raw: string, locale: Extract<MmaFilesLocale, "cs">): string {
  const start = "## Czech desk";
  const startIndex = raw.indexOf(start);
  if (startIndex < 0) throw new Error(`STYLEBOOK.md is missing ${start}`);
  const packet = raw.slice(startIndex).trim();
  if (!packet.includes("### Znaky strojového textu")) {
    throw new Error(`STYLEBOOK.md is missing the ${locale} slop-tells section`);
  }
  return packet;
}

/**
 * Every heading the writer packet promises, and therefore every heading a writer can lose.
 *
 * This is exactly the set inside the slice stylebookPacket takes, which is why the test asserts
 * the two match: a heading required here but absent from the packet is a check that guards
 * nothing, and a heading in the packet but missing here can be deleted from the stylebook
 * without anything failing. The list held four English headings until 2026-08-04, when the
 * English desk section was removed; those four guarded prose no writer was ever sent, while
 * "### Titulky a rytmus" and "### České studijní zdroje" travelled in every Czech packet
 * unguarded. Both gaps are closed here.
 */
export const REQUIRED_STYLEBOOK_HEADINGS = [
  "## Czech desk",
  "### Začátky článků",
  "### Reporty a pozvánky",
  "### Titulky a rytmus",
  "### Slovník a skloňování",
  "### Znaky strojového textu",
  "### České studijní zdroje"
] as const;

export function validateStylebook(raw: string): string[] {
  const violations: string[] = [];
  for (const heading of REQUIRED_STYLEBOOK_HEADINGS) {
    if (!raw.includes(heading)) violations.push(`missing:${heading}`);
  }
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
  // A locale the package does not carry has no copy to review. Czech is always present; the
  // caller iterates locales, so an absent English one is nothing to say rather than a pass.
  const copy = article.localizations[locale];
  if (!copy) return [];
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
  // Every reference the copy shows a reader, checked against what the packet supplied. Until
  // 2026-08-04 the only rule here was `missing-fighter-link` below, and the grounding job was
  // done by two marker rules: `ungrounded-claim`, which demanded a [source:repo/path] on every
  // body line carrying a figure or a quote, and `unresolvable-source`, which demanded the
  // marker name a source the article declares. Both are gone. The owner's decision is that MMA
  // Files carries no inline markers, matching DNESKAi.
  //
  // What replaces them is the shape the edition pipeline uses. There, `assertSuppliedLinks`
  // fails the write when any URL in the output was not in the packet, and the article's sources
  // are copied from the picked items in code. MMA Files already had the second half —
  // `produceMmaFilesArticle` sets `sources` from the evidence packet, which
  // `articleEvidenceFor` builds from files it read off disk, so no prose can name a source and
  // `unresolvable-source` now has nothing left to catch. The first half is what the two
  // supplied-reference loops add: the profile links and the URLs the copy prints.
  //
  // What neither pipeline checks is that a figure in the prose appears in the evidence.
  // `ungrounded-claim` never checked it either — it checked that a marker was present, and a
  // model told to attach one attaches one — so nothing verified is lost here. The gap is real
  // and is named in both pipelines rather than papered over: what stands against an invented
  // number is that the writer is handed the records and nothing else, and is told to leave out
  // what they do not state.
  const suppliedFighterPaths = new Set(article.fighterRefs.map(fighterPath));
  for (const href of linkedFighterPaths(copy.bodyMDX)) {
    if (!suppliedFighterPaths.has(href)) {
      add("unsupplied-fighter-link", `The article links ${href.slice(0, 100)}, which is not a fighter in this article's evidence.`);
    }
  }
  // `assertSuppliedLinks` on an evidence packet made of files. An MMA article's sources are
  // repository records, so `articleEvidenceFor` supplies no URL at all and the supplied set is
  // normally empty: any URL in the copy is one the writer brought itself. The set is read off
  // the package rather than assumed empty, because an external source is a shape the article
  // contract allows and a future packet may use.
  const suppliedUrls = new Set(article.sources.flatMap((entry) => (entry.kind === "external" ? [entry.url] : [])));
  for (const url of bodyUrls(copy.bodyMDX)) {
    if (!suppliedUrls.has(url)) {
      add("unsupplied-url", `The article prints ${url.slice(0, 100)}, which is not a source on this article.`);
    }
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

/**
 * Cross-locale drift checks, for a package that carries two locales.
 *
 * With a single locale there is no second telling of the same fact to disagree with, so this
 * has nothing to compare and returns nothing. Every fighter link is still checked against
 * fighterRefs in reviewArticleCopy, in both directions. What lapses with English is the ability
 * to catch a figure that survived one telling and was mangled in the other — and with the
 * marker rules gone, no rule anywhere now reads the figures in a single-locale body.
 */
export function reviewBilingualParity(article: ArticlePackage): CopyViolation[] {
  const violations: CopyViolation[] = [];
  if (!article.localizations.en) return violations;
  const enFigures = figures(ungroupEnglish(article.localizations.en!.bodyMDX));
  const csFigures = figures(ungroupCzech(article.localizations.cs.bodyMDX, new Set(enFigures)));
  if (JSON.stringify(enFigures) !== JSON.stringify(csFigures)) {
    violations.push({ code: "figure-parity", locale: "cs", message: "English and Czech bodies must carry the same figures." });
  }
  // Identity lives in the link target, not the spelling. The old check compared labels only,
  // so an English body could hang Grasso's name on Shevchenko's page and pass; now the two
  // bodies must point at the same profiles, and each label must be the same name as its
  // counterpart once Czech declension is allowed for.
  const enLinks = linkedFighters(article.localizations.en!.bodyMDX);
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
