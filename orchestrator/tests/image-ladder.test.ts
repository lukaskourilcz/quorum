import { describe, expect, it } from "vitest";
import { ImageProgramBudget } from "../src/images/budget.js";
import { searchPhrasesFor, selectEditionHero } from "../src/images/ladder.js";
import type { LicensedPhotoCandidate } from "../src/images/licensed.js";
import type { GateOutcome } from "../src/images/vision-gate.js";
import type { VisualBrief } from "../src/images/visual-brief.js";

function candidate(id: string, overrides: Partial<LicensedPhotoCandidate> = {}): LicensedPhotoCandidate {
  return {
    id,
    provider: "openverse",
    title: id,
    thumbnailUrl: `https://api.openverse.org/${id}/thumb/`,
    downloadUrl: `https://live.staticflickr.com/${id}.jpg`,
    width: 1_920,
    height: 1_080,
    license: "CC BY",
    author: "A photographer",
    sourceUrl: `https://example.test/${id}`,
    attributionHtml: "A photographer · CC BY",
    ...overrides
  };
}

const SCENE = candidate("scene:1", { illustrative: true, altCs: "Ilustrační fotografie k tématu: řady serverových skříní." });

function rejectAll(considered: number): GateOutcome {
  return {
    selected: null,
    verdict: {
      mode: "search",
      considered,
      selected: null,
      reason: "all-candidates-rejected",
      candidates: [],
      skipped: [],
      costUsd: 0.004
    }
  };
}

const brief: VisualBrief = {
  phrases: ["empty courtroom bench", "government building facade"],
  concept: null,
  negatives: ["circuit board"]
};

function context(overrides: { brief?: VisualBrief | null; subjectQuery?: string } = {}) {
  return {
    venture: "caught-up" as const,
    stateRoot: "/nonexistent",
    cycleId: "cycle-test",
    budget: new ImageProgramBudget({ usd: 0, generatedImages: 0 }),
    article: { titleCs: "Soud rozhodl o vývozu čipů", dekCs: "Rozhodnutí mění pravidla." },
    brief: overrides.brief === undefined ? brief : overrides.brief,
    seed: "2026-08-08",
    subjectQuery: overrides.subjectQuery ?? "courtroom"
  };
}

describe("which phrases the search runs on", () => {
  it("prefers the desk's own and falls back to the tag-derived query", () => {
    expect(searchPhrasesFor(brief, "courtroom")).toEqual([
      "empty courtroom bench",
      "government building facade"
    ]);
    expect(searchPhrasesFor(null, "courtroom")).toEqual(["courtroom"]);
    expect(searchPhrasesFor(null, "   ")).toEqual([]);
  });
});

describe("the edition's ladder", () => {
  it("takes a curated scene before it searches at all", async () => {
    let searched = false;
    const result = await selectEditionHero(context(), {
      scenePhoto: async () => SCENE,
      search: async () => {
        searched = true;
        return { candidates: [], skippedProviders: [] };
      }
    });

    expect(result.rung).toBe("curated");
    expect(result.candidate).toEqual(SCENE);
    expect(searched).toBe(false);
  });

  it("descends to the plate when the gate refuses everything the search found", async () => {
    // The whole programme in one case. Three candidates came back, a model looked at all three,
    // none of them may run, and the article gets the FRAME cover — which is the honest answer
    // and was never reachable before, because the writer had to name an index from the captions.
    const result = await selectEditionHero(context(), {
      scenePhoto: async () => null,
      search: async () => ({
        candidates: [candidate("a"), candidate("b"), candidate("c")],
        skippedProviders: []
      }),
      gate: async ({ candidates }) => rejectAll(candidates.length)
    });

    expect(result.rung).toBe("plate");
    expect(result.candidate).toBeNull();
    // The refusal is on the record. An owner reading the run can see three were considered.
    expect(result.verdicts).toHaveLength(1);
    expect(result.verdicts[0]!.considered).toBe(3);
    expect(result.verdicts[0]!.reason).toBe("all-candidates-rejected");
  });

  it("ships what the gate picked when it picks something", async () => {
    const winner = candidate("b");
    const seen: string[][] = [];
    const result = await selectEditionHero(context(), {
      scenePhoto: async () => null,
      search: async ({ phrases }) => {
        seen.push([...phrases]);
        return { candidates: [candidate("a"), winner], skippedProviders: [] };
      },
      gate: async ({ candidates, article }) => {
        // The negatives the desk wrote travel to the gate; the candidates' captions do not.
        expect(article.negatives).toEqual(["circuit board"]);
        return {
          selected: candidates[1]!,
          verdict: {
            mode: "search",
            considered: candidates.length,
            selected: candidates[1]!.id,
            reason: "An empty bench, no people.",
            candidates: [],
            skipped: [],
            costUsd: 0.004
          }
        };
      }
    });

    expect(seen).toEqual([["empty courtroom bench", "government building facade"]]);
    expect(result.rung).toBe("search");
    expect(result.candidate).toEqual(winner);
  });

  it("never calls the gate when the search comes back empty", async () => {
    let gated = false;
    const result = await selectEditionHero(context({ brief: null, subjectQuery: "" }), {
      scenePhoto: async () => null,
      search: async () => {
        throw new Error("should not be reached with no phrases");
      },
      gate: async () => {
        gated = true;
        return rejectAll(0);
      }
    });

    expect(gated).toBe(false);
    expect(result.rung).toBe("plate");
    expect(result.verdicts).toEqual([]);
  });

  it("carries the skipped providers out so the owner document can name them", async () => {
    const result = await selectEditionHero(context(), {
      scenePhoto: async () => null,
      search: async () => ({
        candidates: [],
        skippedProviders: [{ provider: "pexels" as const, reason: "missing-key" as const }]
      })
    });

    expect(result.skippedProviders).toEqual([{ provider: "pexels", reason: "missing-key" }]);
  });

  it("costs the photograph and not the edition when the search throws", async () => {
    const result = await selectEditionHero(context(), {
      scenePhoto: async () => null,
      search: async () => {
        throw new Error("openverse is down");
      }
    });

    expect(result.rung).toBe("plate");
    expect(result.candidate).toBeNull();
  });
});
