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

/** A gate that refuses the first `refusals` files it is shown and approves everything after. */
function refusingGate(refusals: number, seen: Array<{ mode: string; title: string }>) {
  let refused = 0;
  return async (input: AssessCandidatesInput): Promise<GateOutcome> => {
    const candidate = input.candidates[0]!;
    seen.push({ mode: input.mode, title: candidate.title });
    if (input.mode === "identity-advisory") {
      return { selected: null, verdict: verdict(input.mode, null, "advisory-only") };
    }
    if (refused < refusals) {
      refused += 1;
      return { selected: null, verdict: verdict(input.mode, null, "all-candidates-rejected") };
    }
    return { selected: candidate, verdict: verdict(input.mode, candidate.id, "Fine.") };
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
  it("moves to the next file when the one it was shown is refused", async () => {
    // A curated file was reviewed once, by a person, at 640px. Commons files get relicensed,
    // replaced and re-cropped after that, and this is how the ladder notices.
    const seen: Array<{ mode: string; title: string }> = [];
    const rotation = illustrativeRotation("oktagon:gustavo-lopez");
    const chosen = await selectArticleHero(person(), {
      sportPhoto: (options) => illustrativeSportPhoto({ ...options, fetchJson: async (url) => commons(url) }),
      gate: refusingGate(1, seen)
    });

    expect(seen.map((entry) => entry.title)).toEqual([rotation[0]!.file, rotation[1]!.file]);
    expect(seen.every((entry) => entry.mode === "curated")).toBe(true);
    expect(chosen.rung).toBe("curated");
    expect(chosen.candidate?.title).toBe(rotation[1]!.file);
    // Both looks are on the record, the refusal included.
    expect(chosen.verdicts.map((entry) => entry.reason))
      .toEqual(["all-candidates-rejected", "Fine."]);
  });

  it("descends to the plate when the rotation keeps being refused", async () => {
    const seen: Array<{ mode: string; title: string }> = [];
    const chosen = await selectArticleHero(person(), {
      sportPhoto: (options) => illustrativeSportPhoto({ ...options, fetchJson: async (url) => commons(url) }),
      gate: refusingGate(Number.MAX_SAFE_INTEGER, seen)
    });

    expect(chosen.rung).toBe("plate");
    expect(chosen.candidate).toBeNull();
    // Bounded on purpose. The rotation holds nine files at a gate call each, against a two-cent
    // article cap; spending all of it here would leave nothing for the rung that needs the gate
    // most, where nobody has reviewed anything.
    expect(seen).toHaveLength(CURATED_GATE_ATTEMPTS);
    expect(chosen.verdicts).toHaveLength(CURATED_GATE_ATTEMPTS);
  });

  it("gates the edition's curated scenes the same way", async () => {
    const seen: Array<{ mode: string; title: string }> = [];
    const chosen = await selectEditionHero(
      { ...context(), venture: "caught-up", seed: "2026-08-08", subjectQuery: "data centre" },
      {
        scenePhoto: async ({ accept }) => {
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
          return (await accept?.(candidate)) === false ? null : candidate;
        },
        search: async () => ({ candidates: [], skippedProviders: [] }),
        gate: refusingGate(Number.MAX_SAFE_INTEGER, seen)
      }
    );

    expect(seen).toEqual([{ mode: "curated", title: "CERN Server 03.jpg" }]);
    expect(chosen.rung).toBe("plate");
  });
});

describe("the gate on the identity rung", () => {
  it("records a verdict and changes nothing", async () => {
    // The honesty law. An entity-linked photograph is used or the ladder descends; it is never
    // swapped for something that scored better, because "scored better" is about how a picture
    // looks and this rung is about who is in it.
    const seen: Array<{ mode: string; title: string }> = [];
    const chosen = await selectArticleHero(
      person({ identityPhoto: async () => IDENTITY }),
      {
        sportPhoto: async () => {
          throw new Error("rung two must not be reached");
        },
        gate: refusingGate(Number.MAX_SAFE_INTEGER, seen)
      }
    );

    expect(seen).toEqual([{ mode: "identity-advisory", title: IDENTITY.title }]);
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
