import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VentureCapabilityMapSchema } from "../src/contracts/venture-capability.js";
import { configRoot } from "../src/paths.js";
import { mayRenderDeck, resolveDeckRender, resolveDeckRenderInMap } from "../src/studio/render-access.js";
import { resolveVentureCapabilityInMap } from "../src/ventures/capabilities.js";

/**
 * Every launch venture that writes a summary may now have it rendered — and nobody else can.
 *
 * Five ventures had been writing summaries with no edge between them and the renderer. Nothing
 * broke because nothing automated renders one yet: the Design Lab renders on request and writes
 * nothing down. The first pipeline that renders unattended would have been refused for all five,
 * which is why #467 says to register these first.
 */

async function realMap() {
  return VentureCapabilityMapSchema.parse(
    JSON.parse(await readFile(path.join(configRoot, "venture-capabilities.json"), "utf8"))
  );
}

/** Every venture that writes into `state/ventures/carousel-studio/summaries/`. */
const RENDERING_VENTURES = [
  "caught-up",
  "mma-files",
  "booksofhistory",
  "tehdejsi-svet",
  "kvorum",
  "door-money",
  "webdev-signal"
] as const;

describe("who may have a bounded summary rendered", () => {
  it("allows every venture that writes a summary", async () => {
    const map = await realMap();
    for (const venture of RENDERING_VENTURES) {
      const resolution = resolveDeckRenderInMap(venture, map);
      expect(resolution.decision, venture).toBe("allowed");
      expect(mayRenderDeck(resolution), venture).toBe(true);
    }
  });

  it("refuses a venture with no edge, which is the posture the map is for", async () => {
    const map = await realMap();
    for (const venture of ["marketingshark", "goviral", "personal-growth", "fightaiq"]) {
      const resolution = resolveDeckRenderInMap(venture, map);
      expect(resolution.decision, venture).not.toBe("allowed");
      expect(mayRenderDeck(resolution), venture).toBe(false);
    }
  });

  it("refuses an unknown venture, and a payload the edge is not keyed to", async () => {
    const map = await realMap();
    expect(mayRenderDeck(resolveDeckRenderInMap("not-a-venture", map))).toBe(false);
    // The edge is keyed to `bounded-render-summary/1`. A different payload is a different
    // question, and the map answers it separately rather than by proximity.
    const wrongSchema = resolveVentureCapabilityInMap(map, {
      source: "caught-up",
      target: "design-lab",
      capability: "bounded-render-summary",
      schemaVersion: "goviral-trends/1"
    });
    expect(wrongSchema.decision).not.toBe("allowed");
  });

  it("grants nothing beyond the render itself", async () => {
    const map = await realMap();
    const resolution = resolveDeckRenderInMap("kvorum", map);
    expect(resolution.authorityGranted).toBe(false);
    expect(resolution.publishingAuthorized).toBe(false);
    expect(resolution.spendAuthorized).toBe(false);
  });

  it("reads the same answer off disk as it does from a map in hand", async () => {
    await expect(resolveDeckRender("mma-files")).resolves.toMatchObject({ decision: "allowed" });
    await expect(resolveDeckRender("marketingshark")).resolves.toMatchObject({ decision: "denied" });
  });

  it("keeps the two history ventures isolated from each other", async () => {
    // Registering a render edge for each must not have opened a path between them. The isolation
    // rule names `bounded-render-summary` explicitly and outranks any edge.
    const map = await realMap();
    for (const [source, target] of [["booksofhistory", "tehdejsi-svet"], ["tehdejsi-svet", "booksofhistory"]]) {
      const resolution = resolveVentureCapabilityInMap(map, {
        source: source!,
        target: target!,
        capability: "bounded-render-summary",
        schemaVersion: "bounded-render-summary/1"
      });
      expect(resolution.decision, `${source} -> ${target}`).toBe("denied");
    }
  });
});
