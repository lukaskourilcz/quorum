import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { VentureRecommendationSchema } from "../src/contracts/venture-recommendation.js";

let fixture: Record<string, unknown>;

beforeAll(async () => {
  fixture = JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/venture-recommendation.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
});

describe("venture-recommendation/1", () => {
  it("keeps book evidence bounded, fully scored and linked to the matching private chunk", () => {
    const parsed = VentureRecommendationSchema.parse(fixture);
    expect(parsed.evidence).toMatchObject({
      kind: "book-passage",
      excerptChunkId: "ch01-s01-c001"
    });
    expect(parsed.evidence.excerpt.length).toBeLessThanOrEqual(600);
    expect(parsed.evidence.scoresAtSelection.map(({ chunkId }) => chunkId))
      .toEqual(parsed.evidence.chunkIds);

    const atCap = structuredClone(fixture) as {
      evidence: { excerpt: string };
    };
    atCap.evidence.excerpt = "x".repeat(600);
    expect(VentureRecommendationSchema.safeParse(atCap).success).toBe(true);
    atCap.evidence.excerpt = "x".repeat(601);
    expect(VentureRecommendationSchema.safeParse(atCap).success).toBe(false);
  });

  it("rejects score snapshots and private links that do not cover the selected chunks", () => {
    const missingScores = structuredClone(fixture) as {
      evidence: { scoresAtSelection: unknown[] };
    };
    missingScores.evidence.scoresAtSelection = [];
    expect(VentureRecommendationSchema.safeParse(missingScores).success).toBe(false);

    const wrongLink = structuredClone(fixture) as {
      evidence: { privateStoreLink: string };
    };
    wrongLink.evidence.privateStoreLink = wrongLink.evidence.privateStoreLink.replace(
      "ch01-s01-c001",
      "ch01-s01-c002"
    );
    expect(VentureRecommendationSchema.safeParse(wrongLink).success).toBe(false);
  });

  it("stores the CTA mode needed by the rolling seven-day gate", () => {
    const mismatched = structuredClone(fixture) as {
      cta: { mode: string; text: string | null };
    };
    mismatched.cta = { mode: "explicit-buy-book", text: null };
    expect(VentureRecommendationSchema.safeParse(mismatched).success).toBe(false);
    mismatched.cta.text = "Buy the synthetic fixture book.";
    expect(VentureRecommendationSchema.safeParse(mismatched).success).toBe(true);
  });

  it("accepts only the recorded draft-to-approved owner transition and its Design Lab receipt", () => {
    const approved = structuredClone(fixture) as {
      status: string;
      owner: { approvedAt: string | null; approvalNote: string | null };
      designLab: { summaryPath: string | null; readyAt: string | null };
      statusHistory: Array<Record<string, unknown>>;
      updatedAt: string;
    };
    approved.status = "approved";
    approved.owner.approvedAt = "2026-08-12T11:00:00.000Z";
    approved.owner.approvalNote = "Owner approved the invented fixture without edits.";
    approved.designLab.summaryPath = "state/ventures/carousel-studio/summaries/door-money/fixture.json";
    approved.designLab.readyAt = "2026-08-12T11:00:00.000Z";
    approved.statusHistory.push({
      from: "draft",
      to: "approved",
      at: "2026-08-12T11:00:00.000Z",
      actor: "owner",
      reason: "Approved for manual review output."
    });
    approved.updatedAt = "2026-08-12T11:00:00.000Z";
    expect(VentureRecommendationSchema.safeParse(approved).success).toBe(true);

    const jumpedToPosted = structuredClone(approved);
    jumpedToPosted.status = "posted";
    expect(VentureRecommendationSchema.safeParse(jumpedToPosted).success).toBe(false);
  });
});
