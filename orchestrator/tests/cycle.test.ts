import { describe, expect, it } from "vitest";
import { runCycle } from "../src/cycle.js";

describe("cycle preflight", () => {
  it("explains a zero-network dry cycle with bounded routing", async () => {
    const result = await runCycle({
      phase: "am",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: new Date("2026-07-23T05:30:00.000Z")
    });
    expect(result.status).toBe("dry_complete");
    expect(result.estimatedWorstCaseUsd).toBeLessThanOrEqual(0.12);
    expect(result.selectedAgents).toEqual(
      expect.arrayContaining(["VIZE", "FORGE", "PULSE", "AUDIT", "LEDGER"])
    );
    expect(result.skippedAgents).toContain("PEOPLE");
    expect(result.artifacts).toEqual(
      expect.arrayContaining([
        "tmp/dry-run/state/standups/2026-07-23-am.json"
      ])
    );
  });

  it("refuses to found a venture from fixture evidence", async () => {
    const result = await runCycle({
      phase: "founding",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: new Date("2026-07-23T05:30:00.000Z")
    });
    expect(result.decision).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.status).toBe("dry_complete");
  });

  it("is deterministic for the same cycle identity", async () => {
    const now = new Date("2026-07-23T19:30:00.000Z");
    const first = await runCycle({
      phase: "pm",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now
    });
    const second = await runCycle({
      phase: "pm",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now
    });
    expect(second).toEqual(first);
  });
});
