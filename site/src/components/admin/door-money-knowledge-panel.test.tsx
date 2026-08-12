import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DOOR_MONEY_SCORE_AXES, type DoorMoneyScore } from "@/lib/door-money-recommendation-model";
import type { AdminDoorMoneyKnowledge } from "@/lib/admin-door-money";
import type { AdminDoorMoneyChunk } from "@/lib/door-money-knowledge-model";
import { DoorMoneyKnowledgePanel } from "./door-money-knowledge-panel";

const scores = Object.fromEntries(DOOR_MONEY_SCORE_AXES.map((axis, index) => [axis, {
  score: index % 6,
  justification: `Synthetic ${axis} score explanation.`
}])) as Record<(typeof DOOR_MONEY_SCORE_AXES)[number], DoorMoneyScore>;

const chunk: AdminDoorMoneyChunk = {
  id: "ch01-s01-c001",
  chapterId: "ch01",
  sceneId: "ch01-s01",
  ordinal: 1,
  arc: "fictional-radio-route",
  summary: "A fictional courier returns a prop radio after an invented rehearsal.",
  entities: [],
  themes: ["community-memory"],
  era: "fictional-tour-years",
  storyType: "lesson",
  quotables: ["The synthetic radio kept its imaginary appointment."],
  scores,
  usageHistory: [{ recommendationId: "fixture-radio-carousel", recommendedOn: "2026-08-11", format: "carousel" }]
};

const present: AdminDoorMoneyKnowledge = {
  state: "present",
  unreadable: 0,
  index: {
    manuscriptHash: `sha256:${"a".repeat(64)}`,
    ingestionId: "fixture-ingestion",
    modelVersions: { annotation: "fixture-annotation-v1", rollup: "fixture-rollup-v1", embedding: "fixture-embedding-v1" },
    ingestionCostUsd: 0,
    chunkCount: 1,
    chapters: [{ id: "ch01", ordinal: 1, summary: "An invented chapter about a prop radio.", chunkIds: [chunk.id] }],
    chunks: [chunk],
    generatedAt: "2026-08-12T10:00:00.000Z"
  },
  styleProfile: {
    profileVersion: 1,
    manuscriptHash: `sha256:${"a".repeat(64)}`,
    fingerprintHash: `sha256:${"b".repeat(64)}`,
    modelVersions: { chapterMap: "fixture-map-v1", synthesis: "fixture-synthesis-v1", embedding: "fixture-embedding-v1" },
    chapterNoteCount: 1,
    sentenceRhythm: {
      sampledSentences: 12, meanWordsPerSentence: 10, p10WordsPerSentence: 4, medianWordsPerSentence: 9,
      p90WordsPerSentence: 19, fragmentRatio: 0.1, oneSentenceParagraphRatio: 0.2,
      notes: ["Synthetic setups use one longer sentence before a short landing."]
    },
    vocabulary: {
      recurringWords: [{ value: "radio", occurrences: 3, note: "A synthetic prop, not source text." }],
      recurringPhrases: [],
      profanity: { level: "none", terms: [], note: "No profanity appears in this fixture." }
    },
    humorMechanics: [{ name: "prop-understatement", description: "An invented prop lands the joke.", signals: ["plain clause"] }],
    storytelling: {
      openings: [{ name: "object-first", description: "The fictional prop appears first." }],
      turns: [{ name: "route-reframed", description: "The invented errand changes purpose." }],
      landings: [{ name: "quiet-return", description: "The prop returns without a slogan." }],
      firstPersonHabits: ["The synthetic narrator admits a small mistake."],
      tenseUsage: [{ tense: "past", ratio: 1, note: "The fixture stays in past tense." }]
    },
    negativeSpace: ["Does not manufacture a universal lesson."],
    formatAdaptations: [{
      format: "carousel",
      preserve: ["Keep the invented prop."],
      adapt: ["Split the synthetic route into steps."],
      avoid: ["Do not add a slogan."]
    }],
    exemplars: [{
      id: "fixture-exemplar", chunkId: chunk.id, text: "x".repeat(300), formats: ["carousel"], tags: ["synthetic"]
    }],
    generatedAt: "2026-08-12T10:10:00.000Z"
  }
};

describe("Door Money knowledge panel", () => {
  it("renders recorded ingestion, public derivatives, score labels, usage and style sections", () => {
    const html = renderToStaticMarkup(<DoorMoneyKnowledgePanel knowledge={present} />);

    expect(html).toContain("Ingestion status");
    expect(html).toContain(`sha256:${"a".repeat(64)}`);
    expect(html).toContain("fixture-annotation-v1");
    expect(html).toContain("Chapters and passages");
    expect((html.match(/role="meter"/gu) ?? []).length).toBe(15);
    expect(html).toContain("Synthetic entertainment score explanation.");
    expect(html).toContain("0 / 5");
    expect(html).toContain("door-money-recommendation-fixture-radio-carousel");
    expect(html).toContain("Sentence rhythm");
    expect(html).toContain("Format adaptations");
    expect(html).toContain("Capped exemplars");
    expect(html).toContain("x".repeat(280));
    expect(html).not.toContain("x".repeat(281));
    expect(html).not.toContain("<button");
    expect(html).not.toContain("data-horizontal-scroll");
  });

  it("names missing and unreadable knowledge without inventing a partial view", () => {
    const missing = renderToStaticMarkup(<DoorMoneyKnowledgePanel knowledge={{ state: "missing", index: null, styleProfile: null, unreadable: 0 }} />);
    const unreadable = renderToStaticMarkup(<DoorMoneyKnowledgePanel knowledge={{ state: "unreadable", index: null, styleProfile: null, unreadable: 2 }} />);

    expect(missing).toContain("No Door Money knowledge version exists yet.");
    expect(unreadable).toContain("could not be read");
    expect(unreadable).toContain("No partial or replacement record is shown.");
  });
});
