import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  VentureRecommendationSchema,
  type VentureRecommendation
} from "../src/contracts/venture-recommendation.js";
import { repoRoot } from "../src/paths.js";

async function validFixture(): Promise<VentureRecommendation> {
  return VentureRecommendationSchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/venture-recommendation.valid.json"),
    "utf8"
  )) as unknown);
}

describe("venture-recommendation/1", () => {
  test("accepts the draft and all owner lifecycle states", async () => {
    const draft = await validFixture();
    const approved = {
      ...draft,
      updatedAt: "2026-08-12T22:00:00.000Z",
      status: "approved",
      owner: {
        ...draft.owner,
        approvedAt: "2026-08-12T22:00:00.000Z",
        editHistory: [{
          editedAt: "2026-08-12T21:30:00.000Z",
          changedBy: "owner",
          fields: ["headline"],
          note: "Made the procedural step explicit."
        }]
      }
    };
    expect(VentureRecommendationSchema.safeParse(approved).success).toBe(true);

    const posted = {
      ...approved,
      updatedAt: "2026-08-13T07:30:00.000Z",
      status: "posted",
      owner: {
        ...approved.owner,
        postedAt: "2026-08-13T07:30:00.000Z",
        postedUrl: "https://www.instagram.com/p/example/"
      }
    };
    expect(VentureRecommendationSchema.safeParse(posted).success).toBe(true);
    expect(VentureRecommendationSchema.safeParse({
      ...posted,
      updatedAt: "2026-09-01T12:00:00.000Z",
      status: "archived",
      owner: { ...posted.owner, archivedAt: "2026-09-01T12:00:00.000Z" }
    }).success).toBe(true);
    expect(VentureRecommendationSchema.safeParse({
      ...draft,
      updatedAt: "2026-08-12T22:00:00.000Z",
      status: "rejected",
      owner: {
        ...draft.owner,
        rejectedAt: "2026-08-12T22:00:00.000Z",
        rejectionReason: "The development is not material enough."
      }
    }).success).toBe(true);
  });

  test("rejects lifecycle shortcuts and keeps posting manual-only", async () => {
    const draft = await validFixture();
    expect(VentureRecommendationSchema.safeParse({
      ...draft,
      status: "posted",
      owner: { ...draft.owner, postedUrl: "https://example.com/post" }
    }).success).toBe(false);
    expect(VentureRecommendationSchema.safeParse({
      ...draft,
      owner: { ...draft.owner, postingMode: "automatic" }
    }).success).toBe(false);
    expect(VentureRecommendationSchema.safeParse({
      ...draft,
      owner: { ...draft.owner, resultRefs: ["result-before-post"] }
    }).success).toBe(false);
    expect(VentureRecommendationSchema.safeParse({
      ...draft,
      status: "approved",
      owner: { ...draft.owner, approvedAt: "2026-08-12T22:00:00.000Z" }
    }).success).toBe(false);
  });

  test("resolves every claim and refuses discovery-only factual evidence", async () => {
    const valid = await validFixture();
    const unresolved = structuredClone(valid);
    unresolved.evidence.claims[0]!.refs[0] = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    expect(VentureRecommendationSchema.safeParse(unresolved).success).toBe(false);

    const discoveryFact = structuredClone(valid);
    discoveryFact.evidence.claims[1]!.refs = ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"];
    expect(VentureRecommendationSchema.safeParse(discoveryFact).success).toBe(false);

    const falseMulti = structuredClone(valid);
    falseMulti.evidence.claims[0]!.refs = ["cccccccccccccccccccccccccccccccccccccccc"];
    expect(VentureRecommendationSchema.safeParse(falseMulti).success).toBe(false);
    expect(valid.evidence.claims.find((claim) => claim.type === "commentary")?.refs)
      .toContain("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  test("keeps every Štít item in a matching internal-only block", async () => {
    const valid = await validFixture();
    const absent = structuredClone(valid);
    absent.evidence.stitAttribution = null;
    expect(VentureRecommendationSchema.safeParse(absent).success).toBe(false);

    const mismatch = structuredClone(valid);
    mismatch.evidence.stitAttribution!.posts[0]!.postUrl = "https://facebook.com/stitdemokracie/posts/other";
    expect(VentureRecommendationSchema.safeParse(mismatch).success).toBe(false);

    const publicContext = structuredClone(valid) as unknown as { evidence: { stitAttribution: { internalOnly: boolean } } };
    publicContext.evidence.stitAttribution.internalOnly = false;
    expect(VentureRecommendationSchema.safeParse(publicContext).success).toBe(false);
  });

  test("cross-checks copy declarations, gate claims and summaries", async () => {
    const valid = await validFixture();
    const undeclared = structuredClone(valid);
    undeclared.copyBlocks[0]!.platform = "facebook";
    expect(VentureRecommendationSchema.safeParse(undeclared).success).toBe(false);

    const unused = structuredClone(valid);
    unused.formats.push("single-image");
    expect(VentureRecommendationSchema.safeParse(unused).success).toBe(false);

    const lyingGate = structuredClone(valid);
    lyingGate.gateResults.results[0]!.verdict = "fail";
    expect(VentureRecommendationSchema.safeParse(lyingGate).success).toBe(false);

    const unknownClaim = structuredClone(valid);
    unknownClaim.gateResults.results[0]!.claimIds = ["claim-that-does-not-exist"];
    expect(VentureRecommendationSchema.safeParse(unknownClaim).success).toBe(false);
  });

  test("requires complete Design Lab receipts and rejects unknown fields", async () => {
    const valid = await validFixture();
    const rendered = structuredClone(valid);
    rendered.updatedAt = "2026-08-12T22:01:00.000Z";
    rendered.designLab = {
      status: "rendered",
      requestedAt: "2026-08-12T22:00:00.000Z",
      resolvedAt: "2026-08-12T22:01:00.000Z",
      recipeRef: "state/ventures/carousel-studio/recipes/kvorum/example.json",
      artifactRefs: ["state/ventures/carousel-studio/exports/kvorum/example.zip"],
      failureReason: null
    };
    expect(VentureRecommendationSchema.safeParse(rendered).success).toBe(true);
    rendered.designLab.artifactRefs = [];
    expect(VentureRecommendationSchema.safeParse(rendered).success).toBe(false);
    expect(VentureRecommendationSchema.safeParse({ ...valid, publisherAction: "post" }).success).toBe(false);
  });
});
