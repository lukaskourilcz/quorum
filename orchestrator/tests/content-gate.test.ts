import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_LIMITS } from "../src/budget.js";
import type { ReserveContext } from "../src/budget.js";
import { runContentGate, collectContentGateItems, contentGateEnabled } from "../src/quality/content-gate.js";
import { resolveEffectivePortfolioSchedule } from "../src/portfolio/schedule.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

const NOW = new Date("2026-08-09T22:00:00.000Z");
const DATE = "2026-08-09";

async function json(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** A day with two articles covering the same story, plus one dataset append. */
async function publishedDay(): Promise<string> {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-content-gate-"));
  await json(path.join(stateRoot, "edition", "deliveries", `${DATE}.json`), {
    date: DATE,
    status: "delivered",
    editionStatus: "edition"
  });
  await json(path.join(stateRoot, "edition", "archive", `${DATE}-abc.json`), {
    schemaVersion: "edition-package/1",
    date: DATE,
    article: {
      cs: {
        frontmatter: {
          title: "OpenAI pozastavuje Astru",
          slug: `${DATE}-openai-astra`,
          signal_strength: 84,
          sources: [
            { source_id: "hn-frontpage", classification: "secondary" },
            { source_id: "openai-blog", classification: "primary" },
            { source_id: "hn-frontpage", classification: "secondary" }
          ]
        }
      }
    }
  });
  await json(path.join(stateRoot, "ventures", "mma-files", "articles", `${DATE}-am-ufc-gamrot.json`), {
    schemaVersion: "article/1",
    slug: "ufc-gamrot",
    status: "published",
    localizations: { en: { title: "Gamrot vs Salkilld: what to watch" } },
    sources: [{ source_id: "ufc-stats", classification: "primary" }]
  });
  await json(path.join(stateRoot, "ventures", "caught-up", "datasets", `${DATE}-ai-facts.json`), {
    schemaVersion: "dataset-append/1",
    dataset: "ai-facts",
    appendedIds: ["fact-021"],
    evidenceRefs: ["AI-E-011"],
    recordedAt: `${DATE}T01:00:00.000Z`
  });
  return stateRoot;
}

const budgetContext = (ledgerRoot: string): ReserveContext => ({
  now: NOW,
  cycleId: "20260809220000-night",
  stage: "VALIDATION",
  ledger: [],
  allInNonApiSpentUsd: 0,
  allInCommittedUsd: 0,
  knownMonthlyForecastUsd: 0,
  remainingScheduledCycles: 1,
  limits: DEFAULT_BUDGET_LIMITS,
  ...(ledgerRoot ? {} : {})
});

const ON = { CONTENT_GATE_ENABLED: "true" } as NodeJS.ProcessEnv;

describe("the content gate switch", () => {
  it("is off unless something turns it on", () => {
    expect(contentGateEnabled({})).toBe(false);
    expect(contentGateEnabled({ CONTENT_GATE_ENABLED: "false" })).toBe(false);
    expect(contentGateEnabled({ CONTENT_GATE_ENABLED: "true" })).toBe(true);
  });

  it("makes no call and writes no file when it is off", async () => {
    const stateRoot = await publishedDay();
    let called = 0;
    const result = await runContentGate({
      stateRoot,
      cycleId: "c",
      now: NOW,
      budgetContext: budgetContext(stateRoot),
      env: {},
      call: (async () => { called += 1; throw new Error("unreachable"); }) as never
    });
    expect(called).toBe(0);
    expect(result).toEqual({ records: [], artifacts: [], skippedReason: null });
  });
});

describe("what the gate collects", () => {
  it("shortlists every article and append the day published", async () => {
    const items = await collectContentGateItems({ stateRoot: await publishedDay(), date: DATE });
    expect(items.map((item) => `${item.ventureId}:${item.kind}`).sort()).toEqual([
      "caught-up:article",
      "caught-up:dataset-append",
      "mma-files:article"
    ]);
    const edition = items.find((item) => item.ventureId === "caught-up" && item.kind === "article");
    // Three citations from two distinct sources: the deterministic diversity metric is the point.
    expect(edition?.sourceIds).toEqual(["hn-frontpage", "openai-blog", "hn-frontpage"]);
    expect(edition?.recordedSignalStrength).toBe(84);
  });

  it("leaves a NO_EDITION day off the shortlist", async () => {
    const stateRoot = await publishedDay();
    await json(path.join(stateRoot, "edition", "deliveries", `${DATE}.json`), {
      date: DATE, status: "delivered", editionStatus: "no_edition"
    });
    const items = await collectContentGateItems({ stateRoot, date: DATE });
    expect(items.some((item) => item.ventureId === "caught-up" && item.kind === "article")).toBe(false);
  });
});

describe("a scored night", () => {
  it("records a verdict per item, per venture, with the free metrics beside it", async () => {
    const stateRoot = await publishedDay();
    const result = await runContentGate({
      stateRoot,
      cycleId: "c",
      now: NOW,
      budgetContext: budgetContext(stateRoot),
      env: ON,
      call: (async (request: { input: string; parse: (text: string) => unknown }) => {
        const items = (JSON.parse(request.input.split("\n").slice(1, -2).join("\n")) as {
          items: Array<{ id: string }>;
        }).items;
        return {
          value: request.parse(JSON.stringify({
            verdicts: items.map((item, index) => ({
              id: item.id,
              fit: index === 0 ? 8 : 4,
              vetoes: index === 0 ? [] : ["repeated-coverage"],
              reason: index === 0 ? "Sourced and new." : "Same card as yesterday."
            }))
          })),
          cached: false,
          usd: 0.01
        };
      }) as never
    });

    expect(result.skippedReason).toBeNull();
    expect(result.artifacts.sort()).toEqual([
      "ventures/caught-up/content-scores/2026-08-09.json",
      "ventures/mma-files/content-scores/2026-08-09.json"
    ]);
    const caughtUp = JSON.parse(await readFile(path.join(stateRoot, result.artifacts.find((a) => a.includes("caught-up"))!), "utf8"));
    expect(caughtUp.schemaVersion).toBe("content-score/1");
    expect(caughtUp.items[0].fit).toBe(8);
    expect(caughtUp.items[0].metrics.sourceDiversity).toBeGreaterThan(0);
    expect(caughtUp.items[0].metrics.signalStrength).toBe(84);
  });
});

describe("every failure descends, and none of them costs the run", () => {
  const failures: Array<[string, () => never]> = [
    ["a spent cap", () => { throw new Error("Reserve refused: monthly API cap reached"); }],
    ["a timeout", () => { throw new Error("The model call timed out"); }],
    ["a malformed verdict", () => { throw new SyntaxError("Unexpected token < in JSON"); }]
  ];

  for (const [label, fail] of failures) {
    it(`records every item unscored on ${label}`, async () => {
      const stateRoot = await publishedDay();
      const result = await runContentGate({
        stateRoot,
        cycleId: "c",
        now: NOW,
        budgetContext: budgetContext(stateRoot),
        env: ON,
        call: (async () => fail()) as never
      });

      expect(result.artifacts).toHaveLength(2);
      expect(result.skippedReason).not.toBeNull();
      const record = JSON.parse(await readFile(path.join(stateRoot, result.artifacts[0]!), "utf8"));
      for (const item of record.items) {
        expect(item.unscored).toBe(true);
        expect(item.fit).toBeNull();
        // The free half is recorded whether the model was reached or not.
        expect(item.metrics).toBeDefined();
      }
    });
  }

  it("records an item the verdict skipped as that item's loss, not the day's", async () => {
    const stateRoot = await publishedDay();
    const result = await runContentGate({
      stateRoot,
      cycleId: "c",
      now: NOW,
      budgetContext: budgetContext(stateRoot),
      env: ON,
      call: (async (request: { parse: (text: string) => unknown }) => ({
        value: request.parse(JSON.stringify({
          verdicts: [{ id: `${DATE}-openai-astra`, fit: 9, vetoes: [], reason: "Strong." }]
        })),
        cached: false,
        usd: 0.01
      })) as never
    });

    const caughtUp = JSON.parse(await readFile(
      path.join(stateRoot, result.artifacts.find((a) => a.includes("caught-up"))!),
      "utf8"
    ));
    const scored = caughtUp.items.find((item: { id: string }) => item.id === `${DATE}-openai-astra`);
    const missed = caughtUp.items.find((item: { kind: string }) => item.kind === "dataset-append");
    expect(scored.fit).toBe(9);
    expect(missed.unscored).toBe(true);
  });

  it("writes nothing at all on a day that published nothing", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-content-gate-quiet-"));
    const result = await runContentGate({
      stateRoot, cycleId: "c", now: NOW, budgetContext: budgetContext(stateRoot), env: ON,
      call: (async () => { throw new Error("unreachable"); }) as never
    });
    expect(result.artifacts).toEqual([]);
    expect(result.records).toEqual([]);
  });
});

describe("the shedding ladder", () => {
  it("drops scoring first, because an unscored day still published", async () => {
    const registry = await loadVentureRegistry();
    const base = {
      registry,
      budgetDecisionRaw: "Status: countersigned\nSignature / explicit approval reference: owner\nSelection: [x] Shape A [ ] Shape B",
      budgetFiftyRaw: "Status: countersigned\nSignature / explicit approval reference: owner"
    };
    expect(resolveEffectivePortfolioSchedule({ ...base, monthlyApiHeadroomUsd: 10 }).contentGateAffordable).toBe(true);
    expect(resolveEffectivePortfolioSchedule({ ...base, monthlyApiHeadroomUsd: 2.5 }).contentGateAffordable).toBe(false);
    // It goes before GoVIRAL, which is the first room to go.
    expect(resolveEffectivePortfolioSchedule({ ...base, monthlyApiHeadroomUsd: 2.5 })
      .activePhases.includes("gv-brief")).toBe(true);
  });
});
