import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { composeBridge, validateBridge } from "../src/mma-files/bridge.js";
import { composePortfolioContext } from "../src/portfolio/run.js";
import { atomicWriteJson, atomicWriteText } from "../src/state.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("PIVOT evidence bridge", () => {
  it("keeps every insight linked and stays inside the packet limit", () => {
    const bridge = composeBridge("2026-08-01", [{
      direction: "fightaiq-to-magazine",
      text: "The verified card change deserves a short desk note.",
      evidenceRef: "meeting:2026-08-01-mma-intake"
    }]);
    expect(validateBridge(bridge)).toEqual([]);
    expect(validateBridge("# Bridge\n\n- Unsupported insight\n")).toContain("line 3 has no evidence reference");
    expect(validateBridge(`# Bridge\n\n- ${"word ".repeat(1_001)}[source:test]\n`)[0]).toMatch(/exceeds 1000/);
  });

  it("injects the same crossed insight into all four MMA rooms", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-bridge-"));
    roots.push(root);
    const bridge = composeBridge("2026-08-01", [{
      direction: "magazine-to-fightaiq",
      text: "Readers saved the sourced layoff explainer for later.",
      evidenceRef: "scoreboard:2026-08-01"
    }]);
    await atomicWriteText(root, "mma/BRIDGE.md", bridge);
    await atomicWriteJson(root, "ventures/fightaiq/source-snapshots/2026-08-01.json", {
      schemaVersion: "fightaiq-source-snapshot/1",
      date: "2026-08-01",
      retrievedAt: "2026-08-01T06:00:00.000Z",
      evidenceRefs: ["source:cito-ufc:2026-08-01"],
      sources: [{ sourceId: "cito-ufc", status: "success", reason: null, items: [{ id: "1", name: "Test Fighter", record: "1-0" }] }]
    });
    const registry = await loadVentureRegistry();
    for (const phase of ["mma-intake", "mma-analysis", "mag-editorial", "mag-desk"] as const) {
      const packet = await composePortfolioContext(phase, root, "2026-08-01", registry);
      expect(packet.text, phase).toContain("Readers saved the sourced layoff explainer");
      expect(packet.evidenceRefs, phase).toContain("scoreboard:2026-08-01");
      if (phase === "mma-intake" || phase === "mma-analysis") {
        expect(packet.text, phase).toContain("Test Fighter");
        expect(packet.evidenceRefs, phase).toContain("source:cito-ufc:2026-08-01");
      }
    }
  });
});
