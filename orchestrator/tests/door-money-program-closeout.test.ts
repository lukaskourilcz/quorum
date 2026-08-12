import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

const DECISION_PATH = path.join(
  repoRoot,
  "state",
  "decisions",
  "2026-08-12-door-money-founding.md"
);

function section(source: string, heading: string, nextHeading: string): string {
  const start = source.indexOf(heading);
  const end = source.indexOf(nextHeading, start + heading.length);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  expect(end, nextHeading).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Door Money program closeout", () => {
  it("accounts for every DM issue with an immutable completion reference", async () => {
    const decision = await readFile(DECISION_PATH, "utf8");
    const ledger = section(decision, "## Delivery ledger", "## Honest gaps");
    const items = ledger.split("\n").filter((line) => /^- \[[ x]\] DM-/.test(line));

    expect(items).toHaveLength(48);
    expect(items.filter((line) => line.startsWith("- [x] DM-"))).toHaveLength(48);
    expect(items.some((line) => line.startsWith("- [ ] DM-"))).toBe(false);
    for (const item of items.slice(0, -1)) {
      expect(item).toMatch(/— `[0-9a-f]{8}`$/);
    }
    expect(items.at(-1)).toMatch(/^- \[x\] DM-22c .+ — this final commit$/);
  });

  it("keeps the honest phase-two gaps and private-store owner handoff explicit", async () => {
    const decision = await readFile(DECISION_PATH, "utf8");
    const gaps = section(decision, "## Honest gaps", "## Owner handoff");
    const handoff = section(decision, "## Owner handoff", "## What this does not touch");

    expect(gaps).toContain("Newsletter");
    expect(gaps).toContain("series planner");
    expect(gaps).toContain("Reels/TikTok/Shorts");
    expect(gaps).toContain("Fine-tuning is explicitly rejected");
    expect(handoff).toContain("BOOK_PRIVATE_CLONE_PATH");
    expect(handoff).not.toContain("BOOK_DB_URL");
    expect(handoff).not.toContain("BOOK_DB_KEY");
  });

  it("retires the implementation prompt without removing the durable design", async () => {
    await expect(
      readFile(path.join(repoRoot, "docs", "DOOR-MONEY-CODEX-BUILD-PROMPT.md"), "utf8")
    ).rejects.toHaveProperty("code", "ENOENT");
    await expect(
      readFile(path.join(repoRoot, "docs", "DOOR-MONEY-VENTURE-DESIGN.md"), "utf8")
    ).resolves.toContain("# Door Money");
  });
});
