import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SocialInventoryBuildReceiptSchema,
  SocialInventoryCandidateSchema,
  SocialProfileInventorySchema
} from "../src/contracts/social-inventory.js";
import { repoRoot } from "../src/paths.js";

describe("Social inventory contracts", () => {
  it("accepts bounded planning evidence and rejects queue, final-copy and inconsistent-count mutations", async () => {
    const fixture = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/social-inventory-contracts.valid.json"), "utf8")) as { candidate: Record<string, unknown>; inventory: Record<string, unknown>; receipt: Record<string, unknown> };
    const candidate = SocialInventoryCandidateSchema.parse(fixture.candidate);
    expect(SocialProfileInventorySchema.safeParse(fixture.inventory).success).toBe(true);
    const inventory = SocialProfileInventorySchema.parse({ ...fixture.inventory, coverageDays: 1, state: "low-runway", counts: { original: 1, reserve: 0, recurring: 0, campaign: 0, eligible: 1, held: 0 }, ratioProjection: { original: 1, support: 0, policyRef: "GitHub #415" }, candidates: [candidate] });
    expect(SocialInventoryBuildReceiptSchema.safeParse(fixture.receipt).success).toBe(true);
    expect(SocialInventoryCandidateSchema.safeParse({ ...candidate, finalCopy: true }).success).toBe(false);
    expect(SocialInventoryCandidateSchema.safeParse({ ...candidate, action: "queue" }).success).toBe(false);
    expect(SocialProfileInventorySchema.safeParse({ ...inventory, counts: { ...inventory.counts, original: 2 } }).success).toBe(false);
    expect(SocialInventoryBuildReceiptSchema.safeParse({ ...fixture.receipt, queueAuthorized: true }).success).toBe(false);
  });
});
