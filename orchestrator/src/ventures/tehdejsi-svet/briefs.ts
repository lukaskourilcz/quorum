import { z } from "zod";
import type { TehdejsiFact } from "../../contracts/tehdejsi-facts.js";
import type { TehdejsiShortlist } from "../../contracts/tehdejsi-shortlist.js";
import { TsStoryBriefSchema, type TsStoryBrief } from "../../contracts/ts-story-brief.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";
import { assessFact, tierEffects } from "./gates.js";
import { selectableFactIds } from "./scorer.js";

/**
 * Day A: one call, and everything around it decided in code.
 *
 * The shortlist is already deterministic and already recorded, so the model is not asked to
 * rank — it is asked for the one thing a ranking cannot produce, which is an angle and the beats
 * that carry it. Everything checkable is assembled afterwards from the facts and the gate: the
 * tier, the context-line requirement, the fact ids, the shortlist reference. A model that
 * invented any of those would be inventing the record's provenance.
 *
 * The CTA is the clearest case. LETOPIS proposes one; the tier decides whether it survives. A
 * tier-2 brief gets `none` regardless of what came back, because the alternative is a prompt
 * asking a model to remember a rule the code already knows.
 */
export const TS_BRIEF_MAX_FEATURES = 2;

const LetopisBriefSchema = z.strictObject({
  briefs: z.array(z.strictObject({
    factId: z.string().min(1).max(120),
    angle: z.string().trim().min(20).max(400),
    slideBeats: z.array(z.strictObject({
      beat: z.string().trim().min(10).max(180),
      claimIds: z.array(z.string().min(1).max(160)).max(4)
    })).min(2).max(10),
    claims: z.array(z.strictObject({
      claimId: z.string().min(1).max(160),
      statement: z.string().trim().min(10).max(400),
      factIds: z.array(z.string().min(1).max(120)).min(1).max(4)
    })).min(1).max(12),
    ctaKind: z.enum(["none", "ask-your-parents", "tag-a-friend", "share-your-photo", "read-more", "product-link"])
  })).min(1).max(TS_BRIEF_MAX_FEATURES)
});

export type LetopisBriefOutput = z.infer<typeof LetopisBriefSchema>;

export function parseLetopisBriefs(text: string): LetopisBriefOutput {
  return LetopisBriefSchema.parse(JSON.parse(text));
}

/** Slug-safe, because a model's claim id becomes a path-adjacent identifier in the record. */
function slug(value: string, fallback: string): string {
  const cleaned = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : fallback;
}

export interface TsBriefPacketInput {
  date: string;
  shortlist: TehdejsiShortlist;
  facts: readonly TehdejsiFact[];
  selectableIds: readonly string[];
  dossierRefs: readonly string[];
}

/**
 * What LETOPIS is shown.
 *
 * Only selectable facts reach the packet. A vetoed fact in the prompt is a fact a model can
 * argue for, and the veto is not a suggestion — so the argument is made impossible rather than
 * refused after the fact.
 */
export function briefPacket(input: TsBriefPacketInput): string {
  const byId = new Map(input.facts.map((fact) => [fact.id, fact]));
  return JSON.stringify({
    date: input.date,
    dossierRefs: input.dossierRefs,
    candidates: input.selectableIds.map((factId) => {
      const fact = byId.get(factId);
      const entry = input.shortlist.entries.find((candidate) => candidate.factId === factId);
      return {
        factId,
        rank: entry?.rank ?? null,
        kind: fact?.kind ?? null,
        country: fact?.country ?? null,
        place: fact?.place ?? null,
        years: fact ? [fact.yearFrom, fact.yearTo] : null,
        text: fact?.text ?? null,
        sources: fact?.sources.map((source) => source.title) ?? []
      };
    })
  });
}

export interface GenerateTsBriefsInput {
  cycleId: string;
  date: string;
  shortlist: TehdejsiShortlist;
  facts: readonly TehdejsiFact[];
  factsHash: string;
  shortlistRef: string;
  dossierRefs?: readonly string[];
  featureLimit?: number;
  generatedAt: Date;
  callConfig: Omit<GuardedCallInput<LetopisBriefOutput>, "input" | "parse">;
  call?: typeof guardedJsonCall;
}

export interface TsBriefResult {
  briefs: TsStoryBrief[];
  /** Fact ids the model asked for that it was not allowed to have. */
  rejectedFactIds: string[];
  usd: number;
}

/**
 * One call, then deterministic assembly.
 *
 * A quiet day returns no briefs and is a complete outcome: the shortlist had nothing selectable,
 * or everything selectable failed the gate. Neither is an error, and neither costs a call — the
 * model is not asked to choose between candidates that do not exist.
 */
export async function generateTsStoryBriefs(input: GenerateTsBriefsInput): Promise<TsBriefResult> {
  const limit = Math.min(input.featureLimit ?? TS_BRIEF_MAX_FEATURES, TS_BRIEF_MAX_FEATURES);
  const byId = new Map(input.facts.map((fact) => [fact.id, fact]));
  const dossierRefs = [...(input.dossierRefs ?? [])];

  // The gate runs before the money, not after the copy. A fact the gate refuses is never shown
  // to a model, so an excluded subject cannot be written about even once.
  const selectable = selectableFactIds(input.shortlist, limit)
    .filter((factId) => {
      const fact = byId.get(factId);
      return fact !== undefined && assessFact(fact).draftable;
    });
  if (selectable.length === 0) return { briefs: [], rejectedFactIds: [], usd: 0 };

  const invoke = input.call ?? guardedJsonCall;
  const response = await invoke({
    ...input.callConfig,
    input: briefPacket({
      date: input.date,
      shortlist: input.shortlist,
      facts: input.facts,
      selectableIds: selectable,
      dossierRefs
    }),
    parse: parseLetopisBriefs
  });

  const briefs: TsStoryBrief[] = [];
  const rejectedFactIds: string[] = [];
  for (const draft of response.value.briefs.slice(0, limit)) {
    const fact = byId.get(draft.factId);
    if (!fact || !selectable.includes(draft.factId)) {
      // A model that named a fact it was not shown does not get to write about it.
      rejectedFactIds.push(draft.factId);
      continue;
    }
    const assessment = assessFact(fact);
    const tier = assessment.classification.tier;
    const effects = tierEffects(tier);
    const claimIds = new Map<string, string>();
    const claims = draft.claims.map((claim, index) => {
      const id = slug(claim.claimId, `claim-${index + 1}`);
      claimIds.set(claim.claimId, id);
      return {
        claimId: id,
        statement: claim.statement,
        // Facts are intersected with what the brief actually selected rather than taken on
        // trust, and a claim left with none is dropped below.
        factIds: claim.factIds.filter((candidate) => candidate === draft.factId),
        dossierRefs: [] as string[],
        singleSourceFraming: fact.sources.length < effects.minimumSourcesPerClaim + 1
      };
    }).filter((claim) => claim.factIds.length > 0);
    if (claims.length === 0) {
      rejectedFactIds.push(draft.factId);
      continue;
    }
    const keptClaimIds = new Set(claims.map((claim) => claim.claimId));
    const parsed = TsStoryBriefSchema.safeParse({
      schemaVersion: "ts-story-brief/1",
      briefId: `${input.date}-${draft.factId}`,
      cycleId: input.cycleId,
      date: input.date,
      factsHash: input.factsHash,
      factIds: [draft.factId],
      shortlistRef: input.shortlistRef,
      dossierRefs,
      sensitivityTier: tier,
      tierRaisedBy: assessment.classification.raisedBy,
      angle: draft.angle,
      slideBeats: draft.slideBeats.map((beat, index) => ({
        ordinal: index + 1,
        beat: beat.beat,
        claimIds: beat.claimIds
          .map((claimId) => claimIds.get(claimId) ?? slug(claimId, ""))
          .filter((claimId) => keptClaimIds.has(claimId))
      })),
      claims,
      // The tier decides the CTA, not the model. A prompt asking a model to remember a rule the
      // code already knows is a rule that will be forgotten on the day it matters.
      ctaKind: effects.participationCtaAllowed ? draft.ctaKind : "none",
      contextLineRequired: effects.contextLineRequired,
      generatedAt: input.generatedAt.toISOString()
    });
    if (parsed.success) briefs.push(parsed.data);
    else rejectedFactIds.push(draft.factId);
  }
  return { briefs, rejectedFactIds, usd: response.usd };
}
