import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VentureCapabilityMapSchema } from "../src/contracts/venture-capability.js";
import { configRoot } from "../src/paths.js";
import { newestTrendSnapshot } from "../src/portfolio/evidence.js";
import { atomicWriteJson } from "../src/state.js";
import { resolveVentureCapabilityInMap } from "../src/ventures/capabilities.js";

/**
 * GoVIRAL's snapshot is a cross-venture read, and the magazines' was the one nobody registered.
 *
 * Five desks consume GoVIRAL's brief and each has an edge in the map. The two magazines read the
 * trend snapshot on every editorial room and had none — so the read running most often was the
 * read outside the map entirely. Registering it is only half the work: the point of a capability
 * map is that an unregistered venture gets nothing, which is what the last case here checks.
 */

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function realMap() {
  return VentureCapabilityMapSchema.parse(
    JSON.parse(await readFile(path.join(configRoot, "venture-capabilities.json"), "utf8"))
  );
}

async function rootWithSnapshot(date = "2026-08-24"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "goviral-edges-"));
  roots.push(root);
  await atomicWriteJson(root, `goviral/trends/${date}.json`, {
    schemaVersion: "goviral-trends/1",
    date,
    generatedAt: `${date}T09:00:00.000Z`,
    sourceResults: [],
    freeSignals: [],
    items: [],
    signals: { topHashtags: [], topFormats: [], topAudio: [], exploreSections: [], perTopicSet: [] },
    forMagazines: { ai: [], mma: [] }
  });
  return root;
}

describe("GoVIRAL's magazine intelligence edges", () => {
  it("registers both magazines against the snapshot's own schema", async () => {
    const map = await realMap();
    for (const venture of ["caught-up", "mma-files"]) {
      const resolution = resolveVentureCapabilityInMap(map, {
        source: "goviral",
        target: venture,
        capability: "intelligence-read",
        schemaVersion: "goviral-trends/1"
      });
      expect(resolution.decision, venture).toBe("allowed");
      // The edge names where it is enforced, so a reader can find the code from the map.
      expect(resolution.edge?.runtimeEnforcementPoint).toBe("orchestrator/src/portfolio/evidence.ts");
    }
  });

  it("hands a registered magazine the snapshot", async () => {
    const root = await rootWithSnapshot();
    const capabilityMap = await realMap();
    for (const venture of ["caught-up", "mma-files"]) {
      await expect(
        newestTrendSnapshot(root, "2026-08-29", { venture, capabilityMap }),
        venture
      ).resolves.toMatchObject({ date: "2026-08-24" });
    }
  });

  it("hands an unregistered venture nothing, with the file right there", async () => {
    const root = await rootWithSnapshot();
    const capabilityMap = await realMap();
    // Door Money's edge is `held`, not `allowed`, and a held edge is not a grant.
    await expect(newestTrendSnapshot(root, "2026-08-29", { venture: "door-money", capabilityMap }))
      .resolves.toBeNull();
    await expect(newestTrendSnapshot(root, "2026-08-29", { venture: "marketingshark", capabilityMap }))
      .resolves.toBeNull();
  });

  it("still reads unrouted for GoVIRAL's own tooling, which is not a cross-venture read", async () => {
    const root = await rootWithSnapshot();
    await expect(newestTrendSnapshot(root, "2026-08-29")).resolves.toMatchObject({ date: "2026-08-24" });
  });

  it("leaves a magazine without a tiebreaker rather than failing when there is no snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "goviral-edges-"));
    roots.push(root);
    const capabilityMap = await realMap();
    await expect(newestTrendSnapshot(root, "2026-08-29", { venture: "caught-up", capabilityMap }))
      .resolves.toBeNull();
  });
});
