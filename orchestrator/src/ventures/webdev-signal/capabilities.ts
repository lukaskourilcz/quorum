import {
  resolveVentureCapability,
  type CapabilityResolution
} from "../capabilities.js";

interface WebDevSignalBoundaryRequest {
  capability: string;
  schemaVersion: string;
}

export function resolveWebDevSignalInput(
  request: WebDevSignalBoundaryRequest & { source: string },
  options: { configRoot?: string } = {}
): Promise<CapabilityResolution> {
  return resolveVentureCapability({
    source: request.source,
    target: "webdev-signal",
    capability: request.capability,
    schemaVersion: request.schemaVersion
  }, options);
}

export function resolveWebDevSignalOutput(
  request: WebDevSignalBoundaryRequest & { target: string },
  options: { configRoot?: string } = {}
): Promise<CapabilityResolution> {
  return resolveVentureCapability({
    source: "webdev-signal",
    target: request.target,
    capability: request.capability,
    schemaVersion: request.schemaVersion
  }, options);
}
