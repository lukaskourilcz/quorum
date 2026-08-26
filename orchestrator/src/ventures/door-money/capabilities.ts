import {
  resolveVentureCapability,
  type CapabilityResolution
} from "../capabilities.js";

interface DoorMoneyBoundaryRequest {
  capability: string;
  schemaVersion: string;
}

export function resolveDoorMoneyInput(
  request: DoorMoneyBoundaryRequest & { source: string },
  options: { configRoot?: string } = {}
): Promise<CapabilityResolution> {
  return resolveVentureCapability({
    source: request.source,
    target: "door-money",
    capability: request.capability,
    schemaVersion: request.schemaVersion
  }, options);
}

export function resolveDoorMoneyOutput(
  request: DoorMoneyBoundaryRequest & { target: string },
  options: { configRoot?: string } = {}
): Promise<CapabilityResolution> {
  return resolveVentureCapability({
    source: "door-money",
    target: request.target,
    capability: request.capability,
    schemaVersion: request.schemaVersion
  }, options);
}
