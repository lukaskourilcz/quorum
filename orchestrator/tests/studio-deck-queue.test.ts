import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCarouselSummary } from "@boardlessai/carousel-studio";
import { renderQueuedKvorumDecks } from "../src/studio/deck-queue.js";
import { repoRoot } from "../src/paths.js";
import { atomicWriteJson } from "../src/state.js";

interface DesignLab {
  status: string;
  requestedAt: string | null;
  resolvedAt: string | null;
  recipeRef: string | null;
  artifactRefs: string[];
  failureReason: string | null;
}

async function approvedRecommendation(options: { withSummary: boolean }): Promise<{
  root: string;
  ref: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "kvorum-deck-"));
  const fixture = JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/kvorum-venture-recommendation.valid.json"),
    "utf8"
  )) as Record<string, unknown> & { id: string; date: string };
  const record = {
    ...fixture,
    designLab: {
      status: "queued",
      requestedAt: "2026-08-12T10:00:00.000Z",
      resolvedAt: null,
      recipeRef: null,
      artifactRefs: [],
      failureReason: null
    }
  };
  const ref = `ventures/kvorum/recommendations/${fixture.date}-public-media.json`;
  await atomicWriteJson(root, ref, record);

  if (options.withSummary) {
    const slug = fixture.id.replace(`kv-${fixture.date}-`, "");
    await atomicWriteJson(
      root,
      `ventures/carousel-studio/summaries/kvorum/${fixture.date}-${slug}.json`,
      buildCarouselSummary({
        venture: "kvorum",
        slug,
        date: fixture.date,
        title: "Sněmovna projednává financování veřejnoprávních médií",
        dek: "Předloha mění výpočet poplatku a přesouvá jeho výběr na stát.",
        points: [
          "Výbor doporučil pozměňovací návrh, který mění výpočet poplatku.",
          "Ministerstvo financí odhaduje dopad na rozpočet v řádu miliard.",
          "Sněmovna o návrhu hlasuje ve druhém čtení příští týden."
        ],
        sources: [{ kind: "source", label: "Poslanecká sněmovna" }],
        hasHero: false,
        heroCredit: null
      })
    );
  }
  return { root, ref };
}

async function designLabOf(root: string, ref: string): Promise<DesignLab> {
  const record = JSON.parse(await readFile(path.join(root, ref), "utf8")) as { designLab: DesignLab };
  return record.designLab;
}

/**
 * Approval has always set `designLab.status: "queued"` and nothing has ever moved it. The two
 * fields beside it stayed empty, so a reader could not tell an approval waiting to be drawn from
 * one the renderer had dropped.
 */
describe("the Kvórum deck queue", () => {
  it("draws a queued approval and writes the design and frames back onto it", async () => {
    const { root, ref } = await approvedRecommendation({ withSummary: true });

    const outcomes = await renderQueuedKvorumDecks({ root, now: new Date("2026-08-12T11:00:00.000Z") });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.status).toBe("rendered");
    const designLab = await designLabOf(root, ref);
    expect(designLab.status).toBe("rendered");
    expect(designLab.resolvedAt).toBe("2026-08-12T11:00:00.000Z");
    expect(designLab.recipeRef).toMatch(/^ventures\/carousel-studio\/recipes\/kvorum\//u);
    expect(designLab.artifactRefs.length).toBeGreaterThan(1);
    expect(designLab.failureReason).toBeNull();
    // The request survives the resolution: the record says when it was asked for and when it landed.
    expect(designLab.requestedAt).toBe("2026-08-12T10:00:00.000Z");
  });

  it("says why rather than leaving a record queued forever", async () => {
    const { root, ref } = await approvedRecommendation({ withSummary: false });

    const outcomes = await renderQueuedKvorumDecks({ root });

    expect(outcomes[0]?.status).toBe("failed");
    const designLab = await designLabOf(root, ref);
    expect(designLab.status).toBe("failed");
    expect(designLab.failureReason).toContain("no summary");
    expect(designLab.artifactRefs).toEqual([]);
  });

  it("leaves a record it has already drawn alone", async () => {
    const { root, ref } = await approvedRecommendation({ withSummary: true });

    await renderQueuedKvorumDecks({ root, now: new Date("2026-08-12T11:00:00.000Z") });
    const second = await renderQueuedKvorumDecks({ root, now: new Date("2026-08-13T11:00:00.000Z") });

    expect(second).toHaveLength(0);
    expect((await designLabOf(root, ref)).resolvedAt).toBe("2026-08-12T11:00:00.000Z");
  });
});
