import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configRoot } from "../src/paths.js";
import { GoViralTrendsSchema, type GoViralTrends } from "../src/sources/goviral-trends.js";
import { atomicWriteJson } from "../src/state.js";
import { loadMarketingSharkConfig } from "../src/ventures/marketingshark/config.js";
import { NormalizedQuestionSchema } from "../src/ventures/marketingshark/bank.js";
import { buildChumPacket } from "../src/ventures/marketingshark/packet.js";
import { BRAND_TREND_TAGS, brandTrendLines, readBrandTrendLines } from "../src/ventures/marketingshark/trends.js";

// quorum#562: GoVIRAL collected devShark signals that the room marketing devShark could not read.

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function snapshot(date: string): GoViralTrends {
  const tag = (hashtag: string, topicSet: string, weekOverWeekDelta: number | null) =>
    ({ hashtag, topicSet, posts: 4, engagementPerHour: 12.5, weekOverWeekDelta });
  return GoViralTrendsSchema.parse({
    schemaVersion: "goviral-trends/1",
    date,
    generatedAt: `${date}T09:00:00.000Z`,
    sourceResults: [],
    freeSignals: [],
    items: [],
    signals: {
      topHashtags: [
        tag("#javascript", "devshark", 3.2),
        tag("#ai", "dneskai", 8),
        tag("#react", "devshark", -1),
        tag("#typescript", "devshark", null),
        tag("#css", "devshark", 0),
        tag("#webdev", "devshark", 1),
        tag("#node", "devshark", 1)
      ],
      topFormats: [],
      topAudio: [],
      exploreSections: [],
      perTopicSet: []
    },
    forMagazines: { ai: [], mma: [] }
  });
}

describe("marketingShark's GoVIRAL signals", () => {
  it("keeps the brand's own tags, at most five, with a direction word and no figure", () => {
    const lines = brandTrendLines(snapshot("2026-09-21"), "devshark", "2026-09-25");
    expect(lines).toHaveLength(BRAND_TREND_TAGS);
    expect(lines[0]).toBe("#javascript (rising on last week)");
    expect(lines).toContain("#react (cooling on last week)");
    expect(lines).toContain("#typescript (new this week)");
    expect(lines.join(" ")).not.toContain("#ai");
    expect(lines.join(" ")).not.toMatch(/\d/u);
  });

  it("lets the intelligence expire rather than linger as advice", () => {
    expect(brandTrendLines(snapshot("2026-09-01"), "devshark", "2026-09-25")).toEqual([]);
    expect(brandTrendLines(null, "devshark", "2026-09-25")).toEqual([]);
  });

  it("reads through the registered edge and says nothing when there is no snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ms-trends-"));
    roots.push(root);
    await expect(readBrandTrendLines({ stateRoot: root, configRoot, brandId: "devshark", date: "2026-09-25" }))
      .resolves.toEqual([]);
    await atomicWriteJson(root, "goviral/trends/2026-09-21.json", snapshot("2026-09-21"));
    await expect(readBrandTrendLines({ stateRoot: root, configRoot, brandId: "devshark", date: "2026-09-25" }))
      .resolves.toHaveLength(BRAND_TREND_TAGS);
    const absent = await mkdtemp(path.join(os.tmpdir(), "ms-trends-map-"));
    roots.push(absent);
    // No readable capability map means no read at all, never an unrouted one.
    await expect(readBrandTrendLines({ stateRoot: root, configRoot: absent, brandId: "devshark", date: "2026-09-25" }))
      .resolves.toEqual([]);
  });

  it("puts the tags in CHUM's packet as signals, and leaves the section out when there are none", async () => {
    const brand = (await loadMarketingSharkConfig()).brands.find((candidate) => candidate.id === "devshark")!;
    const question = NormalizedQuestionSchema.parse({
      id: "q-trends",
      category: "react",
      difficulty: 2,
      importance: 7,
      hasCode: false,
      correctIndex: 1,
      en: {
        introduction: "",
        question: "What does useState return?",
        options: ["A single value", "An array with the current value and a setter", "An object", "A promise"],
        explanation: "useState returns an array with the current value and a setter."
      },
      cs: { question: "Co vrací useState?", options: ["Jednu hodnotu", "Pole s aktuální hodnotou a setterem", "Objekt", "Promise"] }
    });
    const base = { brand, question, hookLines: null, hookId: null, date: "2026-09-25" };
    const withTags = buildChumPacket({ ...base, trendLines: ["#javascript (rising on last week)"] });
    expect(withTags).toContain("measured hashtags for devShark (GoVIRAL, expiring)");
    expect(withTags).toContain("- #javascript (rising on last week)");
    expect(withTags).toContain("They are signals, not copy");
    expect(buildChumPacket({ ...base, trendLines: [] })).not.toContain("measured hashtags");
    expect(buildChumPacket(base)).not.toContain("measured hashtags");
  });
});
