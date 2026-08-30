import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTEST_APIFY_CEILING_USD,
  CONTEST_CAPACITY_DECISION_PATH,
  CONTEST_MODEL_CEILING_USD,
  enrichmentCandidates,
  mayContestRadarSpend
} from "../src/ventures/contest-radar/spend.js";
import { repoRoot } from "../src/paths.js";

const MONTH = "2026-08";

async function stateRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "contest-spend-"));
}

/** A repo whose capacity decision is countersigned, for testing the conditions after it. */
async function signedRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "contest-repo-"));
  await mkdir(path.join(root, "state", "decisions"), { recursive: true });
  await writeFile(
    path.join(root, CONTEST_CAPACITY_DECISION_PATH),
    "# Capacity\n\nStatus: countersigned\n\nSignature / explicit approval reference: Owner instruction.\n",
    "utf8"
  );
  return root;
}

const FULL_ENV = {
  CONTEST_RADAR_MODEL_ENRICHMENT_ENABLED: "true",
  CONTEST_RADAR_APIFY_ENABLED: "true",
  ANTHROPIC_API_KEY: "x",
  APIFY_TOKEN: "y"
} as NodeJS.ProcessEnv;

/**
 * The founding authorised the build and explicitly not the spending. Its own words: "This founding
 * is not that decision." So the normal answer here is no, and every no names which condition failed.
 */
describe("the Contest Radar spend gates", () => {
  it("refuses both rungs in the repository as it actually stands", async () => {
    const root = await stateRoot();

    for (const rung of ["model-enrichment", "apify-discovery"] as const) {
      const verdict = await mayContestRadarSpend({ rung, stateRoot: root, month: MONTH, env: FULL_ENV, reserveUsd: 0.01 });
      // Every switch on and every credential present, and it still refuses: the capacity decision
      // is the condition nothing else can substitute for.
      expect(verdict.allowed, rung).toBe(false);
      expect(verdict.reason).toContain("capacity decision");
    }
    expect(repoRoot).toBeTruthy();
  });

  it("still refuses with the decision signed but the switch off", async () => {
    const verdict = await mayContestRadarSpend({
      rung: "model-enrichment",
      stateRoot: await stateRoot(),
      month: MONTH,
      repoRoot: await signedRepo(),
      env: { ...FULL_ENV, CONTEST_RADAR_MODEL_ENRICHMENT_ENABLED: "false" },
      reserveUsd: 0.01
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("CONTEST_RADAR_MODEL_ENRICHMENT_ENABLED");
  });

  it("still refuses with the switch on but no credential", async () => {
    const verdict = await mayContestRadarSpend({
      rung: "apify-discovery",
      stateRoot: await stateRoot(),
      month: MONTH,
      repoRoot: await signedRepo(),
      env: { ...FULL_ENV, APIFY_TOKEN: "" },
      reserveUsd: 0.01
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("APIFY_TOKEN");
  });

  it("allows a reservation inside the ceiling once every condition holds", async () => {
    const verdict = await mayContestRadarSpend({
      rung: "model-enrichment",
      stateRoot: await stateRoot(),
      month: MONTH,
      repoRoot: await signedRepo(),
      env: FULL_ENV,
      reserveUsd: 0.01
    });

    expect(verdict.allowed).toBe(true);
    expect(verdict.ceilingUsd).toBe(CONTEST_MODEL_CEILING_USD);
  });

  it("refuses a reservation that would cross the month's ceiling", async () => {
    const root = await stateRoot();
    await mkdir(path.join(root, "ventures", "contest-radar"), { recursive: true });
    await writeFile(
      path.join(root, "ventures/contest-radar/spend-ledger.json"),
      JSON.stringify({ entries: [{ ts: "2026-08-15T00:00:00.000Z", usd: 0.09, rung: "apify-discovery" }] }),
      "utf8"
    );

    const verdict = await mayContestRadarSpend({
      rung: "apify-discovery",
      stateRoot: root,
      month: MONTH,
      repoRoot: await signedRepo(),
      env: FULL_ENV,
      reserveUsd: 0.05
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.spentThisMonthUsd).toBeCloseTo(0.09, 6);
    expect(verdict.reason).toContain(`over the $${CONTEST_APIFY_CEILING_USD.toFixed(2)} ceiling`);
  });

  it("counts only this month and only this rung", async () => {
    const root = await stateRoot();
    await mkdir(path.join(root, "ventures", "contest-radar"), { recursive: true });
    await writeFile(
      path.join(root, "ventures/contest-radar/spend-ledger.json"),
      JSON.stringify({
        entries: [
          { ts: "2026-07-15T00:00:00.000Z", usd: 0.4, rung: "model-enrichment" },
          { ts: "2026-08-15T00:00:00.000Z", usd: 0.09, rung: "apify-discovery" }
        ]
      }),
      "utf8"
    );

    const verdict = await mayContestRadarSpend({
      rung: "model-enrichment",
      stateRoot: root,
      month: MONTH,
      repoRoot: await signedRepo(),
      env: FULL_ENV,
      reserveUsd: 0.4
    });

    // July's spend and Apify's spend both belong to other buckets.
    expect(verdict.spentThisMonthUsd).toBe(0);
    expect(verdict.allowed).toBe(true);
  });
});

describe("what enrichment would be for", () => {
  const record = (id: string, deadline: unknown, prize: unknown, purchase: unknown) => ({
    id,
    dates: { deadline: { value: deadline } },
    prize: { valueAmount: { value: prize } },
    cost: { purchaseRequired: { value: purchase } }
  });

  it("names only the records with something missing", () => {
    const candidates = enrichmentCandidates([
      record("cr-complete", "2026-09-01", 5_000, false),
      record("cr-partial", null, 5_000, null)
    ]);

    // A record whose free extraction already produced everything has nothing to buy.
    expect(candidates.map(({ id }) => id)).toEqual(["cr-partial"]);
    expect(candidates[0]?.missing).toEqual(["deadline", "purchase requirement"]);
  });

  it("costs nothing to compute, so the owner can see what the money would buy first", () => {
    expect(enrichmentCandidates([])).toEqual([]);
  });
});
