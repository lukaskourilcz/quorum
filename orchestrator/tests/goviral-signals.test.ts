import { describe, expect, it } from "vitest";
import {
  annotateFreeSignals,
  breadthOf,
  buildBreadthIndex,
  normaliseTopic,
  signalLabel,
  signalPhrase,
  signalStatus
} from "../src/sources/goviral-signals.js";
import {
  GoViralTrendsSchema,
  buildForMagazines,
  computeHashtagSignals,
  type TrendItem
} from "../src/sources/goviral-trends.js";

const now = new Date("2026-09-14T12:00:00.000Z");

function item(overrides: Partial<TrendItem> = {}): TrendItem {
  return {
    platform: "instagram",
    kind: "reel",
    topicSet: "dneskai",
    text: "A clip",
    likes: 100,
    comments: 0,
    reshares: 0,
    postedAt: "2026-09-14T10:00:00.000Z",
    url: "https://example.test/p/1",
    hashtags: ["#aitools"],
    audioTitle: null,
    audioArtist: null,
    exploreSection: null,
    ...overrides
  };
}

const hnReading = (topic: string, value: number) => ({
  provider: "hn" as const,
  status: "success" as const,
  reason: null,
  signals: [{ kind: "velocity" as const, topic, value, topicSets: [], ref: "source:trending:hn:2026-09-14" }]
});

describe("the signal vocabulary", () => {
  it("matches a hashtag to a free topic without the hash and without case", () => {
    expect(normaliseTopic("#AiTools")).toBe("aitools");
    expect(normaliseTopic("  AI  tools ")).toBe("ai tools");
  });

  it("calls a reading active until it falls, and lasted once it has", () => {
    expect(signalStatus(null)).toBe("active");
    expect(signalStatus(0)).toBe("active");
    expect(signalStatus(12.5)).toBe("active");
    expect(signalStatus(-0.1)).toBe("lasted");
  });

  it("labels nothing without a prior week, because null is not zero", () => {
    expect(signalLabel({ delta: null, doubled: false, breadth: 3 })).toBeNull();
    expect(signalLabel({ delta: -4, doubled: false, breadth: 3 })).toBe("peaked");
    expect(signalLabel({ delta: 4, doubled: false, breadth: 1 })).toBe("regular");
    expect(signalLabel({ delta: 0, doubled: true, breadth: 2 })).toBe("regular");
    // Either doubling or a second provider promotes a rise to exploding.
    expect(signalLabel({ delta: 4, doubled: true, breadth: 1 })).toBe("exploding");
    expect(signalLabel({ delta: 1, doubled: false, breadth: 2 })).toBe("exploding");
  });

  it("counts independent providers, and never fewer than the one that produced the reading", () => {
    const index = buildBreadthIndex({
      items: [item({ hashtags: ["#AITools"] }), item({ platform: "threads", hashtags: ["#aitools", "#other"] })],
      freeSignals: [hnReading("AI Tools", 3), hnReading("aitools", 9), { ...hnReading("aitools", 1), provider: "reddit", status: "failed" }]
    });
    // Instagram, Threads and Hacker News; the failed Reddit reading counts for nothing, and
    // "AI Tools" is a different topic from "aitools" — the match is case-insensitive, not fuzzy.
    expect(breadthOf(index, "#aitools")).toBe(3);
    expect(breadthOf(index, "other")).toBe(1);
    expect(breadthOf(index, "unseen")).toBe(1);
  });

  it("writes the phrase a brief line carries, leaving the label out when there is none", () => {
    expect(signalPhrase({ window: "7d", status: "active", breadth: 2, label: "exploding" })).toBe("active · 7d window · seen on 2 providers · exploding");
    expect(signalPhrase({ window: "24h", status: "lasted", breadth: 1, label: null })).toBe("lasted · 24h window · seen on 1 provider");
  });
});

describe("hashtag signals with the vocabulary on them", () => {
  it("has no label and is active in the first week, because there is nothing to compare against", () => {
    const [first] = computeHashtagSignals({ items: [item()], previous: [], now });
    expect(first).toMatchObject({ hashtag: "#aitools", window: "7d", status: "active", breadth: 1, label: null, weekOverWeekDelta: null });
  });

  it("calls a doubled reading exploding, a fallen one peaked and lasted, and a held one regular", () => {
    const previous = computeHashtagSignals({
      items: [item({ likes: 100 }), item({ hashtags: ["#ufc"], topicSet: "mma", likes: 100 }), item({ hashtags: ["#oktagon"], topicSet: "mma", likes: 100 })],
      previous: [],
      now
    });
    const next = computeHashtagSignals({
      items: [item({ likes: 250 }), item({ hashtags: ["#ufc"], topicSet: "mma", likes: 40 }), item({ hashtags: ["#oktagon"], topicSet: "mma", likes: 100 })],
      previous,
      now
    });
    const by = (hashtag: string) => next.find((signal) => signal.hashtag === hashtag);
    expect(by("#aitools")).toMatchObject({ status: "active", label: "exploding" });
    expect(by("#ufc")).toMatchObject({ status: "lasted", label: "peaked" });
    expect(by("#oktagon")).toMatchObject({ status: "active", label: "regular" });
  });

  it("promotes a modest rise to exploding when a free provider shows the same topic", () => {
    const previous = computeHashtagSignals({ items: [item({ likes: 100 })], previous: [], now });
    const [signal] = computeHashtagSignals({
      items: [item({ likes: 120 })],
      previous,
      now,
      freeSignals: [hnReading("AITools", 40)]
    });
    expect(signal).toMatchObject({ breadth: 2, label: "exploding" });
  });

  it("carries the vocabulary into the magazine block", () => {
    const hashtags = computeHashtagSignals({ items: [item()], previous: [], now, freeSignals: [hnReading("aitools", 40)] });
    const block = buildForMagazines({ hashtags, refs: ["source:apify:instagram:2026-09-14"] });
    expect(block.ai[0]).toMatchObject({ topic: "#aitools", window: "7d", status: "active", breadth: 2, label: null });
  });
});

describe("free readings with the vocabulary on them", () => {
  it("takes the window from the provider and the delta from last week's reading of the same topic", () => {
    const [annotated] = annotateFreeSignals({
      results: [hnReading("aitools", 30)],
      previous: [hnReading("AITools", 10)],
      index: buildBreadthIndex({ items: [], freeSignals: [] })
    });
    expect(annotated?.signals[0]).toMatchObject({ window: "24h", status: "active", breadth: 1, label: "exploding" });
  });

  it("reads a rank the other way round and never lets a rank double", () => {
    const rank = (value: number) => ({ ...hnReading("aitools", value), provider: "reddit" as const, signals: [{ kind: "rank" as const, topic: "aitools", value, scope: "r/artificial", topicSets: [], ref: "r" }] });
    const [climbed] = annotateFreeSignals({ results: [rank(2)], previous: [rank(8)], index: buildBreadthIndex({ items: [], freeSignals: [] }) });
    expect(climbed?.signals[0]).toMatchObject({ window: "24h", status: "active", label: "regular" });
    const [fell] = annotateFreeSignals({ results: [rank(8)], previous: [rank(2)], index: buildBreadthIndex({ items: [], freeSignals: [] }) });
    expect(fell?.signals[0]).toMatchObject({ status: "lasted", label: "peaked" });
  });

  it("has no label without a prior reading", () => {
    const [annotated] = annotateFreeSignals({ results: [{ ...hnReading("aitools", 30), provider: "google-news" }], previous: [], index: buildBreadthIndex({ items: [], freeSignals: [] }) });
    expect(annotated?.signals[0]).toMatchObject({ window: "48h", status: "active", label: null });
  });
});

describe("a snapshot stored before the vocabulary existed", () => {
  it("still parses, with the defaults the vocabulary promises", () => {
    const parsed = GoViralTrendsSchema.parse({
      schemaVersion: "goviral-trends/1",
      date: "2026-08-10",
      generatedAt: "2026-08-10T11:00:00.000Z",
      sourceResults: [],
      freeSignals: [{ provider: "hn", status: "success", reason: null, signals: [{ kind: "velocity", topic: "aitools", value: 4, ref: "r" }] }],
      items: [],
      signals: {
        topHashtags: [{ hashtag: "#aitools", topicSet: "dneskai", posts: 3, engagementPerHour: 12, weekOverWeekDelta: 2 }],
        topFormats: [],
        topAudio: [],
        exploreSections: [],
        perTopicSet: []
      },
      forMagazines: { ai: [{ topic: "#aitools", engagementPerHour: 12, weekOverWeekDelta: 2, refs: [] }], mma: [] }
    });
    expect(parsed.signals.topHashtags[0]).toMatchObject({ window: "7d", status: "active", breadth: 1, label: null });
    expect(parsed.freeSignals[0]?.signals[0]).toMatchObject({ window: "24h", status: "active", breadth: 1, label: null });
    expect(parsed.forMagazines.ai[0]).toMatchObject({ window: "7d", status: "active", breadth: 1, label: null });
  });
});
