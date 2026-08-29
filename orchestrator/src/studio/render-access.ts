import {
  resolveVentureCapability,
  resolveVentureCapabilityInMap,
  type CapabilityResolution
} from "../ventures/capabilities.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";

/**
 * Whether Design Lab may render a venture's bounded summary.
 *
 * Five ventures have been writing summaries into `state/ventures/carousel-studio/summaries/` with
 * no registered edge between them and the renderer. Nothing broke, because nothing automated has
 * ever rendered one — the Design Lab renders on request and writes nothing down. The moment a
 * pipeline does render unattended, `defaultVentureContentPosture: "deny"` refuses every one of
 * them, so the edges had to be registered before anything else in that pipeline could run.
 *
 * This is the point they are enforced at, in the shape the other boundaries already use: a thin
 * wrapper over the resolver, so a caller asks one question and the map answers it. What the answer
 * governs is the render, never the summary — a delivered article records its summary either way,
 * because that summary is the record of what was delivered and not a request to draw anything.
 */
export const DECK_RENDER_SCHEMA_VERSION = "bounded-render-summary/1";

export function resolveDeckRender(
  venture: string,
  options: { configRoot?: string } = {}
): Promise<CapabilityResolution> {
  return resolveVentureCapability({
    source: venture,
    target: "design-lab",
    capability: "bounded-render-summary",
    schemaVersion: DECK_RENDER_SCHEMA_VERSION
  }, options);
}

/** The same question against a map already in hand, for a caller rendering more than one deck. */
export function resolveDeckRenderInMap(venture: string, map: VentureCapabilityMap): CapabilityResolution {
  return resolveVentureCapabilityInMap(map, {
    source: venture,
    target: "design-lab",
    capability: "bounded-render-summary",
    schemaVersion: DECK_RENDER_SCHEMA_VERSION
  });
}

/**
 * A held edge is not a grant, and neither is a missing one.
 *
 * Spelled out rather than left to each caller to remember, because "allowed" is the only decision
 * that means yes and the other two read as progress if you are not careful.
 */
export function mayRenderDeck(resolution: CapabilityResolution): boolean {
  return resolution.decision === "allowed";
}
