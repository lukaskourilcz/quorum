import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ZodType } from "zod";
import {
  ApprovedPublishPackageRefSchema,
  BoundedRenderSummarySchema,
  GoViralIntelligencePacketSchema,
  VentureCapabilityMapSchema,
  VentureCapabilitySchema,
  type VentureCapabilityEdge,
  type VentureCapabilityMap
} from "../contracts/venture-capability.js";
import { configRoot as defaultConfigRoot } from "../paths.js";

export interface CapabilityRequest {
  source: string;
  target: string;
  capability: string;
  schemaVersion: string;
}

export interface CapabilityResolution {
  decision: "allowed" | "held" | "denied";
  reason: string;
  edge: VentureCapabilityEdge | null;
  authorityGranted: false;
  publishingAuthorized: false;
  spendAuthorized: false;
}

const payloadSchemas: Readonly<Record<string, ZodType>> = {
  "goviral-intelligence-packet/1": GoViralIntelligencePacketSchema,
  "bounded-render-summary/1": BoundedRenderSummarySchema,
  "approved-publish-package/1": ApprovedPublishPackageRefSchema
};

const denied = (reason: string): CapabilityResolution => ({
  decision: "denied",
  reason,
  edge: null,
  authorityGranted: false,
  publishingAuthorized: false,
  spendAuthorized: false
});

export async function loadVentureCapabilityMap(
  configRoot: string
): Promise<VentureCapabilityMap> {
  const raw = await readFile(path.join(configRoot, "venture-capabilities.json"), "utf8");
  return VentureCapabilityMapSchema.parse(JSON.parse(raw) as unknown);
}

export function resolveVentureCapabilityInMap(
  mapInput: VentureCapabilityMap,
  request: CapabilityRequest
): CapabilityResolution {
  const parsedMap = VentureCapabilityMapSchema.safeParse(mapInput);
  if (!parsedMap.success) return denied("Capability map is invalid or unavailable.");
  const map = parsedMap.data;
  const knownNodes = new Set(map.nodes.map((node) => node.id));
  if (!knownNodes.has(request.source) || !knownNodes.has(request.target)) {
    return denied("Unknown capability source or target.");
  }
  const capability = VentureCapabilitySchema.safeParse(request.capability);
  if (!capability.success) return denied("Unknown capability class.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\/\d+$/u.test(request.schemaVersion)) {
    return denied("Unknown or malformed capability schema.");
  }

  const isolation = map.isolationRules.find((rule) =>
    rule.sources.includes(request.source)
    && rule.targets.includes(request.target)
    && rule.capabilities.includes(capability.data)
  );
  if (isolation) return denied(isolation.reason);

  const edge = map.edges.find((candidate) =>
    candidate.source === request.source
    && candidate.target === request.target
    && candidate.capability === capability.data
    && candidate.dataSchemaVersion === request.schemaVersion
  );
  if (!edge) return denied("No exact directional capability edge is registered.");
  return {
    decision: edge.decision,
    reason: edge.reason,
    edge,
    authorityGranted: false,
    publishingAuthorized: false,
    spendAuthorized: false
  };
}

export async function resolveVentureCapability(
  request: CapabilityRequest,
  options: { configRoot?: string } = {}
): Promise<CapabilityResolution> {
  try {
    const configRoot = options.configRoot ?? defaultConfigRoot;
    return resolveVentureCapabilityInMap(await loadVentureCapabilityMap(configRoot), request);
  } catch {
    return denied("Capability map is invalid or unavailable.");
  }
}

export function validateVentureCapabilityPayload(
  schemaVersion: string,
  payload: unknown
): { valid: true; data: unknown } | { valid: false; reason: string } {
  const schema = payloadSchemas[schemaVersion];
  if (!schema) return { valid: false, reason: "Unknown capability payload schema." };
  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { valid: true, data: parsed.data }
    : { valid: false, reason: "Capability payload does not satisfy its exact schema." };
}
