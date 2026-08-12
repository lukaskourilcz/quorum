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
