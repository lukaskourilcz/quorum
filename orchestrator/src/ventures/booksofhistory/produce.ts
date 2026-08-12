import { z } from "zod";
import { BhDossierSchema, type BhDossier } from "../../contracts/bh-dossier.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";

const ClaimRefSchema = z.string().regex(/^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

export const BhCanonicalStoryBriefSchema = z.strictObject({
  schemaVersion: z.literal("bh-story-brief/1"),
  bookId: z.string().min(1).max(120),
  dossierRef: z.string().min(1).max(500),
  storyId: z.string().min(1).max(120),
  openingTension: z.string().trim().min(20).max(800),
  arc: z.array(z.strictObject({
    beat: z.string().trim().min(10).max(800),
    claimRefs: z.array(ClaimRefSchema).min(1).max(10)
  })).min(2).max(8),
  turn: z.string().trim().min(10).max(800),
  turnClaimRefs: z.array(ClaimRefSchema).min(1).max(10),
  ending: z.string().trim().min(10).max(800),
  endingClaimRefs: z.array(ClaimRefSchema).min(1).max(10)
});

const FeatureLocaleSchema = z.enum(["cs", "en"]);

export const BhLanguageFeatureSchema = z.strictObject({
  schemaVersion: z.literal("bh-language-feature/1"),
  locale: FeatureLocaleSchema,
  headline: z.string().trim().min(8).max(180),
  slides: z.array(z.strictObject({
    role: z.enum(["hook", "context", "turn", "ending"]),
    text: z.string().trim().min(8).max(800),
    factualSentences: z.array(z.strictObject({
      text: z.string().trim().min(5).max(500),
      claimRefs: z.array(ClaimRefSchema).min(1).max(10)
    })).max(10)
  })).min(3).max(10),
  caption: z.string().trim().min(8).max(2_200),
  quotes: z.array(z.strictObject({
    text: z.string().trim().min(1).max(300),
    attribution: z.string().trim().min(1).max(300),
    claimRef: ClaimRefSchema
  })).max(5)
});

export const BhTwinFeatureSchema = z.strictObject({
  schemaVersion: z.literal("bh-twin-feature/1"),
  canonicalBrief: BhCanonicalStoryBriefSchema,
  cs: BhLanguageFeatureSchema.refine(({ locale }) => locale === "cs", "Czech package requires locale cs"),
  en: BhLanguageFeatureSchema.refine(({ locale }) => locale === "en", "English package requires locale en")
});

export type BhCanonicalStoryBrief = z.infer<typeof BhCanonicalStoryBriefSchema>;
export type BhLanguageFeature = z.infer<typeof BhLanguageFeatureSchema>;
export type BhTwinFeature = z.infer<typeof BhTwinFeatureSchema>;

export type BhProductionGateCode =
  | "schema"
  | "unknown-claim"
  | "rejected-claim"
  | "unsuitable-claim"
  | "legend-framing"
  | "quote-cap"
  | "quote-attribution"
  | "living-author-private-life"
  | "duplicate-feature"
  | "stop-slop";

export interface BhProductionGateViolation {
  code: BhProductionGateCode;
  path: string;
  message: string;
}

export interface BhLanguageGateResult {
  locale: "cs" | "en";
  status: "accepted" | "dropped";
  violations: BhProductionGateViolation[];
  feature: BhLanguageFeature | null;
}

export interface BhTwinGateResult {
  lanes: { cs: BhLanguageGateResult; en: BhLanguageGateResult };
  droppedCount: number;
  acceptedCount: number;
}

export const BH_LEGEND_FRAMING = {
  cs: "Podle neověřené legendy",
  en: "According to an unverified legend"
} as const;

const LIVING_AUTHOR_PRIVATE = /\b(?:health|diagnos(?:is|ed)|illness|disease|hospitali[sz]ed|mental health|private life|sexuality|affair|home address|zdrav[íi]|diagn[oó]z[ay]?|nemoc|hospitalizov[aá]n|duševní zdraví|soukrom[ýé] život|sexualit[ay]|milostn[ýá] poměr|adresa bydliště)\b/iu;
const STOP_SLOP = /\b(?:delve|tapestry|game[ -]?changer|you won't believe|fascinating journey|in today's fast-paced world|neuvěříte|fascinující cesta|v dnešním uspěchaném světě)\b|není jen.{0,80}ale/iu;

function featureText(feature: BhLanguageFeature): string {
  return [
    feature.headline,
    ...feature.slides.flatMap((slide) => [slide.text, ...slide.factualSentences.map(({ text }) => text)]),
    feature.caption,
    ...feature.quotes.flatMap(({ text, attribution }) => [text, attribution])
  ].join("\n");
}

function normalizedFeatureText(feature: BhLanguageFeature): string {
  return featureText(feature).normalize("NFKD").replaceAll(/\p{Mark}/gu, "").toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ").trim();
}

function quoteViolations(value: unknown): BhProductionGateViolation[] {
  if (!value || typeof value !== "object" || !("quotes" in value) || !Array.isArray(value.quotes)) return [];
  return value.quotes.flatMap((quote, index) => {
    if (!quote || typeof quote !== "object") return [];
    const candidate = quote as { text?: unknown; attribution?: unknown };
    const violations: BhProductionGateViolation[] = [];
    if (typeof candidate.text === "string" && candidate.text.length > 300) {
      violations.push({ code: "quote-cap", path: `quotes.${index}.text`, message: "Quotes cannot exceed 300 characters." });
    }
    if (typeof candidate.attribution !== "string" || candidate.attribution.trim() === "") {
      violations.push({ code: "quote-attribution", path: `quotes.${index}.attribution`, message: "Every quote requires attribution." });
    }
    return violations;
  });
}

/** Gate one lane independently; a failed lane is returned as dropped, never thrown into delivery. */
export function gateBhLanguageFeature(input: {
  feature: unknown;
  locale: "cs" | "en";
  dossier: BhDossier;
  priorFeatures: readonly BhLanguageFeature[];
  authorLiving: boolean;
}): BhLanguageGateResult {
  const violations = quoteViolations(input.feature);
  const parsed = BhLanguageFeatureSchema.safeParse(input.feature);
  if (!parsed.success) {
    violations.push({ code: "schema", path: "feature", message: parsed.error.issues[0]?.message ?? "Invalid feature shape." });
    return { locale: input.locale, status: "dropped", violations, feature: null };
  }
  const feature = parsed.data;
  if (feature.locale !== input.locale) {
    violations.push({ code: "schema", path: "locale", message: `Expected ${input.locale}, received ${feature.locale}.` });
  }
  const dossier = BhDossierSchema.parse(input.dossier);
  const claimById = new Map(dossier.claims.map((claim) => [claim.claimId, claim]));
  for (const [slideIndex, slide] of feature.slides.entries()) {
    for (const [sentenceIndex, sentence] of slide.factualSentences.entries()) {
      for (const claimRef of sentence.claimRefs) {
        const claim = claimById.get(claimRef);
        const path = `slides.${slideIndex}.factualSentences.${sentenceIndex}`;
        if (!claim) {
          violations.push({ code: "unknown-claim", path, message: `Unknown dossier claim ${claimRef}.` });
          continue;
        }
        if (claim.verificationState === "rejected") {
          violations.push({ code: "rejected-claim", path, message: `Rejected claim ${claimRef} cannot appear.` });
        } else if (!claim.publicationSuitable) {
          violations.push({ code: "unsuitable-claim", path, message: `Claim ${claimRef} is not publication-suitable.` });
        } else if (claim.verificationState === "legend" && !sentence.text.includes(BH_LEGEND_FRAMING[input.locale])) {
          violations.push({
            code: "legend-framing",
            path,
            message: `Legend claim ${claimRef} requires the exact framing “${BH_LEGEND_FRAMING[input.locale]}”.`
          });
        }
      }
    }
  }
  const text = featureText(feature);
  if (input.authorLiving && LIVING_AUTHOR_PRIVATE.test(text)) {
    violations.push({
      code: "living-author-private-life",
      path: "feature",
      message: "Health and private-life material about living authors is forbidden regardless of sourcing."
    });
  }
  if (STOP_SLOP.test(text)) {
    violations.push({ code: "stop-slop", path: "feature", message: "Feature contains banned generic or clickbait phrasing." });
  }
  const fingerprint = normalizedFeatureText(feature);
  if (input.priorFeatures.some((prior) => normalizedFeatureText(prior) === fingerprint)) {
    violations.push({ code: "duplicate-feature", path: "feature", message: "Feature duplicates prior BOOKSOFHISTORY copy." });
  }
  return {
    locale: input.locale,
    status: violations.length === 0 ? "accepted" : "dropped",
    violations,
    feature: violations.length === 0 ? feature : null
  };
}

export function gateBhTwinFeature(input: {
  cs: unknown;
  en: unknown;
  dossier: BhDossier;
  priorFeatures: { cs: readonly BhLanguageFeature[]; en: readonly BhLanguageFeature[] };
  authorLiving: boolean;
}): BhTwinGateResult {
  const lanes = {
    cs: gateBhLanguageFeature({ feature: input.cs, locale: "cs", dossier: input.dossier, priorFeatures: input.priorFeatures.cs, authorLiving: input.authorLiving }),
    en: gateBhLanguageFeature({ feature: input.en, locale: "en", dossier: input.dossier, priorFeatures: input.priorFeatures.en, authorLiving: input.authorLiving })
  };
  const droppedCount = Object.values(lanes).filter(({ status }) => status === "dropped").length;
  return { lanes, droppedCount, acceptedCount: 2 - droppedCount };
}

export type BhStoryBriefCallConfig = Omit<
  GuardedCallInput<BhCanonicalStoryBrief>,
  "input" | "parse"
>;
export type BhLanguageCallConfig = Omit<
  GuardedCallInput<BhLanguageFeature>,
  "input" | "parse"
>;

function acceptedClaims(dossier: BhDossier, claimRefs: readonly string[]) {
  const requested = new Set(claimRefs);
  const claims = dossier.claims.filter(({ claimId }) => requested.has(claimId));
  if (claims.length !== requested.size) throw new Error("Selected story references a claim absent from the dossier");
  return claims;
}

/** One language-neutral PLOT brief, followed by two independent native writing calls. */
export async function produceBhTwinFeature(input: {
  dossier: BhDossier;
  dossierRef: string;
  storyId: string;
  plotBriefCallConfig: BhStoryBriefCallConfig;
  czechCallConfig: BhLanguageCallConfig;
  englishCallConfig: BhLanguageCallConfig;
  hacekRegisterRules: string;
  call?: typeof guardedJsonCall;
}): Promise<BhTwinFeature> {
  if (input.plotBriefCallConfig.agent !== "PLOT" ||
      input.czechCallConfig.agent !== "PLOT" ||
      input.englishCallConfig.agent !== "PLOT") {
    throw new Error("Canonical and language production calls run under PLOT");
  }
  if (input.hacekRegisterRules.trim().length < 20) {
    throw new Error("The Czech pass requires HACEK register rules");
  }
  const dossier = BhDossierSchema.parse(input.dossier);
  const story = dossier.storyCandidates.find(({ storyId }) => storyId === input.storyId);
  if (!story) throw new Error(`Dossier has no story ${input.storyId}`);
  const claims = acceptedClaims(dossier, story.claimRefs);
  const invoke = input.call ?? guardedJsonCall;
  const briefResult = await invoke({
    ...input.plotBriefCallConfig,
    input: JSON.stringify({
      task: "Write one language-neutral story brief. Every beat, turn and ending cites supplied claim ids.",
      book: { bookId: dossier.bookId, title: dossier.title, author: dossier.author },
      dossierRef: input.dossierRef,
      story,
      claims
    }),
    parse: (text) => BhCanonicalStoryBriefSchema.parse(JSON.parse(text))
  });
  const canonicalBrief = BhCanonicalStoryBriefSchema.parse(briefResult.value);
  const unknownRefs = [
    ...canonicalBrief.arc.flatMap(({ claimRefs }) => claimRefs),
    ...canonicalBrief.turnClaimRefs,
    ...canonicalBrief.endingClaimRefs
  ].filter((claimRef) => !story.claimRefs.includes(claimRef));
  if (unknownRefs.length > 0) throw new Error(`Canonical brief escaped selected story claims: ${unknownRefs.join(", ")}`);

  const languageInput = (locale: "cs" | "en") => JSON.stringify({
    task: locale === "cs"
      ? "Write a native Czech social feature. Do not translate or mention translation."
      : "Write a native English social feature. Do not translate or mention translation.",
    locale,
    canonicalBrief,
    claims,
    quotes: dossier.quotes.filter(({ claimRef }) => story.claimRefs.includes(claimRef)),
    ...(locale === "cs" ? { hacekRegisterRules: input.hacekRegisterRules } : {})
  });
  const [csResult, enResult] = await Promise.all([
    invoke({
      ...input.czechCallConfig,
      input: languageInput("cs"),
      parse: (text) => BhLanguageFeatureSchema.parse(JSON.parse(text))
    }),
    invoke({
      ...input.englishCallConfig,
      input: languageInput("en"),
      parse: (text) => BhLanguageFeatureSchema.parse(JSON.parse(text))
    })
  ]);
  return BhTwinFeatureSchema.parse({
    schemaVersion: "bh-twin-feature/1",
    canonicalBrief,
    cs: csResult.value,
    en: enResult.value
  });
}
