import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LicensedPhotoCandidate } from "../src/images/licensed.js";

const searchCalls: string[] = [];
const identityCalls: string[] = [];
const illustrativeSeeds: string[] = [];
let identityPhoto: LicensedPhotoCandidate | null = null;
const gateCalls: Array<{ mode: string; ids: string[] }> = [];
/** Whether the gate approves what it is shown. Off by default: nothing is approved unseen. */
let gateSelects = false;

const ILLUSTRATIVE: LicensedPhotoCandidate = {
  id: "illustrative:39226871",
  provider: "wikimedia",
  title: "GMC Octagon.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/gmc.jpg",
  downloadUrl: "https://upload.wikimedia.org/gmc.jpg",
  width: 2_519,
  height: 1_551,
  license: "CC BY-SA",
  author: "GMC-MMA",
  sourceUrl: "https://commons.wikimedia.org/?curid=39226871",
  attributionHtml: "GMC-MMA · CC BY-SA · Wikimedia Commons",
  illustrative: true,
  altCs: "Ilustrační fotografie ze zápasů MMA: prázdná klec ve sportovní hale před začátkem galavečera. Nejde o snímek osoby, o níž článek pojednává."
};

const SEARCH_RESULT: LicensedPhotoCandidate = {
  id: "wikimedia:1",
  provider: "wikimedia",
  title: "678 - Gustavo Lopez",
  thumbnailUrl: "https://upload.wikimedia.org/a.jpg",
  downloadUrl: "https://upload.wikimedia.org/a.jpg",
  width: 1_600,
  height: 900,
  license: "CC BY-SA",
  author: "Uploader",
  sourceUrl: "https://commons.wikimedia.org/?curid=1",
  attributionHtml: "Uploader · CC BY-SA · Wikimedia Commons"
};

vi.mock("../src/images/licensed.js", async () => {
  const actual = await vi.importActual<typeof import("../src/images/licensed.js")>("../src/images/licensed.js");
  return {
    ...actual,
    discoverLicensedPhotos: async ({ queries, query }: { queries?: readonly string[]; query?: string }) => {
      searchCalls.push(...(queries ?? []), ...(query ? [query] : []));
      return { candidates: [SEARCH_RESULT], skippedProviders: [] };
    }
  };
});

/** Records what the gate was asked and answers with whatever the test has armed. */
vi.mock("../src/images/vision-gate.js", async () => {
  const actual = await vi.importActual<typeof import("../src/images/vision-gate.js")>("../src/images/vision-gate.js");
  return {
    ...actual,
    assessCandidates: async (input: {
      candidates: LicensedPhotoCandidate[];
      mode: string;
    }) => {
      gateCalls.push({ mode: input.mode, ids: input.candidates.map((candidate) => candidate.id) });
      const selected = gateSelects ? input.candidates[0] ?? null : null;
      return {
        selected,
        verdict: {
          mode: input.mode,
          considered: input.candidates.length,
          selected: selected?.id ?? null,
          reason: selected ? "Looks right." : "all-candidates-rejected",
          candidates: [],
          skipped: [],
          costUsd: 0.003
        }
      };
    }
  };
});

vi.mock("../src/images/fighter-photo.js", async () => {
  const actual = await vi.importActual<typeof import("../src/images/fighter-photo.js")>("../src/images/fighter-photo.js");
  return {
    ...actual,
    fighterIdentityPhoto: async ({ wikidataId }: { wikidataId: string }) => {
      identityCalls.push(wikidataId);
      // Null by default: Q104839627 is the OKTAGON fighter's real item and carries no P18, so
      // that is what the live lookup returns for him. One test sets a photograph to check that
      // rung one, when it answers, is not overtaken by rung two.
      return identityPhoto;
    }
  };
});

vi.mock("../src/images/illustrative.js", async () => {
  const actual = await vi.importActual<typeof import("../src/images/illustrative.js")>("../src/images/illustrative.js");
  return {
    ...actual,
    illustrativeSportPhoto: async ({ seed }: { seed: string }) => {
      illustrativeSeeds.push(seed);
      return ILLUSTRATIVE;
    }
  };
});

const { selectArticleImage } = await import("../src/mma-files/live.js");
const { ImageProgramBudget } = await import("../src/images/budget.js");
const { repoRoot } = await import("../src/paths.js");

/** The router under test, with the parts a caller owns filled in. */
async function route(
  root: string,
  subjectRefs: readonly string[],
  brief: { phrases: string[]; concept: string | null; negatives: string[] } | null = null
) {
  return selectArticleImage({
    root,
    subjectRefs,
    stateRoot: root,
    cycleId: "cycle-test",
    budget: new ImageProgramBudget({ usd: 0, generatedImages: 0 }),
    brief,
    article: { titleCs: "Titulek", dekCs: "Perex." }
  });
}

const roots: string[] = [];
afterEach(async () => {
  searchCalls.length = 0;
  identityCalls.length = 0;
  illustrativeSeeds.length = 0;
  identityPhoto = null;
  gateCalls.length = 0;
  gateSelects = false;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** The real card, copied, so the identity the router reads is the one on disk. */
async function plantGustavoLopez(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mma-image-routing-"));
  roots.push(root);
  const raw = await readFile(path.join(repoRoot, "state", "mma", "fighters", "oktagon:gustavo-lopez.json"), "utf8");
  await mkdir(path.join(root, "mma", "fighters"), { recursive: true });
  await writeFile(path.join(root, "mma", "fighters", "oktagon:gustavo-lopez.json"), raw);
  return root;
}

describe("choosing how to find a picture for an article", () => {
  it("resolves a fighter through their Wikidata item and never searches on their name", async () => {
    // The 4 August article did search on the name, and "678 - Gustavo Lopez.jpg" — an Argentinian
    // subsecretario de Presidencia — passed every caption filter there was and ranked first.
    const root = await plantGustavoLopez();
    const chosen = await route(root, ["oktagon:gustavo-lopez"]);
    expect(identityCalls).toEqual(["Q104839627"]);
    expect(searchCalls).toEqual([]);
    // Q104839627 names no image, so rung one is empty and the ladder descends to rung two rather
    // than to the drawn plate — the owner's decision of 4 August. Nothing about him goes to
    // Commons: the seed picks a curated file and is never a query.
    expect(chosen.candidate).toEqual(ILLUSTRATIVE);
    expect(chosen.rung).toBe("curated");
    expect(illustrativeSeeds).toEqual(["oktagon:gustavo-lopez"]);
  });

  it("never reaches rung two when the fighter's own item names a photograph", async () => {
    // Certainty first, always. An illustrative photograph is honest and it is still not a picture
    // of the subject, so it must not displace one that provably is.
    identityPhoto = {
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
      identityOf: "Q104839627"
    };
    const root = await plantGustavoLopez();
    const chosen = await route(root, ["oktagon:gustavo-lopez"]);
    expect(chosen.candidate).toEqual(identityPhoto);
    expect(chosen.rung).toBe("entity-linked");
    expect(illustrativeSeeds).toEqual([]);
  });

  it("searches the desk's phrases for an event, and never the event's name", async () => {
    // A fight-week preview is assigned an event ref, and an event has no identity to confuse. The
    // phrases the desk wrote are what the archive is asked; the event's own name is forbidden in
    // them, so `candidatesNaming` does not apply and the gate decides instead.
    const root = await plantGustavoLopez();
    gateSelects = true;
    const chosen = await route(root, ["ufc:event:ufc-330-makhachev-vs-machado-garry"], {
      phrases: ["empty cage arena floor", "weigh in stage banner"],
      concept: "mixed martial arts arena",
      negatives: []
    });
    expect(identityCalls).toEqual([]);
    expect(searchCalls).toEqual(["empty cage arena floor", "weigh in stage banner"]);
    expect(gateCalls).toEqual([{ mode: "search", ids: ["wikimedia:1"] }]);
    expect(chosen.rung).toBe("search");
    expect(chosen.candidate).toEqual(SEARCH_RESULT);
    expect(chosen.verdicts).toHaveLength(1);
  });

  it("descends to the curated rung when the gate refuses everything the search found", async () => {
    // The whole point of the gate. A candidate nobody has looked at used to become the hero; now
    // a refused shortlist costs the search rung and the article takes a photograph of the sport.
    const root = await plantGustavoLopez();
    const chosen = await route(root, ["ufc:event:ufc-330-makhachev-vs-machado-garry"], {
      phrases: ["empty cage arena floor", "weigh in stage banner"],
      concept: "mixed martial arts arena",
      negatives: []
    });
    expect(gateCalls).toHaveLength(1);
    expect(chosen.rung).toBe("curated");
    expect(chosen.candidate).toEqual(ILLUSTRATIVE);
    expect(chosen.verdicts[0]?.reason).toBe("all-candidates-rejected");
    expect(illustrativeSeeds).toEqual(["ufc:event:ufc-330-makhachev-vs-machado-garry"]);
  });

  it("falls back to the event's own name when the desk wrote no usable brief", async () => {
    // The ref-derived query is the path IMG-01 left in place, and `candidatesNaming` still
    // narrows it: a caption that does not carry the event's name is not a photograph of it.
    const root = await plantGustavoLopez();
    gateSelects = true;
    const chosen = await route(root, ["ufc:event:ufc-330-makhachev-vs-machado-garry"]);
    expect(searchCalls).toEqual(["ufc 330 makhachev vs machado garry"]);
    // The recorded candidate does not name the event, so `candidatesNaming` drops it before the
    // gate is asked, and the article takes the curated rung rather than the plate.
    expect(gateCalls).toEqual([]);
    expect(chosen.rung).toBe("curated");
    expect(illustrativeSeeds).toEqual(["ufc:event:ufc-330-makhachev-vs-machado-garry"]);
  });

  it("searches nothing at all for a killed slot's placeholder ref", async () => {
    // `missing:2026-08-04:am` ends in the slot letter, so an unfiltered ref sent four HTTP
    // providers looking for photographs of "am".
    const root = await plantGustavoLopez();
    const chosen = await route(root, ["missing:2026-08-04:am"]);
    expect(chosen.candidate).toBeNull();
    expect(chosen.rung).toBe("plate");
    expect(identityCalls).toEqual([]);
    expect(searchCalls).toEqual([]);
    // Not even rung two. A killed slot has no subject, so it is not an MMA article that wants an
    // MMA photograph; it is a slot that published nothing.
    expect(illustrativeSeeds).toEqual([]);
  });

  it("gives a fighter we hold no card for an illustrative photograph, not a search on their name", async () => {
    // The routing used to ask whether a card with this exact id was on disk, which is a question
    // about this repository and not about the subject. `state/mma/bouts` names 874 distinct
    // fighters against 92 cards, so 791 of them missed and fell through to the name search.
    // `oktagon:alexander-gladkov` is one of them — named in three bout records, no card — and
    // against the live services on 4 August 2026 the old routing returned "Gladkov Alexander.jpg"
    // top-ranked, a Russian operetta singer, because `captionResidual` prefers a caption that is
    // almost purely the name.
    const root = await plantGustavoLopez();
    // Rung one is impossible without a card, so the ladder skips it: no lookup is even attempted.
    expect((await route(root, ["oktagon:alexander-gladkov"])).candidate).toEqual(ILLUSTRATIVE);
    expect(identityCalls).toEqual([]);
    expect(searchCalls).toEqual([]);
    expect(illustrativeSeeds).toEqual(["oktagon:alexander-gladkov"]);
  });

  it("gives a misspelt fighter ref an illustrative photograph too", async () => {
    // A slate ref is a model-written string that reaches the router after a bare schema parse,
    // and the schema types it as any string. `ufc:gustavo-lopez` is one character off the real
    // card id `oktagon:gustavo-lopez`; under the old routing it missed the card and brought back
    // the Argentinian subsecretario, which is the exact defect with a typo in front of it. The
    // org prefix is wrong and the ref still denotes a person, so there is no photograph of them.
    const root = await plantGustavoLopez();
    expect((await route(root, ["ufc:gustavo-lopez"])).candidate).toEqual(ILLUSTRATIVE);
    expect(identityCalls).toEqual([]);
    expect(searchCalls).toEqual([]);
    expect(illustrativeSeeds).toEqual(["ufc:gustavo-lopez"]);
  });

  it("searches nothing for a ref of no recognised shape", async () => {
    // Neither `org:slug` nor `org:event:slug`. An unclassifiable ref is not evidence that the
    // subject is not a person, so it gets the FRAME cover rather than the benefit of the doubt —
    // and it is not evidence the article is about MMA either, so not the illustrative rung.
    const chosen = await route(await plantGustavoLopez(), ["fresh-subject"]);
    expect(chosen.candidate).toBeNull();
    expect(chosen.rung).toBe("plate");
    expect(identityCalls).toEqual([]);
    expect(searchCalls).toEqual([]);
    expect(illustrativeSeeds).toEqual([]);
  });

  it("routes a slot naming both an event and a fighter through the fighter", async () => {
    // One person named anywhere in the slot puts an identity at stake, and no search protects it.
    // The event ref does not license a search over the pair, brief or no brief.
    const root = await plantGustavoLopez();
    const chosen = await route(root, [
      "ufc:event:ufc-330-makhachev-vs-machado-garry",
      "oktagon:gustavo-lopez"
    ], { phrases: ["empty cage arena floor", "weigh in stage banner"], concept: null, negatives: [] });
    expect(identityCalls).toEqual(["Q104839627"]);
    expect(searchCalls).toEqual([]);
    expect(gateCalls).toEqual([]);
    expect(chosen.candidate).toEqual(ILLUSTRATIVE);
  });
});
