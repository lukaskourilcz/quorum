import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configRoot } from "../src/paths.js";
import {
  GoViralSignalScoringConfigSchema,
  absoluteVolume,
  buildRawSignals,
  compositeScore,
  lastedBucket,
  loadGoViralSignalScoringConfig,
  normalizeTopic,
  relativeGrowth,
  scoreSignals,
  signalStatus,
  sourceBreadth,
  stormRetrigger,
  type GoViralSignalScoringConfig,
  type RawSignal
} from "../src/sources/goviral-signal-score.js";
import {
  emptySignalRegister,
  reconcileSignalRegister,
  scoreAndRegisterSignals,
  readSignalRegister
} from "../src/sources/goviral-signal-register.js";

/**
 * The signal score, held to the three rules the GoVIRAL founding decision set for this data.
 *
 * Nothing here touches the network, a model or the Apify credit: every case is arithmetic over
 * readings the run already has. Every function takes `now`, so the same inputs score the same way
 * on any machine on any day — a scorer that read a clock would produce a different brief every
 * time somebody re-ran the week.
 */

const NOW = new Date("2026-08-10T12:00:00.000Z");
const DATE = "2026-08-10";

async function config(): Promise<GoViralSignalScoringConfig> {
  return loadGoViralSignalScoringConfig();
}

function signal(overrides: Partial<RawSignal> & Pick<RawSignal, "provider" | "sourceKind" | "topic">): RawSignal {
  return {
    measurement: "volume",
    topicSet: null,
    value: 10,
    priorValue: null,
    evidenceRefs: [],
    ...overrides
  };
}

describe("the scoring config", () => {
  it("is the only place the numbers live, and it refuses a broken distribution", async () => {
    const loaded = await config();
    expect(loaded.schemaVersion).toBe("goviral-signal-scoring/1");
    const raw = JSON.parse(await readFile(path.join(configRoot, "goviral-signal-scoring.json"), "utf8")) as Record<string, unknown>;
    const weights = { ...(raw.weights as Record<string, number>), "relative-growth": 0.9 };
    expect(GoViralSignalScoringConfigSchema.safeParse({ ...raw, weights }).success).toBe(false);
    // A ceiling below the half-life would retire a signal before its first window ever closed.
    const windows = { ...(raw.windows as Record<string, unknown>), "viral-post": { halfLifeHours: 48, maximumHours: 12 } };
    expect(GoViralSignalScoringConfigSchema.safeParse({ ...raw, windows }).success).toBe(false);
  });
});

describe("the three components", () => {
  it("never reads a rank as a size", async () => {
    const loaded = await config();
    const rank = signal({ provider: "reddit", sourceKind: "viral-post", topic: "a ranked thread", measurement: "rank", value: 2 });
    expect(absoluteVolume(rank, loaded)).toBeNull();
    // The same position as a volume reading does have a size. The kind is the whole difference.
    expect(absoluteVolume({ ...rank, measurement: "volume" }, loaded)).toBeGreaterThan(0);
  });

  it("normalizes volume inside its own source kind rather than across kinds", async () => {
    const loaded = await config();
    const news = absoluteVolume(signal({ provider: "google-news", sourceKind: "news-volume", topic: "a story", value: 20 }), loaded);
    const search = absoluteVolume(signal({ provider: "google-trends", sourceKind: "search-spike", topic: "a story", value: 20 }), loaded);
    // Twenty newsrooms is most of what a story ever gets; twenty searches is nothing at all.
    expect(news).not.toBeNull();
    expect(search).not.toBeNull();
    expect(news as number).toBeGreaterThan(search as number);
  });

  it("counts independent operators, so two Google surfaces are one source", async () => {
    const loaded = await config();
    const signals = [
      signal({ provider: "google-trends", sourceKind: "search-spike", topic: "quantum error correction" }),
      signal({ provider: "google-news", sourceKind: "news-volume", topic: "quantum error correction" }),
      signal({ provider: "hn", sourceKind: "viral-post", topic: "unrelated release notes" })
    ];
    const breadth = sourceBreadth({ topic: "quantum error correction" }, signals, loaded);
    expect(breadth.groups).toEqual(["google"]);
    // Two answering operators, one of which named it.
    expect(breadth.ratio).toBe(0.5);
  });

  it("calls breadth unmeasured rather than full when only one operator answered", async () => {
    const loaded = await config();
    const only = [signal({ provider: "hn", sourceKind: "viral-post", topic: "a single reading" })];
    expect(sourceBreadth({ topic: "a single reading" }, only, loaded).ratio).toBeNull();
  });

  it("keeps a silent source from lowering a score, because absence renormalizes away", () => {
    const measuredOnly = compositeScore([
      { name: "relative-growth", rawValue: null, weight: 0.45, contribution: null, note: "" },
      { name: "absolute-volume", rawValue: 0.8, weight: 0.25, contribution: 20, note: "" },
      { name: "source-breadth", rawValue: 0.8, weight: 0.3, contribution: 24, note: "" }
    ]);
    const scoredAsZero = compositeScore([
      { name: "relative-growth", rawValue: 0, weight: 0.45, contribution: 0, note: "" },
      { name: "absolute-volume", rawValue: 0.8, weight: 0.25, contribution: 20, note: "" },
      { name: "source-breadth", rawValue: 0.8, weight: 0.3, contribution: 24, note: "" }
    ]);
    expect(measuredOnly).toBe(80);
    expect(scoredAsZero).toBe(44);
    expect(compositeScore([])).toBeNull();
  });

  it("floors a runaway ratio instead of dividing by nothing", async () => {
    const loaded = await config();
    expect(relativeGrowth({ value: 50, priorValue: 0 }, loaded).ratio).toBe(50);
    expect(relativeGrowth({ value: 50, priorValue: null }, loaded).ratio).toBeNull();
    expect(relativeGrowth({ value: 5_100, priorValue: 100 }, loaded).breakout).toBe(true);
    expect(relativeGrowth({ value: 200, priorValue: 100 }, loaded).breakout).toBe(false);
  });
});

describe("the status word", () => {
  it("calls a large falling signal peaked whatever its score says", async () => {
    const loaded = await config();
    expect(signalStatus({ score: 95, growth: -0.6, breakout: false, config: loaded })).toBe("peaked");
    expect(signalStatus({ score: 95, growth: 0.4, breakout: false, config: loaded })).toBe("exploding");
    expect(signalStatus({ score: 40, growth: 0.4, breakout: false, config: loaded })).toBe("regular");
    // A high score with no growth reading at all is not exploding: nothing measured it rising.
    expect(signalStatus({ score: 95, growth: null, breakout: false, config: loaded })).toBe("regular");
    // Breakout outranks everything, including a decline the same run measured.
    expect(signalStatus({ score: 10, growth: -0.9, breakout: true, config: loaded })).toBe("exploding");
  });

  it("buckets how long a signal has run into the windows it is reported in", async () => {
    const loaded = await config();
    expect(lastedBucket(3, loaded)).toBe(0);
    expect(lastedBucket(5, loaded)).toBe(4);
    expect(lastedBucket(47, loaded)).toBe(24);
    expect(lastedBucket(900, loaded)).toBe(168);
  });
});

describe("the register", () => {
  const scoredFixture = async (score: number, value = 100) => {
    const loaded = await config();
    return scoreSignals({
      signals: [signal({ provider: "hn", sourceKind: "viral-post", topic: "a durable subject", measurement: "velocity", value })],
      firstFlaggedOn: () => null,
      date: DATE,
      now: NOW,
      config: loaded
    }).map((entry) => ({ ...entry, score }));
  };

  it("writes a first-flagged date once and never rewrites it", async () => {
    const loaded = await config();
    const week1 = await scoredFixture(60);
    const first = reconcileSignalRegister({ register: emptySignalRegister(NOW), scored: week1, date: DATE, now: NOW, config: loaded });
    expect(first.register.entries[0]?.firstFlaggedOn).toBe(DATE);

    // Two more sightings, each inside the window, each on a later date.
    let register = first.register;
    for (const date of ["2026-08-10", "2026-08-11"]) {
      const now = new Date(`${date}T20:00:00.000Z`);
      const scored = scoreSignals({
        signals: [signal({ provider: "hn", sourceKind: "viral-post", topic: "a durable subject", measurement: "velocity", value: 100, priorValue: 100 })],
        firstFlaggedOn: (key) => register.entries.find((entry) => entry.key === key)?.firstFlaggedOn ?? null,
        date,
        now,
        config: loaded
      });
      register = reconcileSignalRegister({ register, scored, date, now, config: loaded }).register;
    }
    expect(register.entries).toHaveLength(1);
    expect(register.entries[0]?.firstFlaggedOn).toBe(DATE);
    expect(register.entries[0]?.lastSeenOn).toBe("2026-08-11");
  });

  it("retires a signal past its window, and keeps the same one when a storm re-triggers it", async () => {
    const loaded = await config();
    const seeded = reconcileSignalRegister({
      register: emptySignalRegister(NOW),
      scored: await scoredFixture(30),
      date: DATE,
      now: NOW,
      config: loaded
    }).register;
    // A viral-post window is 24h. Three days later it has long closed.
    const later = new Date("2026-08-13T12:00:00.000Z");
    const weak = reconcileSignalRegister({ register: seeded, scored: await scoredFixture(35), date: "2026-08-13", now: later, config: loaded });
    expect(weak.kept).toHaveLength(0);
    expect(weak.retired).toHaveLength(1);
    expect(weak.retired[0]?.reason).toContain("storm re-trigger");
    expect(weak.register.entries).toHaveLength(0);

    const storm = reconcileSignalRegister({ register: seeded, scored: await scoredFixture(70), date: "2026-08-13", now: later, config: loaded });
    expect(storm.kept).toHaveLength(1);
    expect(storm.retired).toHaveLength(0);
    expect(storm.register.entries[0]?.stormRetriggeredOn).toBe("2026-08-13");
    // A storm restarts the ceiling; it never moves the date the subject was first flagged.
    expect(storm.register.entries[0]?.firstFlaggedOn).toBe(DATE);
  });

  it("retires an unmeasured signal once its window closes, and names the reason", async () => {
    const loaded = await config();
    const seeded = reconcileSignalRegister({
      register: emptySignalRegister(NOW),
      scored: await scoredFixture(55),
      date: DATE,
      now: NOW,
      config: loaded
    }).register;
    const quiet = reconcileSignalRegister({
      register: seeded,
      scored: [],
      date: "2026-08-13",
      now: new Date("2026-08-13T12:00:00.000Z"),
      config: loaded
    });
    expect(quiet.retired[0]?.window).toBe("lasted");
    expect(quiet.retired[0]?.reason).toContain("Nothing measured it this week");
    expect(quiet.register.recentlyRetired).toHaveLength(1);
  });

  it("never lets the storm rule fire off a score nobody recorded", async () => {
    const loaded = await config();
    expect(stormRetrigger({ previousScore: null, currentScore: 90, config: loaded })).toBe(false);
    expect(stormRetrigger({ previousScore: 0, currentScore: 90, config: loaded })).toBe(false);
    expect(stormRetrigger({ previousScore: 30, currentScore: 60, config: loaded })).toBe(true);
    expect(stormRetrigger({ previousScore: 30, currentScore: 59, config: loaded })).toBe(false);
  });

  it("caps itself by dropping the least recently seen, and says that is why", async () => {
    const loaded = await config();
    const capped: GoViralSignalScoringConfig = { ...loaded, registerCap: 10 };
    const scored = scoreSignals({
      signals: Array.from({ length: 12 }, (unused, index) => signal({
        provider: "hn",
        sourceKind: "viral-post",
        topic: `subject number ${index}`,
        measurement: "velocity",
        value: 100 + index
      })),
      firstFlaggedOn: () => null,
      date: DATE,
      now: NOW,
      config: capped
    });
    const reconciled = reconcileSignalRegister({ register: emptySignalRegister(NOW), scored, date: DATE, now: NOW, config: capped });
    expect(reconciled.register.entries).toHaveLength(10);
    expect(reconciled.retired).toHaveLength(2);
    expect(reconciled.retired[0]?.reason).toContain("register cap");
    expect(reconciled.retired[0]?.reason).toContain("not by a judgement about it");
  });
});

describe("building the week's readings", () => {
  it("skips a failed provider entirely rather than scoring it zero", async () => {
    const loaded = await config();
    const raw = buildRawSignals({
      trends: {
        signals: { topHashtags: [], topFormats: [], topAudio: [], exploreSections: [], perTopicSet: [] },
        freeSignals: [
          { provider: "google-news", status: "failed", reason: "The source was down.", signals: [{ kind: "volume", topic: "a story nobody saw", value: 9, topicSets: [], ref: "r" }] },
          { provider: "hn", status: "success", reason: null, signals: [{ kind: "velocity", topic: "a story somebody saw", value: 9, topicSets: [], ref: "r2" }] }
        ]
      },
      priorValue: () => null,
      refs: [],
      config: loaded
    });
    expect(raw.map((entry) => entry.topic)).toEqual(["a story somebody saw"]);
  });

  it("recovers a paid signal's prior week from its own delta, and a free one from the register", async () => {
    const loaded = await config();
    const raw = buildRawSignals({
      trends: {
        signals: {
          topHashtags: [{ hashtag: "#ufc", topicSet: "mma", posts: 9, engagementPerHour: 200, weekOverWeekDelta: 80 }],
          topFormats: [],
          topAudio: [],
          exploreSections: [],
          perTopicSet: []
        },
        freeSignals: [{ provider: "hn", status: "success", reason: null, signals: [{ kind: "velocity", topic: "a free reading", value: 40, topicSets: [], ref: "r" }] }]
      },
      priorValue: (key) => (key === "viral-post:a free reading" ? 10 : null),
      refs: [],
      config: loaded
    });
    expect(raw.find((entry) => entry.topic === "#ufc")?.priorValue).toBe(120);
    expect(raw.find((entry) => entry.topic === "a free reading")?.priorValue).toBe(10);
  });

  it("collapses the same topic to one key however a provider punctuated it", () => {
    expect(normalizeTopic("#AI-Tools")).toBe("ai tools");
    expect(normalizeTopic("  AI   tools!  ")).toBe("ai tools");
  });
});

describe("the whole free path, end to end", () => {
  it("writes the register from keyless readings alone, at no cost and with no snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "goviral-register-"));
    const first = await scoreAndRegisterSignals({
      root,
      date: DATE,
      now: NOW,
      trends: {
        signals: { topHashtags: [], topFormats: [], topAudio: [], exploreSections: [], perTopicSet: [] },
        freeSignals: [
          { provider: "google-trends", status: "success", reason: null, signals: [{ kind: "volume", topic: "model release day", value: 20_000, scope: "geo:US", topicSets: ["dneskai"], ref: "ref-a" }] },
          { provider: "hn", status: "success", reason: null, signals: [{ kind: "velocity", topic: "model release day thread", value: 30, topicSets: [], ref: "ref-b" }] }
        ]
      },
      refs: ["source:trending:hn:2026-08-10"]
    });
    expect(first.artifactPaths).toEqual(["goviral/signals/register.json"]);
    expect(first.scoredSignals.length).toBe(2);
    expect(first.scoredSignals.every((entry) => entry.firstFlaggedOn === DATE)).toBe(true);

    // A second run a day later finds the prior value waiting and can finally measure growth.
    const nextDay = new Date("2026-08-11T12:00:00.000Z");
    const second = await scoreAndRegisterSignals({
      root,
      date: "2026-08-11",
      now: nextDay,
      trends: {
        signals: { topHashtags: [], topFormats: [], topAudio: [], exploreSections: [], perTopicSet: [] },
        freeSignals: [
          { provider: "google-trends", status: "success", reason: null, signals: [{ kind: "volume", topic: "model release day", value: 60_000, scope: "geo:US", topicSets: ["dneskai"], ref: "ref-a" }] },
          { provider: "hn", status: "success", reason: null, signals: [{ kind: "velocity", topic: "model release day thread", value: 30, topicSets: [], ref: "ref-b" }] }
        ]
      },
      refs: ["source:trending:hn:2026-08-11"]
    });
    const search = second.scoredSignals.find((entry) => entry.sourceKind === "search-spike");
    expect(search?.firstFlaggedOn).toBe(DATE);
    expect(search?.components.find((entry) => entry.name === "relative-growth")?.rawValue).toBe(1);
    expect(search?.status).toBe("exploding");

    const stored = await readSignalRegister(root, nextDay);
    expect(stored.schemaVersion).toBe("goviral-signal-register/1");
    expect(stored.entries.map((entry) => entry.firstFlaggedOn)).toEqual([DATE, DATE]);
  });

  it("treats an unreadable register as an absent baseline rather than a failed run", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "goviral-register-bad-"));
    const { atomicWriteText } = await import("../src/state.js");
    await atomicWriteText(root, "goviral/signals/register.json", "{not json at all");
    const register = await readSignalRegister(root, NOW);
    expect(register.entries).toEqual([]);
    expect(register.recentlyRetired).toEqual([]);
  });
});
