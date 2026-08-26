import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BOOK_KB_SCORE_AXES, type BookKbChunk } from "../src/contracts/book-kb-index.js";
import { GoViralTrendsSchema } from "../src/sources/goviral-trends.js";
import { loadGoViralSourceRegistry } from "../src/sources/apify.js";
import { collectFreeTrendingSignals } from "../src/portfolio/evidence.js";
import { buildGoViralWeeklyBrief } from "../src/portfolio/goviral-brief.js";
import { loadLatestDoorMoneyGoViralBrief } from "../src/ventures/door-money/goviral-brief.js";
import { selectDoorMoneyPassages } from "../src/ventures/door-money/select.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "door-money-goviral-"));
  roots.push(root);
  return root;
}

async function writeJson(root: string, relative: string, value: unknown): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function weeklyBrief(date: string, description = "Trend call: author marketing (door-money, free google-news signal): 2 articles.") {
  return {
    schemaVersion: "marketing-plan/1",
    id: `plan-${date}-weekly-brief`,
    ventureId: "goviral",
    title: `Synthetic weekly brief ${date}`,
    summary: "A bounded synthetic brief for recorded-context testing.",
    objective: "Give the owner one synthetic trend call to inspect.",
    tactics: [{ type: "content", description, assetsNeeded: [], platformPolicyNote: "Draft only." }],
    calendar: [{ week: 1, focus: "Owner review only." }],
    audienceRefs: [],
    kpis: ["One synthetic brief recorded."],
    postable_assets: [{
      id: `asset-${date.replaceAll("-", "")}-weekly-brief`,
      captions: {
        instagram: { A: "Synthetic caption A.", B: "Synthetic caption B." },
        threads: { A: "Synthetic thread A.", B: "Synthetic thread B." }
      },
      visual: {
        template_id: "cover-cta", version: "1.0.0",
        content: { locale: "en", strings: {
          "cover-title": "SYNTHETIC BRIEF", "cover-dek": "Invented fixture.",
          cta: "Review the fixture", destination: "boardless-ai.vercel.app"
        } }
      }
    }],
    status: "approved",
    originMeetingRef: `${date}-gv-brief`
  };
}

function freeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("algolia")
      ? JSON.stringify({ hits: [] })
      : url.includes("trends.google")
        ? "<rss><channel><title>Daily Search Trends</title></channel></rss>"
        : url.includes("news.google")
          ? "<rss><channel><title>Google News</title><item><title>Synthetic measured item</title></item></channel></rss>"
          : "<feed><title>Reddit</title></feed>";
    return new Response(body, { status: 200, headers: {
      "content-type": url.includes("algolia") ? "application/json" : "application/xml"
    } });
  }) as typeof fetch;
}

function passage(theme: string): BookKbChunk {
  return {
    id: "ch01-s01-c001", chapterId: "ch01", sceneId: "ch01-s01", ordinal: 1,
    arc: "fixture-arc", byteOffsets: { start: 0, end: 1 },
    summary: "Invented metadata summary.", entities: [], themes: [theme],
    era: "invented-era", storyType: "lesson", quotables: [],
    scores: Object.fromEntries(BOOK_KB_SCORE_AXES.map((axis) => [axis, {
      score: 5, justification: `Invented reason for ${axis}.`
    }])) as BookKbChunk["scores"],
    usageHistory: []
  };
}

describe("Door Money's free GoVIRAL spine", () => {
  it("measures three exact rotating terms and carries only those terms into brief text", async () => {
    const root = await temporaryRoot();
    const registry = await loadGoViralSourceRegistry();
    const free = await collectFreeTrendingSignals({
      root, date: "2026-08-10", now: new Date("2026-08-10T11:00:00.000Z"),
      topicSets: registry.topicSets, fetchImpl: freeFetch(),
      resolveImpl: async () => ["93.184.216.34"]
    });
    const topicSet = registry.topicSets["door-money"];
    expect(topicSet).toBeDefined();
    const configured = topicSet!.keywords;
    const measured = free.results.flatMap((result) => result.signals)
      .filter((signal) => signal.topicSets?.includes("door-money"));
    expect(measured).toHaveLength(3);
    expect(measured.every((signal) => configured.includes(signal.topic))).toBe(true);
    const unmeasured = configured.filter((term) => !measured.some(({ topic }) => topic === term));
    expect(unmeasured).toHaveLength(1);

    const trends = GoViralTrendsSchema.parse({
      schemaVersion: "goviral-trends/1", date: "2026-08-10", generatedAt: "2026-08-10T11:00:00.000Z",
      sourceResults: [], freeSignals: free.results, items: [],
      signals: { topHashtags: [], topFormats: [], topAudio: [], exploreSections: [], perTopicSet: [] },
      forMagazines: { ai: [], mma: [] }
    });
    const brief = buildGoViralWeeklyBrief({ date: "2026-08-10", trends, contributions: [], vetoed: false });
    const trendText = brief.tactics.filter(({ description }) => description.startsWith("Trend call:"))
      .map(({ description }) => description).join(" ");
    measured.forEach(({ topic }) => expect(trendText).toContain(topic));
    expect(trendText).not.toContain(unmeasured[0]);
    const unmeasuredTheme = unmeasured[0]!.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
    const neutralSelection = selectDoorMoneyPassages({
      ventureId: "door-money", date: "2026-08-10", chunks: [passage(unmeasuredTheme)], trendBrief: brief
    });
    expect(neutralSelection.passages[0]?.formatScores.every(({ trendMultiplier }) => trendMultiplier === 1)).toBe(true);
  });

  it("uses only the latest canonical non-future recorded brief and treats absence or bad data neutrally", async () => {
    const missing = await temporaryRoot();
    await expect(loadLatestDoorMoneyGoViralBrief(missing, "2026-08-12"))
      .resolves.toEqual({ latest: null, dropped: 0 });

    const unusable = await temporaryRoot();
    await Promise.all([
      writeJson(unusable, "ventures/goviral/plans/malformed.json", { schemaVersion: "marketing-plan/1" }),
      writeJson(unusable, "ventures/goviral/plans/plan-2026-08-17-weekly-brief.json", weeklyBrief("2026-08-17"))
    ]);
    const unavailable = await loadLatestDoorMoneyGoViralBrief(unusable, "2026-08-12");
    expect(unavailable).toEqual({ latest: null, dropped: 2 });
    const neutral = selectDoorMoneyPassages({
      ventureId: "door-money", date: "2026-08-12", chunks: [passage("author-marketing")],
      trendBrief: unavailable.latest
    });
    expect(neutral.passages[0]?.formatScores.every(({ trendMultiplier }) => trendMultiplier === 1)).toBe(true);

    const present = await temporaryRoot();
    await Promise.all([
      writeJson(present, "ventures/goviral/plans/plan-2026-08-03-weekly-brief.json", weeklyBrief("2026-08-03")),
      writeJson(present, "ventures/goviral/plans/plan-2026-08-10-weekly-brief.json", weeklyBrief("2026-08-10")),
      writeJson(present, "ventures/goviral/plans/plan-2026-08-17-weekly-brief.json", weeklyBrief("2026-08-17"))
    ]);
    const loaded = await loadLatestDoorMoneyGoViralBrief(present, "2026-08-12");
    expect(loaded).toMatchObject({
      latest: { date: "2026-08-10", id: "plan-2026-08-10-weekly-brief" }, dropped: 1
    });
    const selected = selectDoorMoneyPassages({
      ventureId: "door-money", date: "2026-08-12", chunks: [passage("author-marketing")],
      trendBrief: loaded.latest
    });
    expect(selected.passages[0]?.formatScores.every(({ trendMultiplier }) => trendMultiplier === 1.05)).toBe(true);
  });
});
