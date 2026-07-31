import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCycle } from "../src/cycle.js";
import { repoRoot } from "../src/paths.js";

const canonicalFiles = [
  "state/BUSINESS.md",
  "state/INBOX.md",
  "state/OPPORTUNITIES.json",
  "state/EVIDENCE.jsonl",
  "state/budget/ledger.json",
  "state/finance/ledger.json",
  "state/finance/daily-costs.jsonl",
  "state/treasury/ledger.json",
  "state/org/changes.jsonl"
] as const;

async function canonicalHashes(): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      canonicalFiles.map(async (relativePath) => {
        const bytes = await readFile(path.join(repoRoot, relativePath));
        return [
          relativePath,
          createHash("sha256").update(bytes).digest("hex")
        ] as const;
      })
    )
  );
}

describe("end-to-end dry founding cycle", () => {
  it("produces a deterministic fixture without mutating canonical state", async () => {
    const before = await canonicalHashes();
    const now = new Date("2026-07-25T05:30:00.000Z");

    const first = await runCycle({
      phase: "founding",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now
    });
    const second = await runCycle({
      phase: "founding",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now
    });

    expect(first).toEqual(second);
    expect(first.status).toBe("dry_complete");
    expect(first.decision).toBe("INSUFFICIENT_EVIDENCE");
    expect(first.artifacts).toHaveLength(6);
    expect(
      first.artifacts.every((artifact) => artifact.startsWith("tmp/dry-run/state/"))
    ).toBe(true);

    const decisionPath = path.join(
      repoRoot,
      first.artifacts.find((artifact) => artifact.includes("/decisions/"))!
    );
    const decision = JSON.parse(await readFile(decisionPath, "utf8")) as {
      fixture: boolean;
      outcome: string;
      selectedOpportunityId: string | null;
      evidenceRefs: string[];
    };
    expect(decision).toMatchObject({
      fixture: true,
      outcome: "INSUFFICIENT_EVIDENCE",
      selectedOpportunityId: null
    });
    expect(decision.evidenceRefs).toEqual([]);
    expect(await canonicalHashes()).toEqual(before);
  });
});
