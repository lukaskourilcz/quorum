import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EditorialSlateSchema } from "../src/contracts/mma-files.js";
import {
  MMA_SCENE_CONCEPT,
  VISUAL_CONCEPTS,
  checkVisualBrief,
  forbiddenNameTokens
} from "../src/images/visual-brief.js";
import { ILLUSTRATIVE_SCENES } from "../src/images/illustrative-scenes.js";
import {
  MMA_FILES_VISUAL_BRIEF_INSTRUCTION,
  MMA_FILES_WRITE_SYSTEM,
  subjectIsEventShaped
} from "../src/mma-files/live.js";
import { WRITE_SYSTEM, WRITE_TOOL_INPUT_SCHEMA } from "../src/edition/write.js";
import { produceMmaFilesArticle } from "../src/mma-files/pipeline.js";
import { loadStylebook } from "../src/mma-files/style.js";
import { repoRoot } from "../src/paths.js";

describe("the visual concept vocabulary", () => {
  it("is one closed list covering both desks' curated sets", () => {
    for (const concept of Object.keys(ILLUSTRATIVE_SCENES)) {
      expect(VISUAL_CONCEPTS).toContain(concept);
    }
    expect(VISUAL_CONCEPTS).toContain(MMA_SCENE_CONCEPT);
  });

  it("is the same list the DNESKAi writer is offered", () => {
    // The enum the provider reads and the list the validator checks against are the same array.
    // Two lists would drift, and a desk naming a concept nobody accepts loses the curated rung.
    expect(WRITE_TOOL_INPUT_SCHEMA.properties.visual_concept.enum).toEqual([...VISUAL_CONCEPTS]);
  });
});

describe("the brief validator", () => {
  const nameSources = ["oktagon:gustavo-lopez", "Valentina Shevchenko"];

  it("accepts phrases of concrete nouns", () => {
    const checked = checkVisualBrief({
      phrases: ["empty cage arena floor", "weigh in stage banner"],
      concept: MMA_SCENE_CONCEPT,
      negatives: ["recognisable faces"],
      nameSources
    });

    expect(checked.problems).toEqual([]);
    expect(checked.brief).toEqual({
      phrases: ["empty cage arena floor", "weigh in stage banner"],
      concept: MMA_SCENE_CONCEPT,
      negatives: ["recognisable faces"]
    });
  });

  it("drops the whole brief when one phrase smuggles the subject's name in", () => {
    // This is the failure the ladder exists to prevent. "Gustavo Lopez" belongs to a
    // bantamweight and to an Argentinian government official, and the archive cannot tell them
    // apart; the only safe answer is that a person's name never reaches a search.
    const checked = checkVisualBrief({
      phrases: ["gustavo lopez training gym", "empty cage arena floor"],
      concept: MMA_SCENE_CONCEPT,
      negatives: [],
      nameSources
    });

    expect(checked.brief).toBeNull();
    expect(checked.problems).toContain("phrase-names-subject:gustavo");
  });

  it("catches a name run together to slip past a word match", () => {
    const checked = checkVisualBrief({
      phrases: ["valentinashevchenko portrait", "empty cage arena floor"],
      concept: MMA_SCENE_CONCEPT,
      negatives: [],
      nameSources
    });

    expect(checked.brief).toBeNull();
    expect(checked.problems).toContain("phrase-names-subject:valentina");
  });

  it("catches a name whose diacritics were folded away", () => {
    const checked = checkVisualBrief({
      phrases: ["jiri prochazka gym", "empty cage arena floor"],
      concept: MMA_SCENE_CONCEPT,
      negatives: [],
      nameSources: ["Procházka"]
    });

    expect(checked.brief).toBeNull();
    expect(checked.problems).toContain("phrase-names-subject:prochazka");
  });

  it("refuses a Czech phrase, because the archives are indexed in English", () => {
    const checked = checkVisualBrief({
      phrases: ["prázdná klec ve sportovní hale", "empty cage arena floor"],
      concept: MMA_SCENE_CONCEPT,
      negatives: [],
      nameSources
    });

    expect(checked.brief).toBeNull();
    expect(checked.problems.some((problem) => problem.startsWith("phrase-not-ascii:"))).toBe(true);
  });

  it("refuses a phrase an archive would return nothing for", () => {
    const checked = checkVisualBrief({
      phrases: [
        "an empty cage in a sports hall before the doors open",
        "empty cage arena floor"
      ],
      concept: MMA_SCENE_CONCEPT,
      negatives: [],
      nameSources
    });

    expect(checked.brief).toBeNull();
    expect(checked.problems).toContain("phrase-length:11");
  });

  it("refuses a single phrase and refuses none at all", () => {
    expect(checkVisualBrief({
      phrases: ["empty cage arena floor"],
      concept: MMA_SCENE_CONCEPT,
      negatives: [],
      nameSources
    }).brief).toBeNull();
    expect(checkVisualBrief({
      phrases: [],
      concept: MMA_SCENE_CONCEPT,
      negatives: [],
      nameSources
    }).brief).toBeNull();
  });

  it("keeps the phrases when only the concept is unrecognised", () => {
    // A concept is a hint about which curated set to try first. A wrong hint costs a rung; it is
    // not a reason to throw away phrases that passed every check that matters.
    const checked = checkVisualBrief({
      phrases: ["empty cage arena floor", "weigh in stage banner"],
      concept: "octagon vibes",
      negatives: [],
      nameSources
    });

    expect(checked.brief?.concept).toBeNull();
    expect(checked.brief?.phrases).toHaveLength(2);
    expect(checked.problems).toContain("concept-unknown:octagon vibes");
  });

  it("ignores fragments too short to identify anybody", () => {
    // "ufc" and "vs" are in every ref and in half the useful English phrases.
    expect(forbiddenNameTokens(["ufc:event:ufc-330-makhachev-vs-garry"]))
      .toEqual(expect.arrayContaining(["event", "makhachev", "garry"]));
    expect(forbiddenNameTokens(["ufc:event:ufc-330-makhachev-vs-garry"])).not.toContain("ufc");
    expect(forbiddenNameTokens(["ufc:event:ufc-330-makhachev-vs-garry"])).not.toContain("vs");
  });
});

describe("what each desk is asked for", () => {
  it("asks the DNESKAi writer for phrases and forbids names in them", () => {
    expect(WRITE_SYSTEM).toContain("image_search_phrases");
    expect(WRITE_SYSTEM).toContain("Never write a person's");
    expect(WRITE_TOOL_INPUT_SCHEMA.properties.image_search_phrases.maxItems).toBe(3);
    expect(WRITE_TOOL_INPUT_SCHEMA.properties.image_negatives.maxItems).toBe(5);
    // Optional at the boundary: a model that omits the brief must not throw away a paid write.
    expect(WRITE_TOOL_INPUT_SCHEMA.required).not.toContain("image_search_phrases");
  });

  it("asks the MMA writer only when the subject is an event", () => {
    expect(subjectIsEventShaped(["ufc:event:ufc-330-makhachev-vs-garry"])).toBe(true);
    expect(subjectIsEventShaped(["oktagon:gustavo-lopez"])).toBe(false);
    expect(subjectIsEventShaped(["missing:2026-08-08:pm"])).toBe(false);
    // A profile's writer is never asked, because a profile never reaches a search.
    expect(MMA_FILES_WRITE_SYSTEM).not.toContain("imageSearchPhrases");
    expect(MMA_FILES_VISUAL_BRIEF_INSTRUCTION).toContain("imageSearchPhrases");
  });
});

const slate = EditorialSlateSchema.parse({
  schemaVersion: "editorial-slate/1",
  date: "2026-08-08",
  slots: [
    {
      slot: "am",
      format: "fight-week-preview",
      subjectRefs: ["ufc:event:ufc-330-makhachev-vs-garry"],
      rationale: "The event card is sourced and complete enough for a preview.",
      assignedWriter: "JAB",
      status: "assigned"
    },
    {
      slot: "pm",
      format: "desk-notes",
      subjectRefs: ["missing:2026-08-08:pm"],
      rationale: "No further source-backed subject is on file for this slot.",
      assignedWriter: "QUILL",
      status: "killed",
      killedReason: "No source-backed subject left on file."
    }
  ],
  vaultVerdicts: [
    { subjectRef: "ufc:event:ufc-330-makhachev-vs-garry", verdict: "fresh", evidenceRef: "FIXTURE:visual-brief#1" },
    { subjectRef: "missing:2026-08-08:pm", verdict: "repeat", evidenceRef: "state/mma/fighters" }
  ]
});

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function produce(draft: Record<string, unknown>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "visual-brief-"));
  roots.push(root);
  return produceMmaFilesArticle({
    root,
    slate,
    slot: "am",
    slug: "ufc-330-preview",
    publishAt: new Date("2026-08-08T06:00:00.000Z"),
    mode: "data-only",
    evidence: {
      sources: [{ kind: "internal", ref: "state/mma/events/ufc:event:ufc-330-makhachev-vs-garry.json" }],
      fighterRefs: ["ufc:islam-makhachev"],
      eventRef: "ufc:event:ufc-330-makhachev-vs-garry",
      heroSpec: { template: "event-card", bindings: { headline: "UFC 330" } },
      evidenceText: "Fixture-only evidence packet."
    },
    gateway: {
      writeCzech: async () => ({
        title: "Co čekat od nadcházejícího turnaje",
        dek: "Redakční poznámka k programu turnaje.",
        bodyMDX: "Karta zápasníka: [karta](/fighters/ufc/islam-makhachev)",
        imageAlt: "Ilustrační fotografie k turnaji.",
        ...draft
      })
    },
    stylebookRaw: await loadStylebook(repoRoot)
  });
}

describe("the brief through the MMA pipeline", () => {
  it("survives the write call and reaches the caller", async () => {
    const result = await produce({
      imageSearchPhrases: ["empty cage arena floor", "weigh in stage banner"],
      visualConcept: MMA_SCENE_CONCEPT,
      imageNegatives: ["recognisable faces"]
    });

    expect(result.visualBrief).toEqual({
      phrases: ["empty cage arena floor", "weigh in stage banner"],
      concept: MMA_SCENE_CONCEPT,
      negatives: ["recognisable faces"]
    });
    // None of it reaches the reader's copy or the package hash.
    expect(JSON.stringify(result.article.localizations.cs)).not.toContain("empty cage");
  });

  it("is dropped, without a retry, when it names the event", async () => {
    const result = await produce({
      imageSearchPhrases: ["makhachev walkout tunnel", "empty cage arena floor"],
      visualConcept: MMA_SCENE_CONCEPT,
      imageNegatives: []
    });

    expect(result.visualBrief).toBeUndefined();
    // The article is unaffected: a bad brief costs the picture desk a hint, nothing else.
    expect(result.article.status).toBe("published");
  });

  it("is simply absent when the desk wrote none", async () => {
    const result = await produce({});
    expect(result.visualBrief).toBeUndefined();
    expect(result.article.status).toBe("published");
  });
});
