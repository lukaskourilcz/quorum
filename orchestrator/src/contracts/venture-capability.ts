import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, Sha256Schema, VentureIdSchema } from "./common.js";

export const VentureCapabilitySchema = z.enum([
  "intelligence-read",
  "bounded-render-summary",
  "approved-publish-package",
  "own-metrics-read",
  "implementation-progress-read",
  "health-read",
  "owner-attention-write",
  "owner-manual-reference-read"
]);

export const VentureCapabilityDecisionSchema = z.enum(["allowed", "denied", "held"]);

export const VentureCapabilityEdgeSchema = z.strictObject({
  schemaVersion: z.literal("venture-capability-edge/1"),
  source: VentureIdSchema,
  target: VentureIdSchema,
  capability: VentureCapabilitySchema,
  dataSchemaVersion: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/\d+$/).max(120),
  direction: z.literal("source-to-target"),
  decision: VentureCapabilityDecisionSchema,
  reason: z.string().min(1).max(500),
  governingReference: EvidenceRefSchema,
  runtimeEnforcementPoint: z.string().min(1).max(240),
  testProbeReference: z.string().min(1).max(240)
}).superRefine((edge, context) => {
  const values = [edge.source, edge.target, edge.capability, edge.dataSchemaVersion];
  if (values.some((value) => value.includes("*") || value === "all-content" || value === "portfolio-read")) {
    context.addIssue({ code: "custom", message: "Wildcard and portfolio-wide capability edges are forbidden" });
  }
  if (edge.source === edge.target) {
    context.addIssue({ code: "custom", message: "A cross-boundary capability edge needs different source and target nodes" });
  }
});

const NodeClassificationSchema = z.enum([
  "content-venture",
  "data-venture",
  "private-owner-workspace",
  "intelligence-service",
  "rendering-service",
  "distribution-service",
  "system-service"
]);

const DataActionClassSchema = z.enum([
  "content",
  "private-data",
  "intelligence",
  "rendering",
  "distribution",
  "metrics",
  "progress",
  "health",
  "owner-attention",
  "system-control"
]);

const PrivacyClassificationSchema = z.enum(["public", "internal", "owner-only", "private-source"]);

const CapabilityNodeSchema = z.strictObject({
  id: VentureIdSchema,
  classification: NodeClassificationSchema,
  canonicalOwner: VentureIdSchema,
  dataActionClasses: z.array(DataActionClassSchema).min(1).max(10),
  authorityRequirement: z.enum(["decision-and-runtime-gates", "owner-manual-only", "service-policy", "none"]),
  privacyClassification: PrivacyClassificationSchema,
  maximumPayloadClass: z.string().min(1).max(120),
  evidenceReferences: z.array(EvidenceRefSchema).min(1).max(12),
  reviewAt: DateSchema.nullable()
});

const IsolationRuleSchema = z.strictObject({
  id: VentureIdSchema,
  sources: z.array(VentureIdSchema).min(1).max(40),
  targets: z.array(VentureIdSchema).min(1).max(40),
  capabilities: z.array(VentureCapabilitySchema).min(1),
  reason: z.string().min(1).max(500),
  governingReference: EvidenceRefSchema
});

export const VentureCapabilityMapSchema = z.strictObject({
  schemaVersion: z.literal("venture-capability-map/1"),
  mapVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveDate: DateSchema,
  defaultVentureContentPosture: z.literal("deny"),
  decisionReference: z.literal("state/decisions/2026-08-26-autonomy-first-capabilities.md"),
  nodes: z.array(CapabilityNodeSchema).min(1),
  edges: z.array(VentureCapabilityEdgeSchema),
  isolationRules: z.array(IsolationRuleSchema),
  supersessionHistory: z.array(z.strictObject({
    mapVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    effectiveAt: DateTimeSchema,
    decisionReference: EvidenceRefSchema,
    note: z.string().min(1).max(300)
  }))
}).superRefine((map, context) => {
  const nodeIds = map.nodes.map((node) => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) {
    context.addIssue({ code: "custom", message: "Capability node ids must be unique", path: ["nodes"] });
  }
  const known = new Set(nodeIds);
  const edgeKeys = new Set<string>();
  for (const [index, edge] of map.edges.entries()) {
    if (!known.has(edge.source) || !known.has(edge.target)) {
      context.addIssue({ code: "custom", message: "Capability edge references an unknown node", path: ["edges", index] });
    }
    const isolated = map.isolationRules.some((rule) =>
      rule.sources.includes(edge.source)
      && rule.targets.includes(edge.target)
      && rule.capabilities.includes(edge.capability)
    );
    if (isolated && edge.decision !== "denied") {
      context.addIssue({ code: "custom", message: "An allowed or held edge conflicts with a permanent isolation rule", path: ["edges", index] });
    }
    const key = `${edge.source}:${edge.target}:${edge.capability}:${edge.dataSchemaVersion}`;
    if (edgeKeys.has(key)) {
      context.addIssue({ code: "custom", message: "Capability edges must be unique", path: ["edges", index] });
    }
    edgeKeys.add(key);
  }
  for (const [index, rule] of map.isolationRules.entries()) {
    if ([...rule.sources, ...rule.targets].some((id) => !known.has(id))) {
      context.addIssue({ code: "custom", message: "Isolation rule references an unknown node", path: ["isolationRules", index] });
    }
  }
});

const SourceArtifactRefSchema = z.string().regex(/^state\/ventures\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-zA-Z0-9._/-]+\.json$/).max(300);

function unsafeArtifactRef(value: string): boolean {
  return value.includes("../") || value.includes("//") || value.includes("\\");
}

export const GoViralIntelligencePacketSchema = z.strictObject({
  schemaVersion: z.literal("goviral-intelligence-packet/1"),
  topic: z.string().min(1).max(160),
  measuredAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
  velocity: z.number().finite().min(-100).max(100).nullable(),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(12)
}).superRefine((packet, context) => {
  if (Date.parse(packet.expiresAt) <= Date.parse(packet.measuredAt)) {
    context.addIssue({ code: "custom", message: "Intelligence must expire after it was measured", path: ["expiresAt"] });
  }
});

export const BoundedRenderSummarySchema = z.strictObject({
  schemaVersion: z.literal("bounded-render-summary/1"),
  sourceId: VentureIdSchema,
  sourceArtifactRef: SourceArtifactRefSchema,
  locale: z.enum(["cs", "en"]),
  title: z.string().min(1).max(140),
  points: z.array(z.string().min(1).max(220)).min(1).max(8),
  approvalRef: EvidenceRefSchema,
  contentHash: Sha256Schema
}).superRefine((summary, context) => {
  if (!summary.sourceArtifactRef.startsWith(`state/ventures/${summary.sourceId}/`)) {
    context.addIssue({ code: "custom", message: "Render summary may reference only its source venture", path: ["sourceArtifactRef"] });
  }
  if (unsafeArtifactRef(summary.sourceArtifactRef)) {
    context.addIssue({ code: "custom", message: "Render summary artifact reference must remain inside its venture path", path: ["sourceArtifactRef"] });
  }
});

export const ApprovedPublishPackageRefSchema = z.strictObject({
  schemaVersion: z.literal("approved-publish-package/1"),
  sourceId: VentureIdSchema,
  packageRef: SourceArtifactRefSchema,
  assetRefs: z.array(z.string().regex(/^state\/ventures\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-zA-Z0-9._/-]+$/).max(300)).max(20),
  packageHash: Sha256Schema,
  approvalRef: EvidenceRefSchema
}).superRefine((pack, context) => {
  const prefix = `state/ventures/${pack.sourceId}/`;
  if (!pack.packageRef.startsWith(prefix) || pack.assetRefs.some((ref) => !ref.startsWith(prefix))) {
    context.addIssue({ code: "custom", message: "Publish package may reference only immutable artifacts owned by its source venture" });
  }
  if (unsafeArtifactRef(pack.packageRef) || pack.assetRefs.some(unsafeArtifactRef)) {
    context.addIssue({ code: "custom", message: "Publish package references must remain inside their venture path" });
  }
});

export type VentureCapability = z.infer<typeof VentureCapabilitySchema>;
export type VentureCapabilityEdge = z.infer<typeof VentureCapabilityEdgeSchema>;
export type VentureCapabilityMap = z.infer<typeof VentureCapabilityMapSchema>;
