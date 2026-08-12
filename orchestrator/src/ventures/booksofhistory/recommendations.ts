import { createHash } from "node:crypto";
import {
  VentureRecommendationSchema,
  type VentureRecommendation
} from "../../contracts/venture-recommendation.js";
import { atomicWriteJson, readJson } from "../../state.js";
import type { BhTwinFeature, BhTwinGateResult } from "./produce.js";

export function bhRecommendationPath(cycleId: string, storyId: string): string {
  const key = createHash("sha256").update(`${cycleId}\n${storyId}`).digest("hex").slice(0, 16);
  return `ventures/booksofhistory/recommendations/${cycleId}-${storyId}-${key}.json`;
}

export function buildBhRecommendation(input: {
  cycleId: string;
  dossierRef: string;
  storyId: string;
  claimRefs: readonly string[];
  feature: BhTwinFeature;
  gates: BhTwinGateResult;
  createdAt: Date;
}): VentureRecommendation {
  if (input.gates.droppedCount > 0 ||
      input.gates.lanes.cs.feature === null || input.gates.lanes.en.feature === null) {
    throw new Error("Dropped language packages cannot become recommendation drafts");
  }
  const identity = createHash("sha256").update(`${input.cycleId}\n${input.storyId}`).digest("hex").slice(0, 20);
  return VentureRecommendationSchema.parse({
    schemaVersion: "venture-recommendation/1",
    recommendationId: `rec-${identity}`,
    ventureId: "booksofhistory",
    cycleId: input.cycleId,
    status: "draft",
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.createdAt.toISOString(),
    evidence: {
      kind: "dossier-story",
      dossierRef: input.dossierRef,
      storyRef: `${input.dossierRef}#${input.storyId}`,
      claimRefs: [...new Set(input.claimRefs)]
    },
    payloads: { cs: input.gates.lanes.cs.feature, en: input.gates.lanes.en.feature },
    gateResults: {
      cs: { passed: true, violations: [] },
      en: { passed: true, violations: [] }
    },
    designLab: { status: "pending", summaryRefs: null },
    owner: { postedUrl: null, resultRefs: [], editHistory: [] }
  });
}

export type StoreBhRecommendationResult =
  | { status: "created"; path: string; recommendation: VentureRecommendation }
  | { status: "already-recorded"; path: string; recommendation: VentureRecommendation };

/** The only BOOKSOFHISTORY recommendation writer, idempotent on (cycle, story). */
export async function storeBhRecommendation(
  root: string,
  recommendation: VentureRecommendation
): Promise<StoreBhRecommendationResult> {
  const parsed = VentureRecommendationSchema.parse(recommendation);
  if (parsed.ventureId !== "booksofhistory" || parsed.evidence.kind !== "dossier-story") {
    throw new Error("BOOKSOFHISTORY writer accepts only dossier-story recommendations");
  }
  const storyId = parsed.evidence.storyRef.split("#").at(-1);
  if (!storyId) throw new Error("Dossier story evidence has no story id");
  const relative = bhRecommendationPath(parsed.cycleId, storyId);
  const existing = await readJson<unknown | null>(root, relative, null);
  if (existing !== null) {
    const stored = VentureRecommendationSchema.parse(existing);
    if (stored.recommendationId !== parsed.recommendationId ||
        stored.cycleId !== parsed.cycleId || stored.evidence.storyRef !== parsed.evidence.storyRef) {
      throw new Error(`Recommendation identity conflict at ${relative}`);
    }
    return { status: "already-recorded", path: relative, recommendation: stored };
  }
  await atomicWriteJson(root, relative, parsed);
  return { status: "created", path: relative, recommendation: parsed };
}
