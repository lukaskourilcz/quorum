import { z } from "zod";
import {
  BhDossierSchema,
  BhVerificationStateSchema,
  BhVerificationTransitionSchema,
  type BhDossier,
  type BhDossierClaim,
  type BhVerificationTransition
} from "../../contracts/bh-dossier.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";
import { atomicWriteJson } from "../../state.js";
import { bhDossierPath } from "./research.js";

export type BhClaimStrength = "ordinary" | "heightened" | "sensational";
export type BhPublicationMode = "plain" | "framed" | "legend-label-required" | "prohibited";

export interface BhClaimTriage {
  claimId: string;
  strength: BhClaimStrength;
  signals: Array<
    | "superlative"
    | "precise-dramatic-number"
    | "ban-or-rejection"
    | "burning-or-destruction"
  >;
  independentSources: number;
  requiredIndependentSources: number;
  corroborationSufficient: boolean;
  escalate: boolean;
  publicationMode: BhPublicationMode;
  publicationSuitable: boolean;
}

const SUPERLATIVE = /\b(?:first|last|only|most|least|greatest|best|worst|never|ever|unprecedented|唯一|prvn[ií]|jedin[ýáé]|nej(?:větší|lepší|horší|známější)|nikdy)\b/iu;
const BAN_OR_REJECTION = /\b(?:bann?ed|prohibited|forbidden|rejected|refused|censored|zakázán[oaey]?|zakázali|odmítnut[oaey]?|cenzurován[oaey]?)\b/iu;
const BURNING_OR_DESTRUCTION = /\b(?:burn(?:ed|t|ing)?|book[ -]?burning|destroyed|pulped|spálen[oaey]?|pálen[íi]|zničen[oaey]?)\b/iu;
const DRAMATIC_NUMBER_CONTEXT = /\b(?:times?|publishers?|countries|languages|copies|editions?|years?|nakladatel(?:ů|ství)?|zem(?:í|ě)|jazyk(?:ů|y)?|vydán(?:í|o)?|krát)\b/iu;

function signalList(text: string): BhClaimTriage["signals"] {
  const signals: BhClaimTriage["signals"] = [];
  if (SUPERLATIVE.test(text)) signals.push("superlative");
  if (BAN_OR_REJECTION.test(text)) signals.push("ban-or-rejection");
  if (BURNING_OR_DESTRUCTION.test(text)) signals.push("burning-or-destruction");
  // Four-digit years are dates, not dramatic precision. A smaller exact count becomes a signal
  // only beside a quantity word, so "published in 1936" remains ordinary while "rejected 27
  // times" receives the stronger proof requirement it warrants.
  if (/\b(?:[2-9]|[1-9]\d{1,2}|1\d{3}|20\d{2})\b/u.test(text) &&
      DRAMATIC_NUMBER_CONTEXT.test(text) &&
      !/^.*\b(?:in|roku|year)\s+(?:1\d{3}|20\d{2})\b.*$/iu.test(text)) {
    signals.push("precise-dramatic-number");
  }
  return signals;
}

function independentSourceCount(claim: BhDossierClaim): number {
  return new Set(claim.sources.map(({ url }) => new URL(url).hostname.replace(/^www\./u, "").toLowerCase())).size;
}

export function publicationModeForBhClaim(
  state: BhDossierClaim["verificationState"]
): BhPublicationMode {
  if (state === "verified" || state === "probable") return "plain";
  if (state === "single-source") return "framed";
  if (state === "legend") return "legend-label-required";
  return "prohibited";
}

export function triageBhClaim(claim: BhDossierClaim): BhClaimTriage {
  const signals = signalList(claim.text);
  const sensational = signals.includes("superlative") ||
    signals.includes("ban-or-rejection") ||
    signals.includes("burning-or-destruction");
  const strength: BhClaimStrength = sensational
    ? "sensational"
    : signals.includes("precise-dramatic-number") ? "heightened" : "ordinary";
  const requiredIndependentSources = strength === "sensational" ? 3 : strength === "heightened" ? 2 : 1;
  const independentSources = independentSourceCount(claim);
  const corroborationSufficient = Math.min(independentSources, claim.corroboration) >= requiredIndependentSources;
  const publicationMode = publicationModeForBhClaim(claim.verificationState);
  return {
    claimId: claim.claimId,
    strength,
    signals,
    independentSources,
    requiredIndependentSources,
    corroborationSufficient,
    escalate: signals.length > 0 || !corroborationSufficient,
    publicationMode,
    publicationSuitable: publicationMode !== "prohibited" && claim.publicationSuitable
  };
}

export function triageBhDossier(dossier: BhDossier): BhClaimTriage[] {
  return dossier.claims.map(triageBhClaim);
}

const ClaimCheckResponseSchema = z.strictObject({
  claimId: z.string().min(1).max(120),
  nextState: BhVerificationStateSchema,
  reason: z.string().trim().min(8).max(800),
  sourceUrls: z.array(z.string().url()).max(10)
});

export type BhClaimCheckCallConfig = Omit<
  GuardedCallInput<z.infer<typeof ClaimCheckResponseSchema>>,
  "input" | "parse"
>;

export interface BhVerificationResult {
  dossier: BhDossier;
  transitions: BhVerificationTransition[];
  calls: number;
}

function stateIsSuitable(state: BhDossierClaim["verificationState"]): boolean {
  return state !== "rejected";
}

/** Escalate only deterministic flags, under QUILL and the three-search ceiling. */
export async function verifyBhDossierClaims(input: {
  root: string;
  dossier: BhDossier;
  checkedAt: Date;
  callConfig: BhClaimCheckCallConfig;
  call?: typeof guardedJsonCall;
}): Promise<BhVerificationResult> {
  if (input.callConfig.agent !== "QUILL") {
    throw new Error("BOOKSOFHISTORY claim escalation runs only under QUILL's identity");
  }
  if (!input.callConfig.webSearch || input.callConfig.webSearch.maxUses < 1 || input.callConfig.webSearch.maxUses > 3) {
    throw new Error("BOOKSOFHISTORY claim escalation requires one to three reserved searches");
  }
  const original = BhDossierSchema.parse(input.dossier);
  const claims = structuredClone(original.claims);
  const transitions: BhVerificationTransition[] = [];
  const invoke = input.call ?? guardedJsonCall;
  let calls = 0;
  for (const [index, claim] of claims.entries()) {
    const triage = triageBhClaim(claim);
    if (!triage.escalate) continue;
    const response = await invoke({
      ...input.callConfig,
      input: JSON.stringify({
        claim: {
          claimId: claim.claimId,
          text: claim.text,
          currentState: claim.verificationState,
          sources: claim.sources
        },
        triage,
        instruction: "Check only this claim. Return a state, concise reason and consulted source URLs."
      }),
      parse: (text) => ClaimCheckResponseSchema.parse(JSON.parse(text))
    });
    calls += 1;
    const checked = ClaimCheckResponseSchema.parse(response.value);
    if (checked.claimId !== claim.claimId) {
      throw new Error(`QUILL returned ${checked.claimId} while checking ${claim.claimId}`);
    }
    const transition = BhVerificationTransitionSchema.parse({
      claimId: claim.claimId,
      from: claim.verificationState,
      to: checked.nextState,
      at: input.checkedAt.toISOString(),
      actor: "QUILL",
      reason: checked.reason,
      sourceUrls: checked.sourceUrls
    });
    transitions.push(transition);
    claims[index] = {
      ...claim,
      verificationState: checked.nextState,
      publicationSuitable: stateIsSuitable(checked.nextState)
    };
  }
  const dossier = BhDossierSchema.parse({
    ...original,
    claims,
    updatedAt: transitions.length > 0 ? input.checkedAt.toISOString() : original.updatedAt,
    verificationTransitions: [...original.verificationTransitions, ...transitions]
  });
  if (transitions.length > 0) {
    await atomicWriteJson(input.root, bhDossierPath(dossier.bookId), dossier);
  }
  return { dossier, transitions, calls };
}
