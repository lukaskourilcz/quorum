import type { TehdejsiFact } from "../../contracts/tehdejsi-facts.js";

/**
 * What a subject costs, decided before anything is written about it.
 *
 * The facts file carries a tier the human who copied it believed. This module treats that number
 * as a floor and never as a ceiling: a fact declared tier 0 that turns out to be about 1968 is
 * tier 2 here, and no declaration can lower it. A classifier that could be talked down by the
 * file it reads is not a gate.
 *
 * The direction of error is deliberate. A false positive costs a human review; a false negative
 * costs a published feature about the Holodomor that nobody looked at. So the topic patterns are
 * broad on purpose, and the year ranges catch what prose does not say — a fact whose own years
 * cover 1968 is about 1968 whether or not the sentence mentions it.
 *
 * The split with `lints.ts` is intentional and worth stating, because the two overlap once: this
 * module reads structure — a fact's tier, its years, its sources, what kind of package the tier
 * permits — and `lints.ts` reads prose. Tier 2 refusing a participation CTA is a structural fact
 * about the package's `ctaKind`; tier 2 refusing a question at the end of the copy is a reading
 * of the copy. Both are needed, because a package can carry a harmless `ctaKind` and still end
 * its last slide with "who do you know who was there?".
 */
export type SensitivityTier = 0 | 1 | 2;

interface TierTwoTopic {
  id: string;
  /** Matched against the fact text and place, case-insensitively. */
  pattern: RegExp;
  /** Inclusive year span that puts a fact on this topic regardless of its wording. */
  years?: readonly [number, number];
}

/**
 * The seven subjects the founding decision made blocking.
 *
 * Each is written once here rather than restated in a prompt. A prompt would let a model decide
 * whether 1968 counts today; this decides it before the model is asked anything.
 */
const TIER_TWO_TOPICS: readonly TierTwoTopic[] = [
  {
    id: "occupation-1968",
    pattern: /(?:srpnov[áa]\s+okupac|okupace\s+v\s+roce\s+1968|invaz[ei]\s+(?:v\s+roce\s+)?1968|pra[žz]sk[éáa]\s+jaro|варшавськ\w*\s+догов\w*\s+1968|празьк\w*\s+весн|вторгненн\w*\s+1968|радянська\s+окупац)/iu,
    years: [1968, 1969]
  },
  {
    id: "second-world-war",
    pattern: /(?:druh[áéa]\s+sv[ěe]tov[áéa]\s+v[áa]lk|protektor[áa]t|holo[ck]aust|[šs]oa\b|lidice|друг\w*\s+світов\w*\s+війн|голокост|бабин\s+яр)/iu,
    years: [1939, 1945]
  },
  {
    id: "holodomor",
    pattern: /(?:holodomor|голодомор|hladomor)/iu,
    years: [1932, 1933]
  },
  {
    id: "deportations",
    pattern: /(?:deportac|odsun\s+n[ěe]mc|vyh[áa]n[ěe]n[íi]|nucen[éea]\s+vyst[ěe]hov|депортац|виселенн|примусов\w*\s+переселенн)/iu
  },
  {
    id: "chornobyl",
    pattern: /(?:[čc]ernobyl|chornobyl|[čc]ornobyl|чорнобил|чернобыл|прип'?ять|pripja[ťt]|pryp'?iat)/iu,
    years: [1986, 1986]
  },
  {
    id: "collaboration",
    pattern: /(?:kolaborac|udava[čc]|st[áa]tn[íi]\s+bezpe[čc]nost|\bstb\b|\bkgb\b|колаборац|донос\w*\s+на|стукач)/iu
  },
  {
    id: "current-war",
    pattern: /(?:rusk[áa]\s+invaze|invaze\s+na\s+ukrajinu|plnorozsahl|повномасштабн|російськ\w*\s+вторгненн|велика\s+війна|russian\s+invasion)/iu,
    years: [2022, 2030]
  }
];

/**
 * The categories that are never drafted, in any tier and with any review.
 *
 * These are not expensive subjects — they are subjects the venture does not have. A tier-2 flag
 * says "a human decides"; this says "there is nothing to decide".
 */
interface ExcludedCategory {
  id: string;
  pattern: RegExp;
  detail: string;
}

const EXCLUDED_CATEGORIES: readonly ExcludedCategory[] = [
  {
    id: "excluded:leader-subject",
    pattern: /(?:gottwald|hus[áa]k|novotn[ýy]|z[áa]potock|jake[šs]|stalin|bre[žz]n[ěe]v|chru[šs][čc]ov|lenin|сталін|брежнєв|хрущов|ленін|янукович)/iu,
    detail: "Leader profiles are context, never post subjects."
  },
  {
    id: "excluded:atrocity-imagery",
    pattern: /(?:masov[ýyéa]\s+hrob|poprav\w*\s+fotograf|t[ěe]la\s+ob[ěe]t[íi]|масов\w*\s+похованн|тіла\s+загиблих)/iu,
    detail: "Atrocity imagery and its description are excluded from social entirely."
  },
  {
    id: "excluded:suffering-comparison",
    pattern: /(?:kdo\s+(?:trp[ěe]l|to\s+m[ěe]l)\s+h[ůu][řr]|hor[šs][íi]\s+ne[žz]\s+(?:u\s+n[áa]s|holokaust)|хто\s+більше\s+страждав|гірше\s+ніж)/iu,
    detail: "A who-suffered-more framing is excluded from social entirely."
  }
];

export interface TierClassification {
  /** The tier that applies. Never below what the file declared. */
  tier: SensitivityTier;
  declared: SensitivityTier;
  /** Topic ids that raised the tier above the declaration, in the order they are listed above. */
  raisedBy: string[];
}

type ClassifiableFact = Pick<
  TehdejsiFact,
  "sensitivityTier" | "text" | "place" | "yearFrom" | "yearTo"
>;

/**
 * Whether a fact's own years put it on a topic.
 *
 * Majority overlap rather than any overlap. A fact about waiting lists for cars between 1960 and
 * 1989 brushes 1968 and is not a fact about the invasion; requiring most of the fact's span to
 * sit inside the topic window is what separates the two. Containment would be too strict in the
 * other direction — a fact about 1938 to 1946 is about the war — so the test is proportional.
 */
function yearsMatch(fact: ClassifiableFact, [from, to]: readonly [number, number]): boolean {
  const overlap = Math.min(fact.yearTo, to) - Math.max(fact.yearFrom, from) + 1;
  if (overlap <= 0) return false;
  return overlap / (fact.yearTo - fact.yearFrom + 1) >= 0.5;
}

function topicMatches(topic: TierTwoTopic, fact: ClassifiableFact): boolean {
  if (topic.years && yearsMatch(fact, topic.years)) return true;
  return topic.pattern.test(`${fact.text} ${fact.place ?? ""}`);
}

export function classifyTier(fact: ClassifiableFact): TierClassification {
  const declared = fact.sensitivityTier;
  const raisedBy = TIER_TWO_TOPICS.filter((topic) => topicMatches(topic, fact)).map((topic) => topic.id);
  // `max`, never assignment: the declaration is a floor and the topic list is a floor, and the
  // effective tier is whichever floor is higher.
  const tier: SensitivityTier = raisedBy.length > 0 ? 2 : declared;
  return { tier, declared, raisedBy: tier > declared ? raisedBy : [] };
}

export interface TierEffects {
  /** Blocking. A package carrying this cannot leave the desk without the owner. */
  humanReview: boolean;
  participationCtaAllowed: boolean;
  lightFormatAllowed: boolean;
  /** Independent sources required behind every factual sentence. */
  minimumSourcesPerClaim: number;
  /** Tier 1 carries one honest line about the system the everyday detail sat inside. */
  contextLineRequired: boolean;
}

/**
 * What a tier does to a package.
 *
 * Returned as data rather than applied as branching, so the production layer, the admin panel
 * and the tests all read the same answer instead of three implementations of it.
 */
export function tierEffects(tier: SensitivityTier): TierEffects {
  return {
    humanReview: tier === 2,
    participationCtaAllowed: tier < 2,
    lightFormatAllowed: tier < 2,
    minimumSourcesPerClaim: tier === 2 ? 2 : 1,
    contextLineRequired: tier === 1
  };
}

export interface GateIssue {
  rule: string;
  detail: string;
}

/**
 * Whether this subject may be drafted at all, and what it costs if it may.
 *
 * `draftable: false` is not a failure of the run. It is the venture declining a subject, which is
 * a complete and correct outcome — the desk takes the next fact and the day proceeds.
 */
export interface FactAssessment {
  factId: string;
  classification: TierClassification;
  effects: TierEffects;
  /** Excluded-category hits and any tier requirement the fact itself cannot satisfy. */
  issues: GateIssue[];
  draftable: boolean;
}

export function assessFact(fact: TehdejsiFact): FactAssessment {
  const classification = classifyTier(fact);
  const effects = tierEffects(classification.tier);
  const haystack = `${fact.text} ${fact.place ?? ""}`;
  const issues: GateIssue[] = EXCLUDED_CATEGORIES
    .filter((category) => category.pattern.test(haystack))
    .map((category) => ({ rule: category.id, detail: category.detail }));
  const excluded = issues.length > 0;

  // The contract already refuses a *declared* tier-2 fact with one source. A fact the classifier
  // raised has never been through that check, so it is made here — otherwise raising a tier would
  // be the one path that lets single-sourcing through.
  if (fact.sources.length < effects.minimumSourcesPerClaim) {
    issues.push({
      rule: "tier:insufficient-sources",
      detail: `Tier ${classification.tier} needs ${effects.minimumSourcesPerClaim} independent sources; this fact has ${fact.sources.length}.`
    });
  }
  return {
    factId: fact.id,
    classification,
    effects,
    issues,
    // An excluded subject is never drafted. A sourcing shortfall is also blocking, because the
    // alternative is drafting a tier-2 claim and discovering at review that nothing backs it.
    draftable: !excluded && issues.length === 0
  };
}

/**
 * The package-shaped half of the tier effects.
 *
 * The production layer builds a draft and asks this before storing it. Everything here is about
 * the package's own fields — its CTA kind, its format, how many sources each claim resolved to —
 * and none of it re-reads the copy, which is `lints.ts`'s job.
 */
export interface PackageShape {
  ctaKind: string;
  format: string;
  /** Sources resolved per factual claim, in claim order. */
  sourcesPerClaim: readonly number[];
  /** True when a tier-1 package carries its one honest context line. */
  hasContextLine?: boolean;
}

/** CTA kinds that ask the reader to bring somebody else in. */
const PARTICIPATION_CTAS = new Set(["tag-a-friend", "ask-your-parents", "share-your-photo", "poll"]);

/** Formats whose whole register is light: quizzes, guess-the-price, before-after games. */
const LIGHT_FORMATS = new Set(["quiz", "guess-the-price", "then-or-now", "meme"]);

export function packageIssues(shape: PackageShape, effects: TierEffects): GateIssue[] {
  const issues: GateIssue[] = [];
  if (!effects.participationCtaAllowed && PARTICIPATION_CTAS.has(shape.ctaKind)) {
    issues.push({
      rule: "tier2:participation-cta",
      detail: `A tier-2 feature carries no participation CTA; "${shape.ctaKind}" asks for one.`
    });
  }
  if (!effects.lightFormatAllowed && LIGHT_FORMATS.has(shape.format)) {
    issues.push({
      rule: "tier2:light-format",
      detail: `A tier-2 subject is never a "${shape.format}".`
    });
  }
  for (const [index, count] of shape.sourcesPerClaim.entries()) {
    if (count < effects.minimumSourcesPerClaim) {
      issues.push({
        rule: "tier:claim-undersourced",
        detail: `Claim ${index + 1} resolves to ${count} source(s); this tier needs ${effects.minimumSourcesPerClaim}.`
      });
    }
  }
  if (effects.contextLineRequired && shape.hasContextLine !== true) {
    issues.push({
      rule: "tier1:missing-context-line",
      detail: "A tier-1 feature carries one honest line about the system the everyday detail sat inside."
    });
  }
  return issues;
}

/**
 * The one question the tier gate asks about a finished package.
 *
 * `humanReview` is not an issue and does not fail anything here: a tier-2 package is allowed to
 * exist as a draft, and what it may not do is leave without the owner. The admin path enforces
 * that; conflating the two would mean either drafting nothing about 1968 or publishing it.
 */
export function tierGatePasses(issues: readonly GateIssue[]): boolean {
  return issues.length === 0;
}
