import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import {
  BOOK_TEXT_CHARACTER_CAP,
  inspectDoorMoneyPublicArtifacts,
  loadDoorMoneyPublicArtifacts,
  STYLE_EXEMPLAR_CHARACTER_CAP,
  STYLE_EXEMPLAR_COUNT_CAP,
  type DoorMoneyPublicArtifact
} from "../src/ventures/door-money/public-boundary.js";

function artifact(value: unknown, artifactPath = "state/ventures/door-money/knowledge/fixture.json"): DoorMoneyPublicArtifact {
  return { path: artifactPath, content: JSON.stringify(value) };
}

describe("Door Money's public-repository boundary", () => {
  it("accepts the exact excerpt and exemplar ceilings", () => {
    const exemplars = Array.from({ length: STYLE_EXEMPLAR_COUNT_CAP }, (_, index) => ({
      id: `fixture-${index + 1}`,
      text: "x".repeat(STYLE_EXEMPLAR_CHARACTER_CAP),
      embeddingId: `private-fixture-${index + 1}`
    }));
    expect(inspectDoorMoneyPublicArtifacts([artifact({
      sourceExcerpt: "x".repeat(BOOK_TEXT_CHARACTER_CAP),
      exemplarBank: exemplars
    })])).toEqual([]);
  });

  it("rejects an over-cap source string without committing that poison text", () => {
    const violations = inspectDoorMoneyPublicArtifacts([artifact({
      sourceExcerpt: "x".repeat(BOOK_TEXT_CHARACTER_CAP + 1)
    })]);
    expect(violations).toEqual([expect.objectContaining({
      field: "sourceExcerpt",
      message: expect.stringContaining("601 characters")
    })]);
  });

  it("rejects exemplar 41, character 281 and an inline vector", () => {
    const exemplarBank = Array.from({ length: STYLE_EXEMPLAR_COUNT_CAP + 1 }, (_, index) => ({
      id: `fixture-${index + 1}`,
      text: index === 0 ? "x".repeat(STYLE_EXEMPLAR_CHARACTER_CAP + 1) : "safe synthetic line",
      embeddingId: `private-fixture-${index + 1}`,
      ...(index === 1 ? { embedding: [0.1, 0.2] } : {})
    }));
    const messages = inspectDoorMoneyPublicArtifacts([artifact({ exemplarBank })])
      .map(({ message }) => message);
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining("41 entries"),
      expect.stringContaining("281 characters"),
      expect.stringContaining("embedding vectors")
    ]));
  });

  it("rejects private source paths before reading their content", () => {
    const violations = inspectDoorMoneyPublicArtifacts([
      artifact({}, "state/ventures/door-money/manuscript/source.md"),
      artifact({}, "state/ventures/door-money/kb/chunks/ch01.json"),
      artifact({}, "state/ventures/door-money/kb/embeddings.json")
    ]);
    expect(violations).toHaveLength(3);
    expect(violations.every(({ field }) => field === "$path")).toBe(true);
  });

  it("keeps every tracked or commit-eligible Door Money state artifact inside the boundary", async () => {
    const artifacts = await loadDoorMoneyPublicArtifacts(repoRoot);
    expect(artifacts.map(({ path }) => path)).toContain("state/ventures/door-money/README.md");
    expect(inspectDoorMoneyPublicArtifacts(artifacts)).toEqual([]);
  });
});
