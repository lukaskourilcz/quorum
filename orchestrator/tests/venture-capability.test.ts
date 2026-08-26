import { access, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  VentureCapabilityEdgeSchema,
  VentureCapabilityMapSchema
} from "../src/contracts/venture-capability.js";
import { configRoot, repoRoot } from "../src/paths.js";
import {
  loadVentureCapabilityMap,
  resolveVentureCapability,
  resolveVentureCapabilityInMap,
  validateVentureCapabilityPayload,
  type CapabilityRequest
} from "../src/ventures/capabilities.js";
import {
  resolveDoorMoneyInput,
  resolveDoorMoneyOutput
} from "../src/ventures/door-money/capabilities.js";
import { resolvePersonalGrowthInput } from "../src/ventures/personal-growth/capabilities.js";
import {
  resolveWebDevSignalInput,
  resolveWebDevSignalOutput
} from "../src/ventures/webdev-signal/capabilities.js";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures", name), "utf8")) as unknown;
}

function request(
  map: Awaited<ReturnType<typeof loadVentureCapabilityMap>>,
  source: string,
  target: string,
  capability: string,
  schemaVersion: string
) {
  return resolveVentureCapabilityInMap(map, { source, target, capability, schemaVersion });
}

describe("venture capability map", () => {
  it("registers every current venture and rejects broad capability declarations", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    const registry = JSON.parse(await readFile(path.join(configRoot, "ventures.json"), "utf8")) as {
      ventures: Array<{ id: string }>;
    };
    const nodeIds = new Set(map.nodes.map((node) => node.id));
    for (const venture of registry.ventures) expect(nodeIds.has(venture.id)).toBe(true);
    expect(nodeIds.has("webdev-signal")).toBe(true);
    expect(map.defaultVentureContentPosture).toBe("deny");
    expect(map.mapVersion).toBe("1.1.0");
    expect(map.nodes.find((node) => node.id === "design-lab")).toMatchObject({
      classification: "rendering-service",
      canonicalOwner: "carousel-studio",
      dataActionClasses: ["rendering"]
    });
    expect(JSON.stringify(map)).not.toMatch(/"(?:\*|all-content|portfolio-read)"/u);
    expect(VentureCapabilityMapSchema.safeParse(await fixture("venture-capability-map.valid.json")).success).toBe(true);
    expect(VentureCapabilityMapSchema.safeParse(await fixture("venture-capability-map.poison.json")).success).toBe(false);
    expect(VentureCapabilityEdgeSchema.safeParse(await fixture("venture-capability-edge.valid.json")).success).toBe(true);
    expect(VentureCapabilityEdgeSchema.safeParse(await fixture("venture-capability-edge.poison.json")).success).toBe(false);
    for (const edge of map.edges) {
      await expect(
        access(path.join(repoRoot, edge.runtimeEnforcementPoint)),
        `missing runtime enforcement point: ${edge.runtimeEnforcementPoint}`
      ).resolves.toBeUndefined();
    }
  });

  it("fails closed for unknown, malformed, conflicting and unavailable requests", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    const probes: CapabilityRequest[] = [
      { source: "unknown", target: "door-money", capability: "intelligence-read", schemaVersion: "goviral-intelligence-packet/1" },
      { source: "goviral", target: "unknown", capability: "intelligence-read", schemaVersion: "goviral-intelligence-packet/1" },
      { source: "door-money", target: "design-lab", capability: "all-content", schemaVersion: "all-content/1" },
      { source: "door-money", target: "design-lab", capability: "bounded-render-summary", schemaVersion: "*" },
      { source: "caught-up", target: "mma-files", capability: "intelligence-read", schemaVersion: "goviral-intelligence-packet/1" }
    ];
    for (const probe of probes) expect(resolveVentureCapabilityInMap(map, probe).decision).toBe("denied");
    const absent = await mkdtemp(path.join(os.tmpdir(), "boardless-capability-absent-"));
    await expect(resolveVentureCapability(probes[4]!, { configRoot: absent })).resolves.toMatchObject({ decision: "denied", edge: null });
  });

  it("keeps BOOKSOFHISTORY and Tehdejší svět mutually isolated", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    for (const [source, target] of [["booksofhistory", "tehdejsi-svet"], ["tehdejsi-svet", "booksofhistory"]]) {
      expect(request(map, source!, target!, "intelligence-read", "goviral-intelligence-packet/1").decision).toBe("denied");
      expect(request(map, source!, target!, "approved-publish-package", "approved-publish-package/1").decision).toBe("denied");
    }
  });

  it("allows Personal Growth only its bounded GoVIRAL packet and a manual owner reference", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    const inbound = map.edges.filter((edge) => edge.target === "personal-growth" && edge.decision !== "denied");
    expect(inbound.map((edge) => [edge.source, edge.capability, edge.decision])).toEqual([
      ["goviral", "intelligence-read", "allowed"],
      ["admin-service", "owner-manual-reference-read", "allowed"]
    ]);
    await expect(resolvePersonalGrowthInput({
      source: "admin-service",
      capability: "owner-manual-reference-read",
      schemaVersion: "owner-manual-reference/1"
    }, { configRoot })).resolves.toMatchObject({ decision: "allowed", authorityGranted: false });
    await expect(resolvePersonalGrowthInput({
      source: "goviral",
      capability: "intelligence-read",
      schemaVersion: "personal-growth-goviral-packet/1"
    }, { configRoot })).resolves.toMatchObject({ decision: "allowed", authorityGranted: false, publishingAuthorized: false, spendAuthorized: false });
    for (const source of ["kvorum", "social-distribution", "door-money", "caught-up"]) {
      await expect(resolvePersonalGrowthInput({
        source,
        capability: "intelligence-read",
        schemaVersion: "goviral-intelligence-packet/1"
      }, { configRoot })).resolves.toMatchObject({ decision: "denied" });
    }
    expect(validateVentureCapabilityPayload(
      "personal-growth-goviral-packet/1",
      await fixture("personal-growth-goviral-packet.valid.json")
    )).toMatchObject({ valid: true });
    expect(validateVentureCapabilityPayload(
      "personal-growth-goviral-packet/1",
      await fixture("personal-growth-goviral-packet.poison.json")
    )).toMatchObject({ valid: false });
    expect(validateVentureCapabilityPayload(
      "owner-manual-reference/1",
      await fixture("personal-growth-manual-venture-reference.valid.json")
    )).toMatchObject({ valid: true });
    expect(validateVentureCapabilityPayload(
      "owner-manual-reference/1",
      await fixture("personal-growth-manual-venture-reference.poison.json")
    )).toMatchObject({ valid: false });
  });

  it("prevents Kvórum and FightAIQ from exporting political or monetization authority", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    expect(request(map, "kvorum", "personal-growth", "intelligence-read", "goviral-intelligence-packet/1").decision).toBe("denied");
    expect(request(map, "kvorum", "social-distribution", "approved-publish-package", "approved-publish-package/1").decision).toBe("denied");
    expect(request(map, "fightaiq", "social-distribution", "monetization-execution", "premium-picks/1").decision).toBe("denied");
  });

  it("limits GoVIRAL to expiring intelligence without final copy", async () => {
    expect(validateVentureCapabilityPayload(
      "goviral-intelligence-packet/1",
      await fixture("goviral-intelligence-packet.valid.json")
    )).toMatchObject({ valid: true });
    expect(validateVentureCapabilityPayload(
      "goviral-intelligence-packet/1",
      await fixture("goviral-intelligence-packet.poison.json")
    )).toMatchObject({ valid: false });
    const map = await loadVentureCapabilityMap(configRoot);
    expect(request(map, "goviral", "social-distribution", "approved-publish-package", "approved-publish-package/1").decision).toBe("denied");
  });

  it("gives Door Money exactly one held intelligence input and two bounded outputs", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    const relationships = map.edges
      .filter((edge) => (edge.source === "door-money" || edge.target === "door-money") && edge.decision !== "denied")
      .map((edge) => [edge.source, edge.target, edge.capability, edge.decision]);
    expect(relationships).toEqual([
      ["design-lab", "door-money", "health-read", "allowed"],
      ["social-distribution", "door-money", "health-read", "allowed"],
      ["goviral", "door-money", "intelligence-read", "held"],
      ["door-money", "design-lab", "bounded-render-summary", "allowed"],
      ["door-money", "social-distribution", "approved-publish-package", "allowed"]
    ]);
    await expect(resolveDoorMoneyInput({
      source: "goviral",
      capability: "intelligence-read",
      schemaVersion: "goviral-intelligence-packet/1"
    }, { configRoot })).resolves.toMatchObject({ decision: "held" });
    await expect(resolveDoorMoneyOutput({
      target: "design-lab",
      capability: "bounded-render-summary",
      schemaVersion: "bounded-render-summary/1"
    }, { configRoot })).resolves.toMatchObject({ decision: "allowed", authorityGranted: false, publishingAuthorized: false, spendAuthorized: false });
    await expect(resolveDoorMoneyOutput({
      target: "social-distribution",
      capability: "approved-publish-package",
      schemaVersion: "approved-publish-package/1"
    }, { configRoot })).resolves.toMatchObject({ decision: "allowed", authorityGranted: false, publishingAuthorized: false, spendAuthorized: false });
    await expect(resolveDoorMoneyOutput({
      target: "personal-growth",
      capability: "approved-publish-package",
      schemaVersion: "approved-publish-package/1"
    }, { configRoot })).resolves.toMatchObject({ decision: "denied" });
    for (const [schemaVersion, validName, poisonName] of [
      ["bounded-render-summary/1", "bounded-render-summary.valid.json", "bounded-render-summary.poison.json"],
      ["approved-publish-package/1", "approved-publish-package.valid.json", "approved-publish-package.poison.json"]
    ]) {
      expect(validateVentureCapabilityPayload(schemaVersion!, await fixture(validName!))).toMatchObject({ valid: true });
      expect(validateVentureCapabilityPayload(schemaVersion!, await fixture(poisonName!))).toMatchObject({ valid: false });
    }
  });

  it("registers only bounded WebDev Signal core and service relationships", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    const relationships = map.edges
      .filter((edge) => (edge.source === "webdev-signal" || edge.target === "webdev-signal") && edge.decision !== "denied")
      .map((edge) => [edge.source, edge.target, edge.capability, edge.decision]);
    expect(relationships).toEqual([
      ["goviral", "webdev-signal", "intelligence-read", "held"],
      ["webdev-signal", "design-lab", "bounded-render-summary", "allowed"],
      ["webdev-signal", "social-distribution", "approved-publish-package", "allowed"],
      ["metrics-service", "webdev-signal", "own-metrics-read", "held"],
      ["implementation-plans", "webdev-signal", "implementation-progress-read", "held"],
      ["health-service", "webdev-signal", "health-read", "held"],
      ["webdev-signal", "owner-attention", "owner-attention-write", "held"]
    ]);
    await expect(resolveWebDevSignalInput({
      source: "goviral",
      capability: "intelligence-read",
      schemaVersion: "goviral-intelligence-packet/1"
    }, { configRoot })).resolves.toMatchObject({ decision: "held" });
    await expect(resolveWebDevSignalOutput({
      target: "design-lab",
      capability: "bounded-render-summary",
      schemaVersion: "bounded-render-summary/1"
    }, { configRoot })).resolves.toMatchObject({ decision: "allowed", authorityGranted: false });
    for (const venture of ["caught-up", "devshark", "personal-growth", "kvorum", "door-money", "booksofhistory", "tehdejsi-svet", "mma-files", "fightaiq", "contest-radar"]) {
      await expect(resolveWebDevSignalInput({
        source: venture,
        capability: "intelligence-read",
        schemaVersion: "goviral-intelligence-packet/1"
      }, { configRoot })).resolves.toMatchObject({ decision: "denied" });
    }
  });
});
