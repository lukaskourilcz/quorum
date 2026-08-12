import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KvorumClaimSchema } from "../src/contracts/kvorum-claim.js";
import { repoRoot } from "../src/paths.js";

async function fixture(kind: "valid" | "poison") {
  return JSON.parse(await readFile(
    path.join(repoRoot, `contracts/fixtures/kvorum-claim.${kind}.json`),
    "utf8"
  )) as unknown;
}

describe("kvorum-claim/1", () => {
  it("accepts the published standing record and rejects the poison fixture", async () => {
    expect(KvorumClaimSchema.safeParse(await fixture("valid")).success).toBe(true);
    expect(KvorumClaimSchema.safeParse(await fixture("poison")).success).toBe(false);
  });

  it("keeps approval distinct from publication", async () => {
    const approved = structuredClone(await fixture("valid")) as Record<string, unknown>;
    approved.recommendationStatus = "approved-draft";
    approved.updatedAt = approved.createdAt;
    approved.publishedAt = null;
    approved.postedUrl = null;
    expect(KvorumClaimSchema.safeParse(approved).success).toBe(true);

    approved.postedUrl = "https://example.com/false-receipt";
    expect(KvorumClaimSchema.safeParse(approved).success).toBe(false);
  });

  it("allows only standing to corrected or retracted records with a correction draft ref", async () => {
    const standing = await fixture("valid") as Record<string, unknown>;
    for (const status of ["corrected", "retracted"] as const) {
      const transitioned = {
        ...standing,
        status,
        updatedAt: "2026-08-13T08:00:00.000Z",
        correctionRef: "state/ventures/kvorum/recommendations/2026-08-13-correction-public-media.json"
      };
      expect(KvorumClaimSchema.safeParse(transitioned).success).toBe(true);
    }
    expect(KvorumClaimSchema.safeParse({
      ...standing,
      status: "corrected",
      correctionRef: null
    }).success).toBe(false);
  });
});
