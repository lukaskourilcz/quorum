import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readGoViralTrends } from "./goviral-trends";

/**
 * The trends reader, held to the admin's two data rules: an absent store is a clear pre-token
 * state rather than an error, and a file that will not parse is dropped and counted rather than
 * silently skipped or allowed to take the workspace down.
 */

async function trendsRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "goviral-trends-"));
  await mkdir(path.join(root, "state", "goviral", "trends"), { recursive: true });
  return root;
}

function snapshot(date: string) {
  return {
    schemaVersion: "goviral-trends/1",
    date,
    generatedAt: `${date}T06:10:00.000Z`,
    sourceResults: [],
    freeSignals: [],
    items: [],
    signals: {
      topHashtags: [
        { hashtag: "#aitools", topicSet: "ai", posts: 14, engagementPerHour: 321.5, weekOverWeekDelta: 40.2 },
        { hashtag: "#ufc", topicSet: "mma", posts: 9, engagementPerHour: 120, weekOverWeekDelta: null }
      ],
      topFormats: [{ format: "reel", items: 18 }],
      topAudio: [{ title: "Original audio", artist: null, reels: 6 }],
      exploreSections: [],
      perTopicSet: [
        { topicSet: "ai", label: "AI tools", topHashtags: ["#aitools"], items: 14, medianEngagementPerHour: 200.4 }
      ]
    },
    forMagazines: {
      ai: [{ topic: "Agentic coding assistants", engagementPerHour: 300, weekOverWeekDelta: 55, refs: [] }],
      mma: []
    }
  };
}

function ratedSnapshot(date: string) {
  return {
    ...snapshot(date),
    scoredSignals: [
      {
        key: "search-spike:model release day",
        topic: "model release day",
        topicSet: "dneskai",
        provider: "google-trends",
        sourceKind: "search-spike",
        measurement: "volume",
        value: 20000,
        components: [],
        score: 78.3,
        status: "exploding",
        window: "active",
        breakout: true,
        firstFlaggedOn: "2026-08-03",
        measuredAt: `${date}T06:10:00.000Z`,
        expiresAt: "2026-08-26T06:10:00.000Z",
        lastedHours: 168,
        breadthProviders: ["google", "hn"],
        evidenceRefs: []
      },
      // Missing the score entirely: dropped rather than rendered as a zero the owner could read
      // as a measurement.
      { key: "viral-post:half a record", topic: "half a record", status: "regular", window: "active" }
    ]
  };
}

describe("what is viral this week", () => {
  it("reports a missing store as the pre-token state, not an error", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "goviral-trends-none-"));
    const trends = await readGoViralTrends(root);
    expect(trends.state).toBe("missing");
    expect(trends.droppedSnapshots).toBe(0);
  });

  it("reads the newest snapshot and keeps only the aggregate signals", async () => {
    const root = await trendsRoot();
    const directory = path.join(root, "state", "goviral", "trends");
    await writeFile(path.join(directory, "2026-08-17.json"), JSON.stringify(snapshot("2026-08-17")));
    await writeFile(path.join(directory, "2026-08-24.json"), JSON.stringify(snapshot("2026-08-24")));
    const trends = await readGoViralTrends(root);
    expect(trends.state).toBe("present");
    expect(trends.snapshotDate).toBe("2026-08-24");
    expect(trends.topics).toEqual([
      { label: "AI tools", items: 14, medianEngagementPerHour: 200.4, topHashtags: ["#aitools"] }
    ]);
    expect(trends.hashtags[0]).toMatchObject({ hashtag: "#aitools", weekOverWeekDelta: 40.2 });
    expect(trends.hashtags[1]).toMatchObject({ hashtag: "#ufc", weekOverWeekDelta: null });
    expect(trends.audio).toEqual([{ title: "Original audio", artist: null, reels: 6 }]);
    expect(trends.forMagazines.ai[0]?.topic).toBe("Agentic coding assistants");
    // The raw scraped items never reach the view model in any shape.
    expect(JSON.stringify(trends)).not.toContain('"items":[');
  });

  it("drops an unreadable snapshot, counts it, and falls back to the previous week", async () => {
    const root = await trendsRoot();
    const directory = path.join(root, "state", "goviral", "trends");
    await writeFile(path.join(directory, "2026-08-17.json"), JSON.stringify(snapshot("2026-08-17")));
    await writeFile(path.join(directory, "2026-08-24.json"), "{not json");
    const trends = await readGoViralTrends(root);
    expect(trends.state).toBe("present");
    expect(trends.snapshotDate).toBe("2026-08-17");
    expect(trends.droppedSnapshots).toBe(1);
  });

  it("reports a store holding only unreadable snapshots as missing with the count visible", async () => {
    const root = await trendsRoot();
    await writeFile(path.join(root, "state", "goviral", "trends", "2026-08-24.json"), JSON.stringify({ schemaVersion: "elsewhere/9" }));
    const trends = await readGoViralTrends(root);
    expect(trends.state).toBe("missing");
    expect(trends.droppedSnapshots).toBe(1);
  });

  it("carries the rated signals through, and drops one that has no score", async () => {
    const root = await trendsRoot();
    await writeFile(path.join(root, "state", "goviral", "trends", "2026-08-24.json"), JSON.stringify(ratedSnapshot("2026-08-24")));
    const trends = await readGoViralTrends(root);
    expect(trends.scoredSignals).toHaveLength(1);
    expect(trends.scoredSignals[0]).toMatchObject({
      topic: "model release day",
      status: "exploding",
      score: 78.3,
      firstFlaggedOn: "2026-08-03",
      breakout: true
    });
    expect(trends.scoredSignals[0]?.breadthProviders).toEqual(["google", "hn"]);
  });

  it("renders a snapshot written before scoring existed, with no rated signals and no error", async () => {
    const root = await trendsRoot();
    await writeFile(path.join(root, "state", "goviral", "trends", "2026-08-24.json"), JSON.stringify(snapshot("2026-08-24")));
    const trends = await readGoViralTrends(root);
    expect(trends.state).toBe("present");
    expect(trends.scoredSignals).toEqual([]);
    expect(trends.droppedSnapshots).toBe(0);
  });
});
