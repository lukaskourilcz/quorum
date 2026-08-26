import {
  resolveVentureCapability,
  type CapabilityResolution
} from "../capabilities.js";

export interface PersonalGrowthInputRequest {
  source: string;
  capability: string;
  schemaVersion: string;
}

/**
 * Resolve one explicitly named input into the private Personal Growth workspace.
 * This boundary never enumerates ventures, campaigns, political output or social
 * distribution state. Unknown and unregistered inputs fail closed in the shared
 * capability resolver.
 */
export function resolvePersonalGrowthInput(
  request: PersonalGrowthInputRequest,
  options: { configRoot?: string } = {}
): Promise<CapabilityResolution> {
  return resolveVentureCapability({
    source: request.source,
    target: "personal-growth",
    capability: request.capability,
    schemaVersion: request.schemaVersion
  }, options);
}
