import { describe, expect, it } from "vitest";
import {
  GOVIRAL_BRIEF_SECTION_KEYS,
  GoViralWeeklyBriefSchema,
  readingTimeMinutes
} from "../src/contracts/goviral-weekly-brief.js";
import { GoViralPlaySchema } from "../src/contracts/goviral-play-library.js";
import {
  buildGoViralBriefSkeleton,
  renderGoViralBriefMarkdown
} from "../src/portfolio/goviral-brief-skeleton.js";
import { rankPlays, type PlayLibraryRead } from "../src/portfolio/goviral-plays.js";
import type { GoViralTrends } from "../src/sources/goviral-trends.js";
import type { BriefContribution } from "../src/portfolio/goviral-brief.js";

const NO_PLAYS: PlayLibraryRead = { plays: [], dropped: 0, reason: "The play library is on file and holds no play yet." };

const contributions: BriefContribution[] = [
  { agent: "PULSE", summary: "Two calls this week and one skip.", evidenceRefs: ["source:apify:instagram:2026-08-10"], idea: { title: "Owner: the cost-per-token piece", summary: "Write the piece about what an agent day actually costs." } },
  { agent: "SCOUT", summary: "#ufc is climbing.", evidenceRefs: ["source:apify:instagram:2026-08-10"], idea: { title: "DNESKAi: the quiet model release", summary: "Nobody covered the release that matters; the packet has the numbers." } },
  { agent: "ANGLE", summary: "One of these is MMA Files' problem.", evidenceRefs: [], idea: { title: "MMA Files: fight-week explainer", summary: "The card is trending; the desk has the sources for a preview." } },
  { agent: "AUDIT", summary: "No posting or spend proposed.", evidenceRefs: [], idea: { title: "A fourth idea that does not fit", summary: "Kept so the cap has something to cut." } }
];

function trends(overrides: Partial<GoViralTrends> = {}): GoViralTrends {
  return {
    schemaVersion: "goviral-trends/1",
    date: "2026-08-10",
    generatedAt: "2026-08-10T11:00:00.000Z",
    sourceResults: [],
    freeSignals: [],
    scoredSignals: [],
    items: [],
    signals: { topHashtags: [], topFormats: [], topAudio: [], exploreSections: [], perTopicSet: [] },
    forMagazines: { ai: [], mma: [] },
    ...overrides
  } as GoViralTrends;
}

function build(overrides: Partial<Parameters<typeof buildGoViralBriefSkeleton>[0]> = {}) {
  return buildGoViralBriefSkeleton({
    date: "2026-08-10",
    trends: null,
    contributions,
    vetoed: false,
    plays: NO_PLAYS,
    generatedAt: "2026-08-10T11:05:00.000Z",
    ...overrides
  });
}

function section(brief: ReturnType<typeof build>, key: string): string[] {
  return brief.sections.find((entry) => entry.key === key)?.lines ?? [];
}

describe("the brief skeleton", () => {
  it("prints the same eight sections in the same order, however little the week produced", () => {
    const full = build();
    const quiet = build({ contributions: [], plays: { plays: [], dropped: 0, reason: null } });
    for (const brief of [full, quiet]) {
      expect(brief.sections.map(({ key }) => key)).toEqual([...GOVIRAL_BRIEF_SECTION_KEYS]);
      expect(brief.sections.every((entry) => entry.lines.length > 0)).toBe(true);
    }
    expect(section(quiet, "problem")[0]).toBe("The chair recorded no framing this week.");
    expect(section(quiet, "opportunities")).toEqual(["No seat recorded an opportunity this week."]);
    expect(section(quiet, "links")).toEqual(["No seat cited an evidence ref this week."]);
  });

  it("refuses a brief whose skeleton was reordered", () => {
    const brief = build();
    const reordered = { ...brief, sections: [...brief.sections.slice(0, 6), brief.sections[7], brief.sections[6]] };
    expect(GoViralWeeklyBriefSchema.safeParse(reordered).success).toBe(false);
  });

  it("never lets Haters come out empty, and always closes it with the measurement disclosure", () => {
    for (const brief of [build(), build({ contributions: [] }), build({ vetoed: true })]) {
      const haters = section(brief, "haters");
      expect(haters.length).toBeGreaterThan(0);
      expect(haters.at(-1)).toContain("measures no reach");
    }
  });

  it("puts AUDIT's veto in Haters and drops the brief to draft", () => {
    const vetoed = build({ vetoed: true });
    expect(vetoed.status).toBe("draft");
    expect(section(vetoed, "haters")[0]).toContain("AUDIT vetoed this brief: No posting or spend proposed.");
    expect(build().status).toBe("approved");
    expect(section(build(), "haters")[0]).toContain("AUDIT's review:");
  });

  it("says in Haters when the week is working from an older snapshot", () => {
    const stale = build({ date: "2026-08-17", trends: trends() });
    expect(section(stale, "haters")).toContain("No fresh scout this week — working from the 2026-08-10 snapshot.");
    const fresh = build({ trends: trends() });
    expect(section(fresh, "haters").some((line) => line.startsWith("Scout data from"))).toBe(false);
  });

  it("numbers at most three opportunities and gives each a citeable id", () => {
    const brief = build();
    expect(brief.opportunities).toHaveLength(3);
    expect(brief.opportunities.map(({ id }) => id)).toEqual([
      "GV-2026-08-10-O1",
      "GV-2026-08-10-O2",
      "GV-2026-08-10-O3"
    ]);
    expect(brief.opportunities[0]?.title).toBe("Owner: the cost-per-token piece");
    expect(section(brief, "opportunities")[0]).toContain("GV-2026-08-10-O1 —");
  });

  it("refuses an opportunity whose id does not match its own brief and number", () => {
    const brief = build();
    expect(GoViralWeeklyBriefSchema.safeParse({
      ...brief,
      opportunities: [{ ...brief.opportunities[0]!, id: "GV-2026-08-03-O1" }]
    }).success).toBe(false);
  });

  it("counts the desks the trend calls named, and claims none when no call named one", () => {
    const withCalls = build({
      trends: trends({
        signals: {
          topHashtags: [
            { hashtag: "#ufc", topicSet: "mma", posts: 4, engagementPerHour: 214.4, weekOverWeekDelta: 88.2 },
            { hashtag: "#ai", topicSet: "ai", posts: 2, engagementPerHour: 12, weekOverWeekDelta: null }
          ],
          topFormats: [],
          topAudio: [],
          exploreSections: [],
          perTopicSet: []
        }
      })
    });
    expect(section(withCalls, "players")).toEqual(["ai: 1 call this week.", "mma: 1 call this week."]);
    expect(section(build(), "players")).toEqual(["No call this week named a desk, so no desk is claimed here."]);
  });

  it("predicts only from a measured delta, and forecasts nothing", () => {
    const measured = build({
      trends: trends({
        signals: {
          topHashtags: [
            { hashtag: "#ufc", topicSet: "mma", posts: 4, engagementPerHour: 214.4, weekOverWeekDelta: 88.2 },
            { hashtag: "#ai", topicSet: "ai", posts: 2, engagementPerHour: 12, weekOverWeekDelta: null }
          ],
          topFormats: [],
          topAudio: [],
          exploreSections: [],
          perTopicSet: []
        }
      })
    });
    const lines = section(measured, "predictions");
    expect(lines[0]).toBe("#ufc (mma) is up 88.2 against the previous snapshot, now 214.4 engagements/hour.");
    expect(lines.some((line) => line.includes("#ai"))).toBe(false);
    expect(lines.at(-1)).toContain("Nothing above is a forecast");
    expect(section(build(), "predictions")[0]).toContain("the room predicts nothing this week");
  });

  it("fills Key Lessons from the two best-rated plays and says so when there are none", () => {
    const play = (id: string, effortPersonWeeks: number) => GoViralPlaySchema.parse({
      id,
      title: `Play ${id}`,
      category: "hook",
      ventureId: null,
      summary: "A stored play.",
      readTimeMinutes: 2,
      reach: { band: 6, basis: "estimate", note: "Owner's judgement." },
      impact: 2,
      confidence: 0.5,
      effortPersonWeeks,
      benchmark: null,
      screenshot: null,
      evidenceRefs: [],
      recordedAt: "2026-08-01"
    });
    const brief = build({
      plays: {
        plays: rankPlays([play("play-a", 4), play("play-b", 1), play("play-c", 2)], process.cwd()),
        dropped: 1,
        reason: null
      }
    });
    const lessons = section(brief, "key-lessons");
    expect(lessons).toHaveLength(3);
    expect(lessons[0]).toContain("Play play-b");
    expect(lessons[1]).toContain("Play play-c");
    expect(lessons[2]).toContain("1 stored play did not match goviral-play-library/1");
    expect(section(build(), "key-lessons")[0]).toBe("The play library is on file and holds no play yet.");
    expect(section(build(), "key-lessons")[1]).toContain("A play is added by hand");
  });

  it("derives the reading time from its own word count, and refuses one that does not", () => {
    const brief = build();
    expect(brief.readingTimeMinutes).toBe(readingTimeMinutes(brief.wordCount));
    expect(GoViralWeeklyBriefSchema.safeParse({ ...brief, readingTimeMinutes: 1 }).success).toBe(false);
    expect(readingTimeMinutes(0)).toBe(1);
    expect(readingTimeMinutes(200)).toBe(1);
    expect(readingTimeMinutes(201)).toBe(2);
  });

  it("names the plan it was written beside", () => {
    expect(build().planRef).toBe("state/ventures/goviral/plans/plan-2026-08-10-weekly-brief.json");
    expect(GoViralWeeklyBriefSchema.safeParse({
      ...build(),
      planRef: "state/ventures/goviral/plans/plan-2026-08-03-weekly-brief.json"
    }).success).toBe(false);
  });
});

describe("the rendered brief", () => {
  it("prints the reading time first and then the eight headings in order", () => {
    const brief = build();
    const markdown = renderGoViralBriefMarkdown(brief);
    const lines = markdown.split("\n");
    expect(lines[0]).toBe("# Weekly brief — 2026-08-10");
    expect(lines[2]).toBe(`${brief.readingTimeMinutes} min read · ${brief.wordCount} words at 200 words per minute · status: approved`);
    expect(markdown.split("\n").filter((line) => line.startsWith("## "))).toEqual(
      brief.sections.map((entry) => `## ${entry.heading}`)
    );
    expect(markdown).toContain("It does not authorize publishing, paid ads, outreach or spending.");
  });

  it("names the first numbered opportunity as the week's first move, or says there is none", () => {
    expect(renderGoViralBriefMarkdown(build()).split("\n")[4])
      .toBe("Start here: GV-2026-08-10-O1 — Owner: the cost-per-token piece.");
    expect(renderGoViralBriefMarkdown(build({ contributions: [] })).split("\n")[4])
      .toBe("Nothing is numbered this week, so there is no first thing to do.");
  });
});
