import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  APIFY_MONTHLY_CREDIT_USD,
  APIFY_RUN_RESERVATION_USD,
  MMA_APIFY_MONTHLY_SHARE_USD,
  MMA_APIFY_RUN_RESERVATION_USD,
  currentMonthQuota,
  currentMmaApifyQuota,
  emptyApifyQuota,
  emptyMmaApifyQuota,
  estimateActorUsd,
  loadGoViralSourceRegistry,
  mayRunApify,
  mayRunMmaApify,
  parseMmaApifyApprovals,
  recordMmaActorUsage,
  recordActorUsage,
  runMmaApifySources,
  type GoViralActor
} from "../src/sources/apify.js";
import {
  TREND_ITEM_RETENTION_DAYS,
  buildForMagazines,
  computeAudioSignals,
  computeHashtagSignals,
  engagementPerHour,
  plannedRecipeSteps,
  pruneItems,
  trendEvidenceRefs,
  type TrendItem
} from "../src/sources/goviral-trends.js";
import { mapDatasetRow, stepPayload, stepTopicSets } from "../src/sources/goviral-scout.js";
import { isScoutDay, renderTrendTiebreaker } from "../src/portfolio/run.js";
import { buildGoViralWeeklyBrief } from "../src/portfolio/goviral-brief.js";
import { renderTrendingCandidates } from "../src/edition/curate.js";

const now = new Date("2026-08-10T12:00:00.000Z");

function item(overrides: Partial<TrendItem> = {}): TrendItem {
  return {
    platform: "instagram",
    kind: "reel",
    topicSet: "mma",
    text: "A fight-week clip",
    likes: 100,
    comments: 0,
    reshares: 0,
    postedAt: "2026-08-10T10:00:00.000Z",
    url: "https://example.test/p/1",
    hashtags: ["#mma"],
    audioTitle: null,
    audioArtist: null,
    exploreSection: null,
    ...overrides
  };
}

describe("the Apify quota guard", () => {
  it("refuses without a token, and refuses a run the month's credit cannot cover", () => {
    const empty = emptyApifyQuota("2026-08", now);
    expect(mayRunApify(empty, undefined).allowed).toBe(false);
    expect(mayRunApify(empty, "  ").allowed).toBe(false);
    expect(mayRunApify(empty, "apify_api_test").allowed).toBe(true);

    // The Free plan's $5 is the budget guard, not a preference: a run reserves its worst case
    // up front so it can never start work the credit cannot finish. This is the boundary.
    const nearlySpent = { ...empty, estimatedUsedUsd: APIFY_MONTHLY_CREDIT_USD - APIFY_RUN_RESERVATION_USD + 0.01 };
    const verdict = mayRunApify(nearlySpent, "apify_api_test");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("credit is spent");
    expect(mayRunApify({ ...empty, estimatedUsedUsd: APIFY_MONTHLY_CREDIT_USD - APIFY_RUN_RESERVATION_USD }, "apify_api_test").allowed)
      .toBe(true);
  });

  it("rolls the counter over at the month boundary, because Apify's credit does not roll over", () => {
    const august = recordActorUsage(emptyApifyQuota("2026-08", now), {
      id: "threads-primary",
      actorSlug: "themineworks/threads-scraper",
      credentialEnv: "APIFY_TOKEN",
      pricePer1000Usd: 1,
      freeLimit: "x",
      termsVerdict: "allowed",
      termsNote: "x",
      evidenceUrl: "https://example.test",
      scheduled: true
    } as GoViralActor, 240, now);
    expect(august.estimatedUsedUsd).toBeCloseTo(0.24, 8);
    expect(august.perActorCounts["threads-primary"]).toEqual({ runs: 1, items: 240, estimatedUsd: 0.24 });
    // Same month: carried. Next month: reset, or a September run would be refused for August's
    // spending on credit September was already granted.
    expect(currentMonthQuota(august, "2026-08", now).estimatedUsedUsd).toBeCloseTo(0.24, 8);
    expect(currentMonthQuota(august, "2026-09", now).estimatedUsedUsd).toBe(0);
    expect(currentMonthQuota({ nonsense: true }, "2026-08", now).estimatedUsedUsd).toBe(0);
  });

  it("prices both shapes the registry declares", async () => {
    const registry = await loadGoViralSourceRegistry();
    const perThousand = registry.actors.find((actor) => actor.id === "threads-primary")!;
    const perResult = registry.actors.find((actor) => actor.id === "instagram-explore")!;
    expect(estimateActorUsd(perThousand, 1_000)).toBeCloseTo(1, 8);
    expect(estimateActorUsd(perResult, 120)).toBeCloseTo(0.01 + 0.0039 * 120, 8);
    expect(estimateActorUsd(perResult, 0)).toBeCloseTo(0.01, 8);
  });

  it("keeps the committed recipe inside the free credit, with margin", async () => {
    const registry = await loadGoViralSourceRegistry();
    const monthly = plannedRecipeSteps({ registry, remainingUsd: APIFY_MONTHLY_CREDIT_USD, isFirstScoutOfMonth: true });
    const weekly = plannedRecipeSteps({ registry, remainingUsd: APIFY_MONTHLY_CREDIT_USD, isFirstScoutOfMonth: false });
    // Four scouts a month, one of them carrying the monthly Explore snapshot.
    const worstMonth = monthly.reduce((sum, entry) => sum + entry.estimatedUsd, 0)
      + 3 * weekly.reduce((sum, entry) => sum + entry.estimatedUsd, 0);
    expect(worstMonth).toBeLessThan(APIFY_MONTHLY_CREDIT_USD);
    // The reservation has to cover the biggest single scout, or the guard would wave through a
    // run that then overspends what it reserved.
    expect(monthly.reduce((sum, entry) => sum + entry.estimatedUsd, 0)).toBeLessThanOrEqual(APIFY_RUN_RESERVATION_USD);
    // Steps that need tracked accounts do not run while the owner has named none.
    expect(weekly.some((entry) => entry.step.inputs === "account")).toBe(false);
    // The monthly step is monthly.
    expect(weekly.some((entry) => entry.step.cadence === "monthly")).toBe(false);
  });

  it("drops steps from the end when the month is running hot, rather than refusing everything", async () => {
    const registry = await loadGoViralSourceRegistry();
    const full = plannedRecipeSteps({ registry, remainingUsd: 5, isFirstScoutOfMonth: false });
    const thin = plannedRecipeSteps({ registry, remainingUsd: 0.3, isFirstScoutOfMonth: false });
    expect(thin.length).toBeGreaterThan(0);
    expect(thin.length).toBeLessThan(full.length);
    expect(thin.map((entry) => entry.step.step)).toEqual([...thin.map((entry) => entry.step.step)].sort((a, b) => a - b));
    expect(plannedRecipeSteps({ registry, remainingUsd: 0, isFirstScoutOfMonth: false })).toEqual([]);
  });
});

describe("the approval-gated MMA Apify share", () => {
  const approvals = { account: true, sources: true };
  const actor = {
    actorSlug: "fixture/mma-source",
    actorBuildId: "Abcdefghijk123456",
    purpose: "espn-mma" as const,
    targetHosts: ["example.test"],
    pricing: { model: "pay-per-result" as const, pricePerResultUsd: 0.003, maxRunUsd: 0.09 },
    maxResults: 30,
    expectedMonthlyUsd: 0.36,
    cadence: "weekly" as const,
    pricingEvidenceUrl: "https://apify.com/fixture/mma-source",
    input: { maxResults: 30 }
  };

  it("requires both owner approvals and the token before any spend path", () => {
    const quota = emptyMmaApifyQuota("2026-08", now);
    const pending = mayRunMmaApify({ quota, approvals: { account: false, sources: false }, token: "token", sharedAccountUsedUsd: 0 });
    expect(pending).toEqual({
      allowed: false,
      reason: "MMA Apify sources are waiting for APIFY-ACCOUNT-001 and APIFY-MMA-SOURCES-001; no actor ran and nothing was spent."
    });
    expect(mayRunMmaApify({ quota, approvals, token: undefined, sharedAccountUsedUsd: 0 }).allowed).toBe(false);
    expect(mayRunMmaApify({ quota, approvals, token: "token", sharedAccountUsedUsd: 0 }).allowed).toBe(true);
  });

  it("keeps both the $3 MMA share and the shared $5 account ceiling", () => {
    const quota = emptyMmaApifyQuota("2026-08", now);
    expect(mayRunMmaApify({
      quota: { ...quota, estimatedUsedUsd: MMA_APIFY_MONTHLY_SHARE_USD - MMA_APIFY_RUN_RESERVATION_USD + 0.01 },
      approvals,
      token: "token",
      sharedAccountUsedUsd: 0
    }).allowed).toBe(false);
    expect(mayRunMmaApify({
      quota,
      approvals,
      token: "token",
      sharedAccountUsedUsd: APIFY_MONTHLY_CREDIT_USD - MMA_APIFY_RUN_RESERVATION_USD + 0.01
    }).allowed).toBe(false);
  });

  it("records bounded actor usage and rolls the MMA ledger monthly", () => {
    const quota = recordMmaActorUsage(emptyMmaApifyQuota("2026-08", now), "espn-mma", actor, 20, now, 1.2);
    expect(quota).toMatchObject({ shareCapUsd: 3, estimatedUsedUsd: 0.06, sharedAccountUsedUsd: 1.2 });
    expect(quota.perActorCounts["espn-mma"]).toEqual({ runs: 1, items: 20, estimatedUsd: 0.06 });
    expect(currentMmaApifyQuota(quota, "2026-09", new Date("2026-09-01T00:00:00.000Z"))).toMatchObject({ month: "2026-09", estimatedUsedUsd: 0 });
  });

  it("parses only checked approval lines", () => {
    expect(parseMmaApifyApprovals("- [x] HUMAN_APPROVAL APIFY-ACCOUNT-001\n- [ ] HUMAN_APPROVAL APIFY-MMA-SOURCES-001")).toEqual({ account: true, sources: false });
  });

  it("is a one-sentence $0 no-op while approvals are pending", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-apify-pending-"));
    const runner = vi.fn();
    try {
      const result = await runMmaApifySources({
        root,
        date: "2026-08-09",
        now,
        inbox: "- [ ] HUMAN_APPROVAL APIFY-ACCOUNT-001\n- [ ] HUMAN_APPROVAL APIFY-MMA-SOURCES-001",
        token: "token-that-must-not-be-used",
        sources: [{ id: "espn-mma", state: "proposed", termsVerdict: "allowed", apify: actor }],
        actorRunner: runner
      });
      expect(result).toEqual({
        results: [{
          sourceId: "apify-mma",
          status: "skipped",
          reason: "MMA Apify sources are waiting for APIFY-ACCOUNT-001 and APIFY-MMA-SOURCES-001; no actor ran and nothing was spent.",
          items: []
        }],
        artifactPaths: []
      });
      expect(runner).not.toHaveBeenCalled();
      await expect(readFile(path.join(root, "mma/source-quota/apify.json"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes the $3 ledger only after approvals, token and shared-credit checks pass", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-apify-approved-"));
    const runner = vi.fn(async () => [{ id: "row-1" }, { id: "row-2" }]);
    try {
      const result = await runMmaApifySources({
        root,
        date: "2026-08-09",
        now,
        inbox: "- [x] HUMAN_APPROVAL APIFY-ACCOUNT-001\n- [x] HUMAN_APPROVAL APIFY-MMA-SOURCES-001",
        token: "fixture-token",
        sources: [{ id: "espn-mma", state: "proposed", termsVerdict: "allowed", apify: actor }],
        usageFetcher: async () => 1.2,
        actorRunner: runner
      });
      expect(result.artifactPaths).toEqual(["mma/source-quota/apify.json"]);
      expect(result.results[0]).toMatchObject({ sourceId: "espn-mma", status: "success", items: [{ id: "row-1" }, { id: "row-2" }] });
      expect(runner).toHaveBeenCalledWith(expect.objectContaining({ maxTotalChargeUsd: 0.09 }));
      expect(JSON.parse(await readFile(path.join(root, "mma/source-quota/apify.json"), "utf8"))).toMatchObject({
        schemaVersion: "mma-apify-quota/1",
        shareCapUsd: 3,
        sharedAccountUsedUsd: 1.2,
        estimatedUsedUsd: 0.006
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("trend signals", () => {
  it("scores velocity rather than volume, and refuses to guess when a post has no timestamp", () => {
    const peaked = item({ likes: 10_000, postedAt: "2026-07-20T12:00:00.000Z" });
    const rising = item({ likes: 400, postedAt: "2026-08-10T10:00:00.000Z" });
    expect(engagementPerHour(rising, now)).toBeGreaterThan(engagementPerHour(peaked, now));
    // No timestamp is not "posted a second ago" — that would make every undated post the
    // week's biggest trend.
    expect(engagementPerHour(item({ postedAt: null }), now)).toBe(0);
    // Nor is a future timestamp a division by almost zero.
    expect(engagementPerHour(item({ likes: 100, postedAt: "2026-08-10T13:00:00.000Z" }), now)).toBe(100);
  });

  it("carries a week-over-week delta only where there is something to compare against", () => {
    const first = computeHashtagSignals({ items: [item({ hashtags: ["#UFC"] })], previous: [], now });
    expect(first[0]).toMatchObject({ hashtag: "#ufc", posts: 1, weekOverWeekDelta: null });
    const second = computeHashtagSignals({
      items: [item({ hashtags: ["#UFC"], likes: 200 }), item({ hashtags: ["#oktagon"] })],
      previous: first,
      now
    });
    expect(second.find((signal) => signal.hashtag === "#ufc")?.weekOverWeekDelta).toBeCloseTo(50, 4);
    expect(second.find((signal) => signal.hashtag === "#oktagon")?.weekOverWeekDelta).toBeNull();
  });

  it("calls a song a trend only once more than one reel uses it", () => {
    const once = computeAudioSignals([item({ audioTitle: "Song", audioArtist: "A" })]);
    expect(once).toEqual([]);
    const twice = computeAudioSignals([
      item({ audioTitle: "Song", audioArtist: "A" }),
      item({ audioTitle: "song", audioArtist: "A" }),
      item({ kind: "post", audioTitle: "Song", audioArtist: "A" })
    ]);
    expect(twice).toEqual([{ title: "Song", artist: "A", reels: 2 }]);
  });

  it("prunes raw items at thirty days and keeps nothing it cannot date", () => {
    const kept = item({ postedAt: "2026-08-01T12:00:00.000Z" });
    const old = item({ postedAt: "2026-06-01T12:00:00.000Z" });
    const undated = item({ postedAt: null });
    expect(pruneItems([kept, old, undated], now)).toEqual([kept]);
    const edge = item({ postedAt: new Date(now.getTime() - TREND_ITEM_RETENTION_DAYS * 86_400_000 + 1_000).toISOString() });
    expect(pruneItems([edge], now)).toEqual([edge]);
  });

  it("names evidence refs only for actors that actually returned something", () => {
    expect(trendEvidenceRefs("2026-08-10", [
      { actorId: "instagram-hashtags", step: 2, status: "success", reason: null, count: 12, estimatedUsd: 0.01 },
      { actorId: "threads-primary", step: 3, status: "failed", reason: "boom", count: 0, estimatedUsd: 0 },
      { actorId: "instagram-explore", step: 5, status: "success", reason: null, count: 0, estimatedUsd: 0.01 }
    ])).toEqual(["source:apify:instagram:2026-08-10"]);
    expect(trendEvidenceRefs("2026-08-10", [])).toEqual([]);
  });

  it("hands the magazines numbers and refs, split by the topic set that produced them", () => {
    const hashtags = computeHashtagSignals({
      items: [item({ topicSet: "mma", hashtags: ["#ufc"] }), item({ topicSet: "dneskai", hashtags: ["#ai"] })],
      previous: [],
      now
    });
    const block = buildForMagazines({ hashtags, refs: ["source:apify:instagram:2026-08-10"] });
    expect(block.mma.map((entry) => entry.topic)).toEqual(["#ufc"]);
    expect(block.ai.map((entry) => entry.topic)).toEqual(["#ai"]);
    // A topic a desk cannot check is a rumour, so every entry carries its ref.
    expect(block.mma.every((entry) => entry.refs.length > 0)).toBe(true);
  });
});

describe("the scraped-row boundary", () => {
  it("keeps the bounded fields and drops everything else, including anything republishable", () => {
    const mapped = mapDatasetRow({
      row: {
        caption: `#UFC ${"very long ".repeat(60)}`,
        url: "https://example.test/p/2",
        likesCount: 12,
        commentsCount: 3,
        timestamp: 1_786_000_000,
        ownerUsername: "someone",
        ownerFullName: "Some One",
        displayUrl: "https://example.test/photo.jpg",
        musicInfo: { song_name: "Track", artist_name: "Artist" }
      },
      step: { step: 1, actorId: "instagram-popular-reels", mode: "reels", inputs: "keyword", perInput: 64, maxResults: 192, cadence: "weekly" },
      topicSet: "mma"
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.text.length).toBeLessThanOrEqual(280);
    expect(mapped!.hashtags).toContain("#ufc");
    expect(mapped!.likes).toBe(12);
    expect(mapped!.audioTitle).toBe("Track");
    // The handle, the display name and the image URL are the three things that would let this
    // system republish somebody's post. None of them survives the mapper.
    expect(JSON.stringify(mapped)).not.toContain("someone");
    expect(JSON.stringify(mapped)).not.toContain("Some One");
    expect(JSON.stringify(mapped)).not.toContain("photo.jpg");
  });

  it("drops a row with neither text nor a URL, which is a partial page rather than an observation", () => {
    const step = { step: 2, actorId: "instagram-hashtags", mode: "hashtag" as const, inputs: "hashtag" as const, perInput: 25, maxResults: 300, cadence: "weekly" as const };
    expect(mapDatasetRow({ row: { likesCount: 5 }, step, topicSet: "mma" })).toBeNull();
    expect(mapDatasetRow({ row: { url: "https://example.test/p/3" }, step, topicSet: "mma" })).not.toBeNull();
  });

  it("caps every actor input twice, per input and per step", async () => {
    const registry = await loadGoViralSourceRegistry();
    const step = registry.recipe.find((entry) => entry.inputs === "hashtag")!;
    const payload = stepPayload({ step, registry, topicSet: "mma" });
    expect(payload).toMatchObject({ resultsLimit: step.perInput, maxResults: step.maxResults });
    // A step with no inputs to work from produces no call at all, rather than an unbounded one.
    expect(stepPayload({ step, registry, topicSet: "nope" })).toBeNull();
    const accountStep = registry.recipe.find((entry) => entry.inputs === "account")!;
    expect(stepPayload({ step: accountStep, registry, topicSet: null })).toBeNull();
  });

  it("keeps the Door Money free-only set out of every Apify payload", async () => {
    const registry = await loadGoViralSourceRegistry();
    expect(registry.topicSets["door-money"]).toEqual({
      label: "Door Money (book and music stories)",
      sourceMode: "free",
      keywords: ["BookTok", "author marketing", "hip-hop culture", "music industry stories"],
      hashtags: ["#BookTok", "#AuthorMarketing", "#HipHopCulture", "#MusicIndustryStories"]
    });
    for (const step of registry.recipe) {
      expect(stepTopicSets(step, registry)).not.toContain("door-money");
      expect(stepPayload({ step, registry, topicSet: "door-money" })).toBeNull();
    }
    const raw = JSON.parse(await readFile(path.join(process.cwd(), "../config/goviral-sources.json"), "utf8")) as {
      actors: unknown;
      recipe: unknown;
    };
    const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(digest(raw.actors)).toBe("87e3a34b10ea0ae47c85f759247c386faea8f08c7e7bca0e95e1c5a0108e0354");
    expect(digest(raw.recipe)).toBe("cef3895290673880c9c27658212a892a9341943feef5526733a01cae365f78f5");
    expect(APIFY_MONTHLY_CREDIT_USD).toBe(5);
    expect(APIFY_RUN_RESERVATION_USD).toBe(1.4);
  });
});

describe("the Monday gate", () => {
  it("opens the room on Prague Mondays and on no other day", () => {
    // 2026-08-10 is a Monday.
    expect(isScoutDay("2026-08-10")).toBe(true);
    expect(isScoutDay("2026-08-17")).toBe(true);
    for (const date of ["2026-08-09", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"]) {
      expect(isScoutDay(date), date).toBe(false);
    }
    // Winter, when Prague is UTC+1 rather than UTC+2.
    expect(isScoutDay("2026-01-05")).toBe(true);
    expect(isScoutDay("2026-01-06")).toBe(false);
    expect(isScoutDay("not-a-date")).toBe(false);
  });
});

describe("the weekly brief", () => {
  const contributions = [
    { agent: "PULSE", summary: "Two calls this week and one skip.", evidenceRefs: ["source:apify:instagram:2026-08-10"], idea: { title: "Owner: the cost-per-token piece", summary: "Write the piece about what an agent day actually costs." } },
    { agent: "SCOUT", summary: "#ufc is climbing.", evidenceRefs: ["source:apify:instagram:2026-08-10"], idea: null },
    { agent: "ANGLE", summary: "One of these is MMA Files' problem.", evidenceRefs: [], idea: { title: "MMA Files: fight-week explainer", summary: "The card is trending; the desk has the sources for a preview." } },
    { agent: "AUDIT", summary: "No posting or spend proposed.", evidenceRefs: [], idea: null }
  ];

  it("writes a plan for goviral, and the plan path follows the venture that wrote it", () => {
    const brief = buildGoViralWeeklyBrief({ date: "2026-08-10", trends: null, contributions, vetoed: false });
    expect(brief.ventureId).toBe("goviral");
    expect(brief.id).toBe("plan-2026-08-10-weekly-brief");
    expect(brief.originMeetingRef).toBe("2026-08-10-gv-brief");
    expect(brief.status).toBe("approved");
    // Both seat ideas reach the brief; the two seats that returned none add nothing.
    expect(brief.tactics.filter((tactic) => tactic.assetsNeeded.includes("owner review"))).toHaveLength(2);
    expect(brief.postable_assets).toHaveLength(1);
  });

  it("says a quiet week was quiet rather than inventing a call", () => {
    const quiet = buildGoViralWeeklyBrief({
      date: "2026-08-10",
      trends: null,
      contributions: [{ agent: "PULSE", summary: "Nothing this week's data supports.", evidenceRefs: [], idea: null }],
      vetoed: false
    });
    expect(quiet.tactics).toHaveLength(1);
    expect(quiet.tactics[0]?.description).toContain("no trend call");
    expect(quiet.tactics[0]?.description).toContain("No scout data was available");
  });

  it("stays a draft when AUDIT vetoed, because a veto is about the calls themselves", () => {
    const vetoed = buildGoViralWeeklyBrief({ date: "2026-08-10", trends: null, contributions, vetoed: true });
    expect(vetoed.status).toBe("draft");
  });

  it("says plainly when it is working from an older snapshot", () => {
    const stale = buildGoViralWeeklyBrief({
      date: "2026-08-17",
      trends: {
        schemaVersion: "goviral-trends/1",
        date: "2026-08-10",
        generatedAt: "2026-08-10T11:00:00.000Z",
        sourceResults: [],
        freeSignals: [],
        items: [],
        signals: { topHashtags: [], topFormats: [], topAudio: [], exploreSections: [], perTopicSet: [] },
        forMagazines: { ai: [], mma: [] }
      },
      contributions,
      vetoed: false
    });
    expect(JSON.stringify(stale)).toContain("working from the 2026-08-10 snapshot");
  });
});

describe("trend injection into the magazines", () => {
  it("carries the numbers and the tiebreaker rule together, or says nothing at all", () => {
    expect(renderTrendTiebreaker(undefined)).toBe("");
    expect(renderTrendTiebreaker([])).toBe("");
    expect(renderTrendingCandidates([])).toBe("");
    const desk = renderTrendTiebreaker([{ topic: "#ufc", engagementPerHour: 214.4, weekOverWeekDelta: 88.2 }]);
    expect(desk).toContain("214.4 engagements/hour");
    expect(desk).toContain("+88.2 on last week");
    // The whole reason the block is allowed to exist.
    expect(desk).toContain("tiebreaker between equally sourced candidates, never a substitute for sourcing");
    const editor = renderTrendingCandidates([{ topic: "#ai", engagementPerHour: 12, weekOverWeekDelta: null }]);
    expect(editor).toContain("12.0 engagements/hour");
    expect(editor).not.toContain("on last week");
    expect(editor).toContain("never a reason to pick a story the packet does not support");
  });
});
