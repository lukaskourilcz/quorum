import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DateTimeSchema, EvidenceRefSchema } from "../contracts/common.js";
import {
  SocialPreparedCandidateSchema,
  SocialRoutineScopeSchema,
  type SocialPreparedCandidate,
  type SocialRoutineScope
} from "../contracts/social-operations.js";
import type { SocialInventoryCandidate } from "../contracts/social-inventory.js";
import { configRoot } from "../paths.js";

export const SocialRoutineScopeRegistrySchema = z.strictObject({
  schemaVersion: z.literal("social-routine-scope-registry/1"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  defaultMode: z.literal("draft-only"),
  updatedAt: DateTimeSchema,
  ownerDecisionRef: EvidenceRefSchema,
  scopes: z.array(SocialRoutineScopeSchema).max(200)
}).superRefine((registry, context) => {
  const ids = registry.scopes.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Routine scope ids must be unique", path: ["scopes"] });
  const activeKeys = registry.scopes.filter(({ status }) => status === "active").map(({ profileId, connectionId }) => `${profileId}:${connectionId}`);
  if (new Set(activeKeys).size !== activeKeys.length) context.addIssue({ code: "custom", message: "A profile connection has at most one active routine scope", path: ["scopes"] });
});

export type SocialRoutineScopeRegistry = z.infer<typeof SocialRoutineScopeRegistrySchema>;

export async function loadSocialRoutineScopeRegistry(filePath = path.join(configRoot, "social-routine-scopes.json")): Promise<SocialRoutineScopeRegistry> {
  return SocialRoutineScopeRegistrySchema.parse(JSON.parse(await readFile(filePath, "utf8")) as unknown);
}

export interface RoutineScopeMatch {
  state: "draft-only" | "matched" | "missing" | "mismatch" | "revoked" | "expired";
  scope: SocialRoutineScope | null;
  reasons: string[];
}

export function matchSocialRoutineScope(input: {
  registry: unknown;
  candidate: SocialInventoryCandidate;
  prepared: unknown;
  connectionId: string;
  targetDate: string;
  sentToday: number;
  lastSentAt: string | null;
  now: Date;
}): RoutineScopeMatch {
  const registry = SocialRoutineScopeRegistrySchema.safeParse(input.registry);
  const prepared = SocialPreparedCandidateSchema.safeParse(input.prepared);
  if (!registry.success) return { state: "missing", scope: null, reasons: ["malformed-routine-scope-registry"] };
  const matching = registry.data.scopes.filter(({ profileId, connectionId }) => profileId === input.candidate.profileId && connectionId === input.connectionId);
  const active = matching.find(({ status }) => status === "active") ?? null;
  if (!active) {
    const latest = [...matching].sort((left, right) => right.history.at(-1)!.at.localeCompare(left.history.at(-1)!.at))[0] ?? null;
    if (latest?.status === "revoked") return { state: "revoked", scope: latest, reasons: ["routine-scope-revoked"] };
    if (latest?.status === "expired") return { state: "expired", scope: latest, reasons: ["routine-scope-expired"] };
    return { state: registry.data.defaultMode, scope: latest, reasons: [latest ? "routine-scope-not-active" : "draft-only-no-routine-scope"] };
  }
  if (!prepared.success) return { state: "mismatch", scope: active, reasons: ["prepared-item-malformed"] };
  const reasons: string[] = [];
  const item = prepared.data;
  if (input.targetDate < active.effectiveOn || input.targetDate >= active.expiresOn) reasons.push("routine-scope-outside-effective-dates");
  if (active.platform !== input.candidate.platform || item.utm.source !== input.candidate.platform) reasons.push("routine-scope-platform-mismatch");
  if (!active.locales.includes(input.candidate.locale)) reasons.push("routine-scope-locale-mismatch");
  if (!active.allowedContentClasses.includes(item.contentClass)) reasons.push("routine-scope-content-class-mismatch");
  if (!active.allowedFormats.includes(item.formatId) || item.formatId !== input.candidate.formatId) reasons.push("routine-scope-format-mismatch");
  if (!active.allowedSourceKinds.includes(item.sourceKind) || item.sourceKind !== input.candidate.sourceKind) reasons.push("routine-scope-source-kind-mismatch");
  if (item.target.profileId !== input.candidate.profileId || item.target.connectionId !== input.connectionId) reasons.push("routine-scope-target-mismatch");
  if (item.candidateId !== input.candidate.id) reasons.push("routine-scope-candidate-mismatch");
  if (item.evidenceRefs.length < active.evidenceRequirements.minimumEvidenceRefs) reasons.push("routine-scope-evidence-insufficient");
  if (active.evidenceRequirements.approvedPackageRequired && !item.sourcePackage.artifactRef) reasons.push("routine-scope-approved-package-missing");
  if (active.evidenceRequirements.campaignApprovalRequired && !item.target.campaignApprovalRef) reasons.push("routine-scope-campaign-approval-missing");
  if (item.riskClass !== "low" || active.prohibitedRiskClasses.includes(item.riskClass as Exclude<typeof item.riskClass, "low">)) reasons.push("routine-scope-risk-review-only");
  if (item.estimatedCostUsd > active.bounds.maximumItemCostUsd) reasons.push("routine-scope-cost-exceeded");
  if (input.sentToday >= active.bounds.maximumPostsPerDay) reasons.push("routine-scope-daily-cadence-exceeded");
  if (input.lastSentAt && input.now.getTime() - Date.parse(input.lastSentAt) < active.bounds.minimumHoursBetweenPosts * 3_600_000) reasons.push("routine-scope-spacing-not-met");
  return reasons.length ? { state: "mismatch", scope: active, reasons } : { state: "matched", scope: active, reasons: ["exact-countersigned-routine-scope-match"] };
}
