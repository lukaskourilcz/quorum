import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CITO_CALL_RESERVATION,
  CITO_DAILY_CALL_CAP,
  CITO_MONTHLY_CALL_CAP,
  refreshFightAiQEvidence,
  withinIntakeHorizon
} from "../src/portfolio/evidence.js";
import { atomicWriteJson } from "../src/state.js";

/**
 * FightAIQ's free-tier stops live in this module and nothing else.
 *
 * Cito allows 500 calls a month and 200 a day; the run reserves five up front and refuses to
 * start if the reservation would cross either line. Until now no test imported this file at
 * all — grepping the suite for citoCallReservation, nextFighterPage or materialChange returned
 * nothing — so every one of those bounds was held by the code alone. These tests exist so the
 * event-first rework cannot quietly drop a free-tier stop while narrowing the call count.
 */

const roots: string[] = [];

async function stateRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "boardless-fightaiq-evidence-"));
  roots.push(root);
  return root;
}

async function quotaAt(root: string, quota: Record<string, unknown>): Promise<void> {
  await atomicWriteJson(root, "mma/source-quota/cito.json", {
    schemaVersion: "cito-free-quota/1",
    ...quota
  });
}

async function citoResult(root: string, date: string) {
  const refreshed = await refreshFightAiQEvidence({ root, date, now: new Date(`${date}T09:00:00.000Z`) });
  const snapshot = refreshed.artifactPaths.find((file) => file.endsWith(`source-snapshots/${date}.json`));
  if (!snapshot) return { refreshed, cito: null };
  const raw = JSON.parse(await readFile(path.join(root, snapshot), "utf8")) as {
    sources?: Array<{ sourceId: string; status: string; reason: string | null }>;
  };
  return { refreshed, cito: raw.sources?.find((entry) => entry.sourceId === "cito-ufc") ?? null };
}

const KEYS = ["CITO_API_KEY", "THE_ODDS_API_KEY"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  // A key must be present or the guard is never reached: the "unavailable" branch answers first.
  process.env.CITO_API_KEY = "fixture-key";
  delete process.env.THE_ODDS_API_KEY;
});

afterEach(async () => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("the Cito free-tier guard", () => {
  it("refuses the run before any request when the monthly reservation would cross 500", async () => {
    const root = await stateRoot();
    // The guard has to stop on the reservation, not on the calls already made, or the run
    // spends past the cap and finds out afterwards. Derived from the constants so that changing
    // the reservation cannot make this test quietly agree with whatever the code now does.
    await quotaAt(root, {
      month: "2026-08",
      day: "2026-08-03",
      monthlyCalls: CITO_MONTHLY_CALL_CAP - CITO_CALL_RESERVATION + 1,
      dailyCalls: 0
    });
    const { cito } = await citoResult(root, "2026-08-03");
    expect(cito?.status).toBe("skipped");
    expect(cito?.reason).toMatch(/free-tier quota guard/iu);
  });

  it("refuses the run when the daily reservation would cross 200", async () => {
    const root = await stateRoot();
    await quotaAt(root, {
      month: "2026-08",
      day: "2026-08-03",
      monthlyCalls: 0,
      dailyCalls: CITO_DAILY_CALL_CAP - CITO_CALL_RESERVATION + 1
    });
    const { cito } = await citoResult(root, "2026-08-03");
    expect(cito?.status).toBe("skipped");
    expect(cito?.reason).toMatch(/free-tier quota guard/iu);
  });

  it("counts a new month and a new day from zero", async () => {
    const root = await stateRoot();
    // Yesterday's counters must not stop today's run, and last month's must not stop this one.
    await quotaAt(root, {
      month: "2026-07",
      day: "2026-08-02",
      monthlyCalls: CITO_MONTHLY_CALL_CAP - 1,
      dailyCalls: CITO_DAILY_CALL_CAP - 1
    });
    const { cito } = await citoResult(root, "2026-08-03");
    expect(cito?.reason ?? "").not.toMatch(/free-tier quota guard/iu);
  });

  it("lets a run through when the reservation exactly reaches the cap", async () => {
    // Exactly at the cap is inside the free tier. Stopping here would throw away a run the
    // provider would have answered.
    const root = await stateRoot();
    await quotaAt(root, {
      month: "2026-08",
      day: "2026-08-03",
      monthlyCalls: CITO_MONTHLY_CALL_CAP - CITO_CALL_RESERVATION,
      dailyCalls: CITO_DAILY_CALL_CAP - CITO_CALL_RESERVATION
    });
    const { cito } = await citoResult(root, "2026-08-03");
    expect(cito?.reason ?? "").not.toMatch(/free-tier quota guard/iu);
  });

  it("stops without a key rather than calling anonymously", async () => {
    const root = await stateRoot();
    delete process.env.CITO_API_KEY;
    const { cito } = await citoResult(root, "2026-08-03");
    expect(cito?.status).toBe("skipped");
    expect(cito?.reason).toMatch(/CITO_API_KEY/u);
  });
});

describe("nothing is enriched until a card is scheduled", () => {
  it("counts a card inside the horizon and ignores one outside it or already past", () => {
    const now = new Date("2026-08-03T09:00:00.000Z");
    expect(withinIntakeHorizon("2026-08-09T00:00:00.000Z", now), "six days out").toBe(true);
    expect(withinIntakeHorizon("2026-08-16T01:00:00.000Z", now), "thirteen days out").toBe(true);
    expect(withinIntakeHorizon("2026-08-23T00:00:00.000Z", now), "twenty days out").toBe(false);
    expect(withinIntakeHorizon("2026-08-01T00:00:00.000Z", now), "already held").toBe(false);
  });

  it("treats an undated or unparseable event as no card at all", () => {
    // A card with no date cannot be shown to be inside the horizon, and guessing that it is
    // would restore exactly the daily paging this replaced.
    const now = new Date("2026-08-03T09:00:00.000Z");
    expect(withinIntakeHorizon(null, now)).toBe(false);
    expect(withinIntakeHorizon("soon", now)).toBe(false);
  });
});
