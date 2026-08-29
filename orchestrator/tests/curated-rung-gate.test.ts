import { describe, expect, it } from "vitest";
import { ImageProgramBudget } from "../src/images/budget.js";
import { CURATED_GATE_ATTEMPTS, selectArticleHero, selectEditionHero } from "../src/images/ladder.js";
import { illustrativeRotation, illustrativeSportPhoto } from "../src/images/illustrative.js";
import type { LicensedPhotoCandidate } from "../src/images/licensed.js";
import type { AssessCandidatesInput, GateOutcome } from "../src/images/vision-gate.js";

/**
 * A Commons file page as the API returns one, for whichever title is asked for.
 *
 * Every curated file resolves; nothing here tests fetching. What is under test is what happens
 * after a file resolves and a model looks at it.
 */
function commons(url: string): unknown {
  const title = decodeURIComponent(new URL(url).searchParams.get("titles") ?? "").replace(/^File:/u, "");
  const pageId = 1_000 + title.length;
  return {
    query: {
      pages: {
        [String(pageId)]: {
          pageid: pageId,
          title: `File:${title}`,
          imageinfo: [{
            url: `https://upload.wikimedia.org/wikipedia/commons/a/aa/${encodeURIComponent(title)}`,
            thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/${encodeURIComponent(title)}/640px.jpg`,
            width: 2_000,
            height: 1_200,
            mime: "image/jpeg",
            extmetadata: {
              LicenseShortName: { value: "CC BY-SA 4.0" },
              Artist: { value: "A photographer" },
              ImageDescription: { value: title }
            }
          }]
        }
      }
    }
  };
}

function verdict(mode: string, selected: string | null, reason: string): GateOutcome["verdict"] {
  return {
    mode: mode as GateOutcome["verdict"]["mode"],
    considered: 1,
    selected,
    reason,
    candidates: [],
    skipped: [],
    costUsd: 0.002
  };
}

/**
 * A gate that records every call and picks the file at `pick` in the shortlist it is shown.
 *
 * One call per rung now, not one per file, so `seen` is a list of calls and each entry carries
 * the whole shortlist that call judged. `pick: null` refuses everything, which is how a rotation
 * that is not answering today descends.
 */
function shortlistGate(
  pick: number | null,
  seen: Array<{ mode: string; titles: string[] }>
) {
  return async (input: AssessCandidatesInput): Promise<GateOutcome> => {
    seen.push({ mode: input.mode, titles: input.candidates.map((candidate) => candidate.title) });
    if (input.mode === "identity-advisory") {
      return { selected: null, verdict: verdict(input.mode, null, "advisory-only") };
    }
    const chosen = pick === null ? undefined : input.candidates[pick];
    return chosen
      ? { selected: chosen, verdict: verdict(input.mode, chosen.id, "Fine.") }
      : { selected: null, verdict: verdict(input.mode, null, "all-candidates-rejected") };
  };
}

function context() {
  return {
    venture: "mma-files" as const,
    stateRoot: "/nonexistent",
    cycleId: "cycle-test",
    budget: new ImageProgramBudget({ usd: 0, generatedImages: 0 }),
    article: { titleCs: "Titulek", dekCs: "Perex." },
    brief: null,
    seed: "oktagon:gustavo-lopez"
  };
}

function person(overrides: Partial<Parameters<typeof selectArticleHero>[0]> = {}) {
  return {
    ...context(),
    subjectRefs: ["oktagon:gustavo-lopez"],
    fallbackQuery: "gustavo lopez",
    personShaped: true,
    eventShaped: false,
    ...overrides
  };
}

const IDENTITY: LicensedPhotoCandidate = {
  id: "wikidata:Q104839627",
  provider: "wikimedia",
  title: "Gustavo Lopez fighter.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/g.jpg",
  downloadUrl: "https://upload.wikimedia.org/g.jpg",
  width: 1_200,
  height: 1_600,
  license: "CC BY-SA",
  author: "Uploader",
  sourceUrl: "https://commons.wikimedia.org/?curid=2",
  attributionHtml: "Uploader · CC BY-SA · Wikimedia Commons",
  identityOf: "Q104839627",
  altCs: "Fotografie, kterou Wikidata uvádí u osoby Gustavo Lopez."
};

describe("the gate on a curated rotation", () => {
  it("judges the whole shortlist in one call and may pick any of it", async () => {
    /*
     * The rung used to ask about one file at a time, so three looks were three calls carrying
     * three unrelated yes/no answers. The search rung has always batched — its own comment says
     * why, that the scores mean something against each other — and this rung does now too.
     */
    const seen: Array<{ mode: string; titles: string[] }> = [];
    const rotation = illustrativeRotation("oktagon:gustavo-lopez");
    const chosen = await selectArticleHero(person(), {
      sportPhoto: (options) => illustrativeSportPhoto({ ...options, fetchJson: async (url) => commons(url) }),
      gate: shortlistGate(1, seen)
    });

    // One call, holding the first three of the rotation.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.mode).toBe("curated");
    expect(seen[0]!.titles).toEqual(rotation.slice(0, CURATED_GATE_ATTEMPTS).map((photo) => photo.file));
    // And it may pick something other than the first, which is what comparing is for.
    expect(chosen.rung).toBe("curated");
    expect(chosen.candidate?.title).toBe(rotation[1]!.file);
    expect(chosen.verdicts.map((entry) => entry.reason)).toEqual(["Fine."]);
  });

  it("descends to the plate when the whole shortlist is refused", async () => {
    const seen: Array<{ mode: string; titles: string[] }> = [];
    const chosen = await selectArticleHero(person(), {
      sportPhoto: (options) => illustrativeSportPhoto({ ...options, fetchJson: async (url) => commons(url) }),
      gate: shortlistGate(null, seen)
    });

    expect(chosen.rung).toBe("plate");
    expect(chosen.candidate).toBeNull();
    // Still bounded, and still one call. Every candidate on a shortlist is a thumbnail the model
    // reads, so the shortlist stays at three even though the calls no longer multiply.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.titles).toHaveLength(CURATED_GATE_ATTEMPTS);
    expect(chosen.verdicts).toHaveLength(1);
  });

  it("gates the edition's curated scenes the same way", async () => {
    const seen: Array<{ mode: string; titles: string[] }> = [];
    const chosen = await selectEditionHero(
      { ...context(), venture: "caught-up", seed: "2026-08-08", subjectQuery: "data centre" },
      {
        scenePhoto: async ({ veto, choose }) => {
          const candidate: LicensedPhotoCandidate = {
            id: "scene:1",
            provider: "wikimedia",
            title: "CERN Server 03.jpg",
            thumbnailUrl: "https://upload.wikimedia.org/c.jpg",
            downloadUrl: "https://upload.wikimedia.org/c.jpg",
            width: 2_000,
            height: 1_200,
            license: "CC BY-SA",
            author: "CERN",
            sourceUrl: "https://commons.wikimedia.org/?curid=3",
            attributionHtml: "CERN · CC BY-SA · Wikimedia Commons",
            illustrative: true
          };
          if (await veto?.(candidate)) return null;
          return choose ? await choose([candidate]) : candidate;
        },
        search: async () => ({ candidates: [], skippedProviders: [] }),
        gate: shortlistGate(null, seen)
      }
    );

    expect(seen).toEqual([{ mode: "curated", titles: ["CERN Server 03.jpg"] }]);
    expect(chosen.rung).toBe("plate");
  });
});

describe("the gate on the identity rung", () => {
  it("records a verdict and changes nothing", async () => {
    // The honesty law. An entity-linked photograph is used or the ladder descends; it is never
    // swapped for something that scored better, because "scored better" is about how a picture
    // looks and this rung is about who is in it.
    const seen: Array<{ mode: string; titles: string[] }> = [];
    const chosen = await selectArticleHero(
      person({ identityPhoto: async () => IDENTITY }),
      {
        sportPhoto: async () => {
          throw new Error("rung two must not be reached");
        },
        gate: shortlistGate(null, seen)
      }
    );

    expect(seen).toEqual([{ mode: "identity-advisory", titles: [IDENTITY.title] }]);
    expect(chosen.rung).toBe("entity-linked");
    expect(chosen.candidate).toEqual(IDENTITY);
    // Its own alt text is untouched too: the gate never writes alt for a photograph of a person.
    expect(chosen.candidate?.altCs).toBe(IDENTITY.altCs);
    expect(chosen.verdicts.map((entry) => entry.mode)).toEqual(["identity-advisory"]);
  });

  it("keeps the identity photograph when the advisory call itself fails", async () => {
    const chosen = await selectArticleHero(
      person({ identityPhoto: async () => IDENTITY }),
      {
        gate: async () => {
          throw new Error("the gate is unreachable");
        }
      }
    );

    expect(chosen.candidate).toEqual(IDENTITY);
    expect(chosen.rung).toBe("entity-linked");
    expect(chosen.verdicts).toEqual([]);
  });
});
