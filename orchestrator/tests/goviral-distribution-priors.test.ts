import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { composePortfolioContext } from "../src/portfolio/run.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";
import {
  GoViralDistributionPriorsSchema,
  czechAudiencePrior,
  distributionPlatform,
  loadGoViralDistributionPriors,
  rankedSignals,
  renderDistributionPriorsBrief,
  signalFit
} from "../src/ventures/goviral/distribution-priors.js";
import {
  GoViralGrowthLoopsSchema,
  growthLoopFor,
  loadGoViralGrowthLoops,
  loopContribution,
  renderGrowthLoopsBrief
} from "../src/ventures/goviral/growth-loops.js";
import { rankPlayRatings, rateGoViralPlay, type GoViralPlay } from "../src/ventures/goviral/play-rating.js";

const priors = await loadGoViralDistributionPriors();
const loops = await loadGoViralGrowthLoops();

function play(overrides: Partial<GoViralPlay> = {}): GoViralPlay {
  return {
    id: "play-fixture",
    ventureId: "caught-up",
    title: "A fixture play",
    platform: "instagram",
    intendedSignals: ["send"],
    loopStageIds: ["share"],
    estimatedCostUsd: 0,
    ...overrides
  };
}

describe("Czech distribution priors", () => {
  it("carries the AMI Digital Index 2026 readings with their sample and their source", () => {
    const study = priors.audienceStudy;
    expect(study.sampleSize).toBe(1_013);
    expect(study.claimKind).toBe("representative-survey");
    expect(study.evidenceUrl).toContain("mediar.cz");
    expect(study.readings.find((reading) => reading.id === "daily-minutes")?.value).toBe(137);
    expect(study.readings.find((reading) => reading.id === "never-react-publicly")?.value).toBe(48);
    expect(study.readings.find((reading) => reading.id === "share-privately")?.value).toBe(42);
  });

  it("keeps the measured Czech platform shares the study published", () => {
    expect(distributionPlatform(priors, "facebook")?.czechRegularUsePercent).toBe(67);
    expect(distributionPlatform(priors, "instagram")?.czechRegularUsePercent).toBe(47);
    expect(distributionPlatform(priors, "tiktok")?.czechRegularUsePercent).toBe(18);
    expect(distributionPlatform(priors, "x")?.czechRegularUsePercent).toBe(7);
  });

  it("records an unpublished figure as an absence rather than a zero", () => {
    for (const id of ["threads", "linkedin", "youtube"]) {
      const platform = distributionPlatform(priors, id);
      expect(platform?.czechRegularUsePercent, id).toBeNull();
      expect(czechAudiencePrior(platform!), id).toBeNull();
      expect(platform?.czechReadingNote, id).toMatch(/no .*figure|no percentage/iu);
    }
  });

  it("keeps Facebook in the plans and out of execution, and treats X as negligible", () => {
    expect(distributionPlatform(priors, "facebook")?.posture).toBe("plan-only");
    expect(distributionPlatform(priors, "facebook")?.postureReason).toMatch(/no channel, credential or approved scope/iu);
    expect(distributionPlatform(priors, "x")?.posture).toBe("negligible");
    expect(distributionPlatform(priors, "tiktok")?.reachTrend).toBe("declining");
  });

  it("separates what Meta documents from what the industry claims", () => {
    const instagram = distributionPlatform(priors, "instagram")!;
    const documented = instagram.claims.filter((claim) => claim.claimKind === "platform-documented");
    const estimated = instagram.claims.filter((claim) => claim.claimKind === "industry-estimate");
    expect(documented.every((claim) => claim.evidenceUrl?.startsWith("https://transparency.meta.com/"))).toBe(true);
    // The 40-60% originality lift is the number a room would most like to quote. It stays
    // labelled as somebody else's estimate and is not a field any arithmetic here reads.
    expect(estimated.some((claim) => claim.statement.includes("40-60"))).toBe(true);
    expect(instagram.claims.some((claim) => claim.claimKind === "platform-stated" && claim.statement.includes("30 April 2026"))).toBe(true);
  });

  it("weights sends above saves and saves below the documented mechanics", () => {
    expect(rankedSignals(priors)[0]).toBe("send");
    const send = priors.signals.find((signal) => signal.id === "send")!;
    const save = priors.signals.find((signal) => signal.id === "save")!;
    const like = priors.signals.find((signal) => signal.id === "like")!;
    expect(send.claimKind).toBe("platform-documented");
    expect(save.claimKind).toBe("industry-estimate");
    expect(send.weight).toBeGreaterThan(save.weight);
    expect(save.weight).toBeGreaterThan(like.weight);
  });

  it("refuses a claim with neither a URL nor a reason for having none", () => {
    const broken = structuredClone(priors) as Record<string, unknown>;
    const platforms = broken.platforms as Array<{ claims: Array<Record<string, unknown>> }>;
    platforms[0]!.claims[0] = { statement: "Something nobody published.", claimKind: "industry-estimate", evidenceUrl: null };
    expect(GoViralDistributionPriorsSchema.safeParse(broken).success).toBe(false);
  });

  it("refuses signal weights that are not a distribution", () => {
    const broken = structuredClone(priors) as { signals: Array<{ weight: number }> };
    broken.signals[0]!.weight += 0.1;
    expect(GoViralDistributionPriorsSchema.safeParse(broken).success).toBe(false);
  });

  it("discounts a signal the platform does not document instead of refusing it", () => {
    const threads = distributionPlatform(priors, "threads")!;
    const documented = signalFit(priors, threads, ["reply"]);
    const claimed = signalFit(priors, threads, ["save"]);
    expect(documented).toBe(1);
    expect(claimed).toBe(priors.undocumentedSignalFactor);
    expect(signalFit(priors, threads, [])).toBeNull();
  });

  it("renders a packet block short enough to sit beside the scout snapshot", () => {
    const packet = renderDistributionPriorsBrief(priors);
    expect(packet).toContain("n=1013");
    expect(packet).toContain("no published Czech figure");
    expect(packet).toMatch(/never state a reach, impression or follower number/u);
    // The packet is capped at 18,000 characters it shares with the scout snapshot, the owner
    // profile and the idea index. A priors block that crowds those out costs the room its data.
    expect(packet.length).toBeLessThan(3_500);
  });

  it("renders a full brief that names every claim with its kind", () => {
    const full = renderDistributionPriorsBrief(priors, { detail: "full" });
    expect(full).toContain("[platform-documented]");
    expect(full).toContain("[platform-stated]");
    expect(full).toContain("[industry-estimate]");
    expect(full).toContain("[house-assumption]");
    expect(full).toContain("(no source URL — see the note in config)");
    expect(full.length).toBeGreaterThan(renderDistributionPriorsBrief(priors).length);
  });
});

describe("growth loops", () => {
  it("gives every venture in the registry either a loop or a recorded reason", async () => {
    const registry = JSON.parse(
      await readFile(path.join(repoRoot, "config", "ventures.json"), "utf8")
    ) as { ventures: Array<{ id: string }> };
    const covered = new Set([
      ...loops.loops.map((loop) => loop.ventureId),
      ...loops.unrecordedVentures.map((entry) => entry.ventureId)
    ]);
    for (const venture of registry.ventures) {
      expect(covered.has(venture.id), `${venture.id} is in neither loops nor unrecordedVentures`).toBe(true);
    }
  });

  it("refuses a chain of stages that does not close", () => {
    const broken = structuredClone(loops) as { loops: Array<{ stages: Array<{ id: string; feedsStageId: string }> }> };
    const stages = broken.loops[0]!.stages;
    stages[stages.length - 1]!.feedsStageId = stages[stages.length - 1]!.id;
    expect(GoViralGrowthLoopsSchema.safeParse(broken).success).toBe(false);
  });

  it("refuses a stage that cannot run and does not say what is missing", () => {
    const broken = structuredClone(loops) as { loops: Array<{ stages: Array<{ status: string; blockedBy?: string }> }> };
    const stage = broken.loops[0]!.stages.find((candidate) => candidate.status !== "live")!;
    delete stage.blockedBy;
    expect(GoViralGrowthLoopsSchema.safeParse(broken).success).toBe(false);
  });

  it("keeps the DNESKAi newsletter stage visible as blocked rather than dropping it", () => {
    const loop = growthLoopFor(loops, "caught-up")!;
    const capture = loop.stages.find((stage) => stage.id === "capture")!;
    expect(capture.status).toBe("blocked");
    expect(capture.blockedBy).toMatch(/no email provider/iu);
    expect(capture.ownerAction).toContain("NEEDED.md");
  });

  it("keeps Facebook in the MMA Files plan as a stage nothing can execute", () => {
    const loop = growthLoopFor(loops, "mma-files")!;
    const share = loop.stages.find((stage) => stage.surface === "facebook")!;
    expect(share.status).toBe("blocked");
    expect(share.blockedBy).toMatch(/no Facebook channel/iu);
  });

  it("records no loop for the held and paused ventures, with the reason", () => {
    const kvorum = loops.unrecordedVentures.find((entry) => entry.ventureId === "kvorum");
    expect(kvorum?.reason).toMatch(/countersigned/u);
    expect(growthLoopFor(loops, "kvorum")).toBeNull();
  });

  it("measures loop fit over live stages and names the blocked ones", () => {
    const loop = growthLoopFor(loops, "caught-up")!;
    const both = loopContribution(loop, ["share", "discover"]);
    expect(both.liveStages).toBe(3);
    expect(both.fit).toBeCloseTo(2 / 3, 10);
    expect(both.closesLoop).toBe(true);
    const blocked = loopContribution(loop, ["capture", "nowhere"]);
    expect(blocked.fit).toBe(0);
    expect(blocked.blockedStages).toEqual(["capture"]);
    expect(blocked.unknownStages).toEqual(["nowhere"]);
    expect(blocked.closesLoop).toBe(false);
  });

  it("shows the blocked stages instead of hiding them, in both renderings", () => {
    const packet = renderGrowthLoopsBrief(loops);
    expect(packet).toContain("capture[blocked](newsletter)");
    expect(packet).toContain("Stopped — capture: No email provider");
    expect(packet).toContain("kvorum");
    expect(packet.length).toBeLessThan(3_000);
    const full = renderGrowthLoopsBrief(loops, { detail: "full" });
    expect(full).toContain("[blocked:");
    expect(full).toContain("Ventures with no loop, and why:");
    expect(full.length).toBeGreaterThan(packet.length);
  });
});

describe("the play scorer", () => {
  it("rates a send-shaped Instagram play that turns the loop", () => {
    const rating = rateGoViralPlay({ play: play(), priors, loop: growthLoopFor(loops, "caught-up") });
    expect(rating.verdict).toBe("lead");
    expect(rating.score).not.toBeNull();
    expect(rating.components.map((component) => component.name)).toEqual(["czech-audience", "signal-fit", "loop-fit"]);
    expect(rating.components.every((component) => component.contribution !== null)).toBe(true);
  });

  it("renormalizes an unmeasured component away instead of scoring it zero", () => {
    // Titty Tuesdays has no recorded loop, so loop fit is an absence rather than a failure.
    const audienceOnly = rateGoViralPlay({
      play: play({ ventureId: "titty-tuesdays", intendedSignals: [], loopStageIds: [] }),
      priors,
      loop: null
    });
    const signalOnly = rateGoViralPlay({
      play: play({ ventureId: "titty-tuesdays", platform: "threads", intendedSignals: ["reply"], loopStageIds: [] }),
      priors,
      loop: null
    });
    expect(audienceOnly.components.find((component) => component.name === "loop-fit")?.contribution).toBeNull();
    expect(audienceOnly.components.find((component) => component.name === "signal-fit")?.contribution).toBeNull();
    // Instagram's 47% as the only measured component is a 47, not a 16.
    expect(audienceOnly.score).toBe(47);
    expect(signalOnly.components.find((component) => component.name === "czech-audience")?.rawValue).toBeNull();
    // A perfect documented signal fit and nothing else measurable is a 100, not a 35.
    expect(signalOnly.score).toBe(100);
    expect(signalOnly.notes.some((note) => note.includes("published no Threads figure"))).toBe(true);
  });

  it("turns nothing when every stage that could carry the play is held", () => {
    const rating = rateGoViralPlay({
      play: play({ ventureId: "webdev-signal", intendedSignals: ["send"], loopStageIds: ["post", "send"] }),
      priors,
      loop: growthLoopFor(loops, "webdev-signal")
    });
    expect(rating.components.find((component) => component.name === "loop-fit")?.rawValue).toBe(0);
    expect(rating.notes.some((note) => note.includes("post, send") && note.includes("do not run"))).toBe(true);
  });

  it("skips X whatever the play is", () => {
    const rating = rateGoViralPlay({
      play: play({ platform: "x", intendedSignals: ["send", "reply"] }),
      priors,
      loop: growthLoopFor(loops, "caught-up")
    });
    expect(rating.verdict).toBe("skip");
    expect(rating.posture).toBe("negligible");
  });

  it("marks a Facebook play plan-only and an untested LinkedIn play test-first", () => {
    expect(rateGoViralPlay({
      play: play({ ventureId: "mma-files", platform: "facebook", loopStageIds: ["share"] }),
      priors,
      loop: growthLoopFor(loops, "mma-files")
    }).verdict).toBe("plan-only");
    expect(rateGoViralPlay({
      play: play({ platform: "linkedin", intendedSignals: ["watch-time"], loopStageIds: [] }),
      priors,
      loop: growthLoopFor(loops, "caught-up")
    }).verdict).toBe("test-first");
  });

  it("sends a play that would cost money to the owner instead of pricing it", () => {
    const rating = rateGoViralPlay({ play: play({ estimatedCostUsd: 12 }), priors, loop: growthLoopFor(loops, "caught-up") });
    expect(rating.verdict).toBe("needs-approval");
    expect(rating.spendApprovalRequired).toBe(true);
    expect(rating.notes.some((note) => note.includes("state/INBOX.md") && note.includes("HUMAN_APPROVAL"))).toBe(true);
  });

  it("fails closed on a surface the priors have never heard of", () => {
    const rating = rateGoViralPlay({ play: play({ platform: "snapchat" }), priors, loop: growthLoopFor(loops, "caught-up") });
    expect(rating.verdict).toBe("unknown-surface");
    expect(rating.score).toBeNull();
    expect(rating.components).toEqual([]);
  });

  it("says a play is aimed at a stage that does not run", () => {
    const rating = rateGoViralPlay({
      play: play({ loopStageIds: ["capture"] }),
      priors,
      loop: growthLoopFor(loops, "caught-up")
    });
    expect(rating.notes.some((note) => note.includes("capture") && note.includes("do not run"))).toBe(true);
    expect(rating.components.find((component) => component.name === "loop-fit")?.rawValue).toBe(0);
  });

  it("ranks best first and puts an unscored play last", () => {
    const ranked = rankPlayRatings([
      rateGoViralPlay({ play: play({ id: "play-unknown", platform: "snapchat" }), priors, loop: null }),
      rateGoViralPlay({ play: play({ id: "play-weak", platform: "tiktok", intendedSignals: ["like"], loopStageIds: [] }), priors, loop: null }),
      rateGoViralPlay({ play: play({ id: "play-strong" }), priors, loop: growthLoopFor(loops, "caught-up") })
    ]);
    expect(ranked.map((rating) => rating.playId)).toEqual(["play-strong", "play-weak", "play-unknown"]);
  });
});

describe("the Monday room's packet", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("carries both blocks even when the state root is empty", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "goviral-priors-"));
    roots.push(root);
    const packet = await composePortfolioContext("gv-brief", root, "2026-09-21", await loadVentureRegistry());
    expect(packet.text).toContain("Czech distribution priors, verified");
    expect(packet.text).toContain("Growth loops, verified");
    expect(packet.text).toContain("posture negligible");
    expect(packet.text).toMatch(/never state a reach, impression or follower number/u);
    // The packet is truncated at 18,000 characters from the tail, and both blocks sit above the
    // trend signals so that a tight week costs readings rather than half a platform description.
    expect(packet.text.length).toBeLessThanOrEqual(18_000);
    expect(packet.text.indexOf("Czech distribution priors")).toBeLessThan(packet.text.indexOf("Ideas this room has already recorded"));
  });
});
