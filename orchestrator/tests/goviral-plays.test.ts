import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GOVIRAL_REACH_BANDS,
  GoViralPlayLibrarySchema,
  GoViralPlaySchema,
  RICE_CONFIDENCE_VALUES,
  riceScore
} from "../src/contracts/goviral-play-library.js";
import {
  PLAY_LIBRARY_STATE_PATH,
  loadGoViralPlayLibrary,
  rankPlays,
  renderPlayLine
} from "../src/portfolio/goviral-plays.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "goviral-plays-"));
  roots.push(root);
  return root;
}

function play(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "play-open-loop",
    title: "Open on the number the piece has not explained yet",
    category: "hook",
    ventureId: "caught-up",
    summary: "The first line states a figure the piece does not resolve until later.",
    readTimeMinutes: 3,
    reach: { band: 6, basis: "estimate", note: "No reading behind this; the owner's judgement." },
    impact: 2,
    confidence: 0.8,
    effortPersonWeeks: 0.5,
    benchmark: {
      metric: "completion rate",
      unit: "%",
      direction: "higher-is-better",
      baseline: 41,
      achieved: 58,
      measuredOver: "eleven pieces",
      sourceRef: "owner:2026-08-20"
    },
    screenshot: null,
    evidenceRefs: ["owner:2026-08-20"],
    recordedAt: "2026-08-24",
    ...overrides
  };
}

async function writeLibrary(root: string, plays: readonly unknown[]): Promise<void> {
  const target = path.join(root, PLAY_LIBRARY_STATE_PATH);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({
    schemaVersion: "goviral-play-library/1",
    ventureId: "goviral",
    reachScale: "reach-band/1",
    updatedAt: "2026-08-24",
    plays
  }));
}

describe("the play contract", () => {
  it("scores RICE as the band, the impact and the confidence over the effort", () => {
    // 6 x 2 x 0.8 / 0.5 = 19.2, and one decimal is all a ten-step band can honestly carry.
    expect(riceScore(GoViralPlaySchema.parse(play()))).toBe(19.2);
    expect(riceScore(GoViralPlaySchema.parse(play({ effortPersonWeeks: 3 })))).toBe(3.2);
  });

  it("refuses a play that claims confidence it has no benchmark for", () => {
    expect(GoViralPlaySchema.safeParse(play({ benchmark: null, confidence: 0.5 })).success).toBe(true);
    expect(GoViralPlaySchema.safeParse(play({ benchmark: null, confidence: 0.8 })).success).toBe(false);
    expect(GoViralPlaySchema.safeParse(play({ benchmark: null, confidence: 1 })).success).toBe(false);
  });

  it("refuses a measured reach band with nothing to have measured it from", () => {
    expect(GoViralPlaySchema.safeParse(play({
      reach: { band: 4, basis: "measured", note: "From the reading." },
      evidenceRefs: []
    })).success).toBe(false);
    expect(GoViralPlaySchema.safeParse(play({
      reach: { band: 4, basis: "measured", note: "From the reading." },
      evidenceRefs: ["owner:2026-08-20"]
    })).success).toBe(true);
  });

  it("refuses a benchmark the play did not beat, in whichever direction is better", () => {
    const beaten = (overrides: Record<string, unknown>) => GoViralPlaySchema.safeParse(play({
      benchmark: { ...(play().benchmark as Record<string, unknown>), ...overrides }
    })).success;
    expect(beaten({ baseline: 41, achieved: 58 })).toBe(true);
    expect(beaten({ baseline: 58, achieved: 41 })).toBe(false);
    expect(beaten({ direction: "lower-is-better", baseline: 58, achieved: 41 })).toBe(true);
    expect(beaten({ direction: "lower-is-better", baseline: 41, achieved: 58 })).toBe(false);
    expect(beaten({ baseline: 41, achieved: 41 })).toBe(false);
  });

  it("keeps a screenshot inside the library's own folder and out of public view", () => {
    const screenshot = {
      path: "state/ventures/goviral/plays/screenshots/open-loop.png",
      alt: "The first line of the piece.",
      capturedAt: "2026-08-20",
      subject: "own-surface",
      visibility: "admin-only"
    };
    expect(GoViralPlaySchema.safeParse(play({ screenshot })).success).toBe(true);
    // A capture of somebody else's surface is theirs; the founding decision forbids republishing
    // it, and the only visibility this contract has is the one that cannot.
    expect(GoViralPlaySchema.safeParse(play({ screenshot: { ...screenshot, visibility: "public" } })).success).toBe(false);
    expect(GoViralPlaySchema.safeParse(play({ screenshot: { ...screenshot, path: "site/public/social/open-loop.png" } })).success).toBe(false);
  });

  it("publishes the scales it rates on", () => {
    expect(Object.keys(GOVIRAL_REACH_BANDS).map(Number).sort((left, right) => left - right))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const confidence of RICE_CONFIDENCE_VALUES) {
      expect(GoViralPlaySchema.safeParse(play({ confidence, benchmark: play().benchmark })).success).toBe(true);
    }
    expect(GoViralPlaySchema.safeParse(play({ confidence: 0.9 })).success).toBe(false);
  });

  it("refuses two plays under one id", () => {
    expect(GoViralPlayLibrarySchema.safeParse({
      schemaVersion: "goviral-play-library/1",
      ventureId: "goviral",
      reachScale: "reach-band/1",
      updatedAt: "2026-08-24",
      plays: [play(), play({ title: "A second play wearing the first one's id" })]
    }).success).toBe(false);
  });
});

describe("reading the library", () => {
  it("names an absent library instead of failing", async () => {
    const read = await loadGoViralPlayLibrary({ stateRoot: await temporaryRoot(), repoRoot: process.cwd() });
    expect(read.plays).toEqual([]);
    expect(read.dropped).toBe(0);
    expect(read.reason).toContain(PLAY_LIBRARY_STATE_PATH);
  });

  it("names an unreadable library instead of failing", async () => {
    const root = await temporaryRoot();
    const target = path.join(root, PLAY_LIBRARY_STATE_PATH);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "{ not json");
    const read = await loadGoViralPlayLibrary({ stateRoot: root, repoRoot: process.cwd() });
    expect(read.plays).toEqual([]);
    expect(read.reason).toContain("not readable JSON");
  });

  it("says an empty library is empty rather than reading as a fault", async () => {
    const root = await temporaryRoot();
    await writeLibrary(root, []);
    const read = await loadGoViralPlayLibrary({ stateRoot: root, repoRoot: process.cwd() });
    expect(read.plays).toEqual([]);
    expect(read.dropped).toBe(0);
    expect(read.reason).toContain("holds no play yet");
  });

  it("drops one malformed play and keeps the rest, counted", async () => {
    const root = await temporaryRoot();
    await writeLibrary(root, [
      play(),
      play({ id: "play-broken", benchmark: null, confidence: 1 }),
      play({ id: "play-quiet-weekend", impact: 0.5, benchmark: null, confidence: 0.5, effortPersonWeeks: 0.25 })
    ]);
    const read = await loadGoViralPlayLibrary({ stateRoot: root, repoRoot: process.cwd() });
    expect(read.dropped).toBe(1);
    expect(read.plays.map(({ play: kept }) => kept.id)).toEqual(["play-open-loop", "play-quiet-weekend"]);
  });

  it("ranks by score and breaks a tie on the id, so the same library always ranks the same", () => {
    const ranked = rankPlays([
      GoViralPlaySchema.parse(play({ id: "play-b" })),
      GoViralPlaySchema.parse(play({ id: "play-a" })),
      GoViralPlaySchema.parse(play({ id: "play-c", effortPersonWeeks: 4 }))
    ], process.cwd());
    expect(ranked.map(({ play: entry }) => entry.id)).toEqual(["play-a", "play-b", "play-c"]);
  });

  it("says a screenshot is missing rather than implying the play has one", async () => {
    const root = await temporaryRoot();
    const repoRoot = await temporaryRoot();
    const screenshot = {
      path: "state/ventures/goviral/plays/screenshots/open-loop.png",
      alt: "The first line of the piece.",
      capturedAt: "2026-08-20",
      subject: "own-surface",
      visibility: "admin-only"
    };
    await writeLibrary(root, [play({ screenshot })]);
    const missing = await loadGoViralPlayLibrary({ stateRoot: root, repoRoot });
    expect(missing.plays[0]?.screenshotMissing).toBe(true);
    expect(renderPlayLine(missing.plays[0]!)).toContain("the file is missing");

    const file = path.join(repoRoot, screenshot.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "not really a png, but it is on disk");
    const present = await loadGoViralPlayLibrary({ stateRoot: root, repoRoot });
    expect(present.plays[0]?.screenshotMissing).toBe(false);
    expect(renderPlayLine(present.plays[0]!)).toContain(screenshot.path);
    expect(renderPlayLine(present.plays[0]!)).not.toContain("missing");
  });

  it("prints the rating, the category, the read time and what the play beat", () => {
    const [entry] = rankPlays([GoViralPlaySchema.parse(play())], process.cwd());
    expect(renderPlayLine(entry!)).toBe(
      "RICE 19.2 · hook · 3 min read — Open on the number the piece has not explained yet: "
      + "beat 41% with 58% on completion rate over eleven pieces; no screenshot."
    );
  });

  it("says outright that an unbenchmarked play is an opinion", () => {
    const [entry] = rankPlays([GoViralPlaySchema.parse(play({ benchmark: null, confidence: 0.5 }))], process.cwd());
    expect(renderPlayLine(entry!)).toContain("no benchmark on file");
  });
});
