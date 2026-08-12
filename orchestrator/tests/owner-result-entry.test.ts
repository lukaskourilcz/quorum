import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OwnerResultEntrySchema } from "../src/contracts/owner-result-entry.js";
import { repoRoot } from "../src/paths.js";

async function fixture(kind: "valid" | "poison") {
  return JSON.parse(await readFile(
    path.join(repoRoot, `contracts/fixtures/owner-result-entry.${kind}.json`),
    "utf8"
  )) as unknown;
}

describe("owner-result-entry/1", () => {
  it("accepts the owner-entered per-post fixture and rejects automated poison", async () => {
    expect(OwnerResultEntrySchema.safeParse(await fixture("valid")).success).toBe(true);
    expect(OwnerResultEntrySchema.safeParse(await fixture("poison")).success).toBe(false);
  });

  it("requires a number and an honest post-to-capture-to-entry timeline", async () => {
    const valid = await fixture("valid") as Record<string, unknown>;
    expect(OwnerResultEntrySchema.safeParse({
      ...valid,
      metrics: {
        impressions: null,
        reach: null,
        saves: null,
        shares: null,
        comments: null,
        follows: null
      }
    }).success).toBe(false);
    expect(OwnerResultEntrySchema.safeParse({
      ...valid,
      capturedAt: "2026-08-12T21:00:00.000Z"
    }).success).toBe(false);
  });
});
