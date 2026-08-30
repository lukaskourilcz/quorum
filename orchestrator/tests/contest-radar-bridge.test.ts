import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContestGoViralLeads } from "../src/ventures/contest-radar/goviral.js";

async function root(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "contest-goviral-"));
}

async function snapshot(stateRoot: string, date: string, items: unknown[]): Promise<void> {
  const directory = path.join(stateRoot, "goviral", "trends");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${date}.json`), JSON.stringify({ items }), "utf8");
}

/**
 * GoVIRAL owns Instagram and TikTok for the whole portfolio. This is the one way a social lead
 * reaches Contest Radar, and what comes back may open an investigation and never establish a fact.
 */
describe("the GoVIRAL discovery bridge", () => {
  it("reports an absent GoVIRAL as absent rather than as a fault", async () => {
    const read = await readContestGoViralLeads({ stateRoot: await root(), asOfDate: "2026-08-30" });

    expect(read.decision).toBe("allowed");
    expect(read.leads).toEqual([]);
    expect(read.reason).toContain("no trend snapshot yet");
  });

  it("reads leads from the newest snapshot and clips their text", async () => {
    const stateRoot = await root();
    await snapshot(stateRoot, "2026-08-29", [
      { url: "https://example.test/contest", text: "x".repeat(500), observedAt: "2026-08-29T10:00:00.000Z" },
      { url: "http://insecure.test/contest", text: "dropped" },
      { text: "no url at all" }
    ]);

    const read = await readContestGoViralLeads({ stateRoot, asOfDate: "2026-08-30" });

    expect(read.leads).toHaveLength(1);
    // A lead is a pointer, not a payload: scraped text is clipped and never grows.
    expect(read.leads[0]?.note.length).toBe(280);
    expect(read.leads[0]?.evidenceRef).toBe("state/goviral/trends/2026-08-29.json");
  });

  it("refuses a snapshot past its staleness limit", async () => {
    const stateRoot = await root();
    await snapshot(stateRoot, "2026-08-01", [{ url: "https://example.test/old" }]);

    const read = await readContestGoViralLeads({ stateRoot, asOfDate: "2026-08-30" });

    expect(read.leads).toEqual([]);
    expect(read.reason).toContain("staleness limit");
  });

  it("fails closed when the capability map does not grant the edge", async () => {
    const configRoot = await mkdtemp(path.join(os.tmpdir(), "contest-config-"));
    await writeFile(path.join(configRoot, "venture-capabilities.json"), JSON.stringify({
      schemaVersion: "venture-capability-map/1",
      mapVersion: "1.2.0",
      effectiveDate: "2026-08-30",
      defaultVentureContentPosture: "deny",
      decisionReference: "test",
      nodes: [],
      edges: [],
      isolationRules: [],
      supersessionHistory: []
    }), "utf8");
    const stateRoot = await root();
    await snapshot(stateRoot, "2026-08-29", [{ url: "https://example.test/contest" }]);

    const read = await readContestGoViralLeads({ stateRoot, asOfDate: "2026-08-30", configRoot });

    // An unregistered edge yields no leads and a reason, never an exception and never a silent
    // empty list that reads the same as a quiet week.
    expect(read.leads).toEqual([]);
    expect(read.decision).not.toBe("allowed");
    expect(read.reason).toContain("bridge is");
  });
});
