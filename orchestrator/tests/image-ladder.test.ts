import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

/**
 * The ladder under test, with the paid illustration rung held dark.
 *
 * `illustrationEnabled` reads the real `process.env`, and the cycle workflow declares FAL_KEY and
 * ARTICLE_ILLUSTRATION_ENABLED at job level — so under the release gate, and nowhere else, these
 * cases walked past the search into a live billed render and the extra verdict it pushed failed
 * the plate assertions below. That is why the suite was green in CI, which exports neither, and
 * red in the gate that decides whether the council may meet. A rung is dark here because these
 * cases are about the order the ladder descends in; its own behaviour belongs to
 * illustration-rung.test.ts, which injects every dependency it touches.
 */
function ladder(
  context: Parameters<typeof selectEditionHero>[0],
  dependencies: Parameters<typeof selectEditionHero>[1] = {}
) {
  return selectEditionHero(context, { illustrationEnabled: () => false, ...dependencies });
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
    const result = await ladder(context(), {
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
    const result = await ladder(context(), {
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
    const result = await ladder(context(), {
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
    const result = await ladder(context({ brief: null, subjectQuery: "" }), {
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
    const result = await ladder(context(), {
      scenePhoto: async () => null,
      search: async () => ({
        candidates: [],
        skippedProviders: [{ provider: "pexels" as const, reason: "missing-key" as const }]
      })
    });

    expect(result.skippedProviders).toEqual([{ provider: "pexels", reason: "missing-key" }]);
  });

  it("costs the photograph and not the edition when the search throws", async () => {
    const result = await ladder(context(), {
      scenePhoto: async () => null,
      search: async () => {
        throw new Error("openverse is down");
      }
    });

    expect(result.rung).toBe("plate");
    expect(result.candidate).toBeNull();
  });
});

/**
 * Two stories, one photograph. The rotation seeded from the slug spreads picks across a pool, and
 * a pool of one has nothing to spread: on 12 August the day's concept held a single curated scene,
 * the gate considered exactly one candidate, and DNESKAi published the same server-room picture it
 * had run on 8 August — byte-identical hero and thumbnail.
 */
describe("a picture the venture just used", () => {
  async function rootWithSelection(selected: string): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "recent-hero-"));
    const directory = path.join(root, "ventures", "caught-up", "image-selections");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "2026-08-08-2026-08-08-openai-astra.json"),
      JSON.stringify({ schemaVersion: "image-selection/1", venture: "caught-up", slug: "2026-08-08-openai-astra", date: "2026-08-08", rung: "curated", selected }),
      "utf8"
    );
    return root;
  }

  /** A stand-in for the real rung, which walks its rotation and honours every refusal. */
  function rotation(...offered: LicensedPhotoCandidate[]) {
    return async ({ accept }: { accept?: (value: LicensedPhotoCandidate) => Promise<boolean> }) => {
      for (const value of offered) {
        if (!accept || (await accept(value))) return value;
      }
      return null;
    };
  }

  it("is refused, and the next file in the rotation runs instead", async () => {
    const repeat = candidate("scene:6212692", { illustrative: true });
    const fresh = candidate("scene:9990001", { illustrative: true });
    const gated: string[] = [];

    const result = await ladder(
      { ...context(), stateRoot: await rootWithSelection("scene:6212692") },
      {
        scenePhoto: rotation(repeat, fresh),
        gate: async ({ candidates }) => {
          gated.push(candidates[0]!.id);
          return { selected: candidates[0]!, verdict: { mode: "curated", considered: 1, selected: candidates[0]!.id, reason: "fits", candidates: [], skipped: [], costUsd: 0.002 } };
        }
      }
    );

    expect(result.candidate?.id).toBe("scene:9990001");
    // Refused before the gate, so a repeat costs no model call against the article's cap.
    expect(gated).toEqual(["scene:9990001"]);
  });

  it("still runs when it is this article's own recorded pick, so a re-run is not a repeat", async () => {
    const same = candidate("scene:6212692", { illustrative: true });
    const root = await mkdtemp(path.join(os.tmpdir(), "recent-hero-own-"));
    const directory = path.join(root, "ventures", "caught-up", "image-selections");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "2026-08-08-own.json"),
      JSON.stringify({ slug: "2026-08-08", selected: "scene:6212692" }),
      "utf8"
    );

    const result = await ladder(
      { ...context(), stateRoot: root },
      {
        scenePhoto: rotation(same),
        gate: async ({ candidates }) => ({ selected: candidates[0]!, verdict: { mode: "curated", considered: 1, selected: candidates[0]!.id, reason: "fits", candidates: [], skipped: [], costUsd: 0.002 } })
      }
    );

    expect(result.candidate?.id).toBe("scene:6212692");
  });
});
