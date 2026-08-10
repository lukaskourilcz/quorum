import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_LIMITS, type ReserveContext } from "../src/budget.js";
import type { OpsReport } from "../src/contracts/ops-report.js";
import { RETRO_ENVELOPE_USD, runWeeklyRetro, weeklyRetroEnabled } from "../src/reports/retro.js";
import { writeOpsReport } from "../src/reports/writers.js";

const NOW = new Date("2026-08-10T22:00:00.000Z");
const MONDAY = "2026-08-10";

const report: OpsReport = {
  schemaVersion: "ops-report/1",
  period: "weekly",
  periodKey: "2026-W32",
  generatedAt: "2026-08-10T22:00:00.000Z",
  meetings: { scheduled: 24, held: 21, skipped: [], missingDays: [] },
  spend: { periodUsd: 2.41, mtdUsd: 3.9, capUsd: 30, byVenture: { "caught-up": 1.2 } },
  content: { published: [{ ventureId: "caught-up", count: 5 }], scores: { avg: 7.25, worst: 4, best: 9 } },
  quality: { vetoRate: 0.11, firstPassRate: null, retryRate: null },
  incidents: [],
  fixTasks: { opened: 4, closed: 2 },
  perVenture: [{ ventureId: "caught-up", verdictSummary: "on-track", outputs: 5, spendUsd: 1.2 }],
  narrative: null
};

const budgetContext: ReserveContext = {
  now: NOW,
  cycleId: "20260810220000-night",
  stage: "VALIDATION",
  ledger: [],
  allInNonApiSpentUsd: 0,
  allInCommittedUsd: 0,
  knownMonthlyForecastUsd: 0,
  remainingScheduledCycles: 1,
  limits: { ...DEFAULT_BUDGET_LIMITS, maxCycleUsd: RETRO_ENVELOPE_USD }
};

const ON = { WEEKLY_RETRO_ENABLED: "true" } as NodeJS.ProcessEnv;

async function stateWithReport(ownerAttention?: unknown): Promise<string> {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-retro-"));
  await writeOpsReport(stateRoot, report);
  if (ownerAttention !== undefined) {
    await mkdir(stateRoot, { recursive: true });
    await writeFile(path.join(stateRoot, "owner-attention.json"), JSON.stringify(ownerAttention));
  }
  return stateRoot;
}

const reply = (over: Record<string, unknown> = {}) => JSON.stringify({
  diagnosis: "The week held 21 of 24 slots and stayed well inside its cap.",
  narrative: "Twenty-one of twenty-four slots met. Spend finished at $2.41 against a $30 month. Five DNESKAi pieces published and scored 7.25 on average, with one at 4 that repeated the previous day's story.",
  fixTasks: [],
  ...over
});

describe("the retro switch", () => {
  it("is off unless something turns it on", () => {
    expect(weeklyRetroEnabled({})).toBe(false);
    expect(weeklyRetroEnabled({ WEEKLY_RETRO_ENABLED: "true" })).toBe(true);
  });

  it("leaves the report's narrative null and writes nothing when it is off", async () => {
    const stateRoot = await stateWithReport();
    let called = 0;
    const result = await runWeeklyRetro({
      stateRoot, cycleId: "c", today: MONDAY, report, now: NOW, budgetContext, env: {},
      call: (async () => { called += 1; throw new Error("unreachable"); }) as never
    });
    expect(called).toBe(0);
    expect(result).toEqual({ artifacts: [], skippedReason: null, narrative: null });
    const onDisk = JSON.parse(await readFile(path.join(stateRoot, "reports/weekly/2026-W32.json"), "utf8"));
    expect(onDisk.narrative).toBeNull();
  });
});

describe("a Monday the room meets", () => {
  it("patches the narrative into the report it was given", async () => {
    const stateRoot = await stateWithReport();
    const result = await runWeeklyRetro({
      stateRoot, cycleId: "c", today: MONDAY, report, now: NOW, budgetContext, env: ON,
      call: (async (request: { parse: (text: string) => unknown }) => ({
        value: request.parse(reply()), cached: false, usd: 0.02
      })) as never
    });

    expect(result.skippedReason).toBeNull();
    expect(result.artifacts).toContain("reports/weekly/2026-W32.json");
    const patched = JSON.parse(await readFile(path.join(stateRoot, "reports/weekly/2026-W32.json"), "utf8"));
    expect(patched.narrative).toContain("Twenty-one of twenty-four slots met");
    // Everything else the writers measured is untouched: this room writes one field.
    expect(patched.spend).toEqual(report.spend);
    expect(patched.meetings).toEqual(report.meetings);
  });

  it("writes fix tasks as checkboxes and no file when it opens none", async () => {
    const quiet = await stateWithReport();
    await runWeeklyRetro({
      stateRoot: quiet, cycleId: "c", today: MONDAY, report, now: NOW, budgetContext, env: ON,
      call: (async (request: { parse: (text: string) => unknown }) => ({
        value: request.parse(reply()), cached: false, usd: 0.02
      })) as never
    });
    await expect(readFile(path.join(quiet, "decisions", `${MONDAY}-operations.md`), "utf8")).rejects.toThrow();

    const busy = await stateWithReport();
    const result = await runWeeklyRetro({
      stateRoot: busy, cycleId: "c", today: MONDAY, report, now: NOW, budgetContext, env: ON,
      call: (async (request: { parse: (text: string) => unknown }) => ({
        value: request.parse(reply({
          fixTasks: [{
            title: "Write plain copy for MYSTERY-042",
            scope: "orchestrator/src/org/owner-attention.ts",
            expectedProof: "The item stops reporting needsPlainCopy."
          }]
        })),
        cached: false,
        usd: 0.02
      })) as never
    });
    expect(result.artifacts).toContain(`decisions/${MONDAY}-operations.md`);
    const decision = await readFile(path.join(busy, "decisions", `${MONDAY}-operations.md`), "utf8");
    expect(decision).toContain("- [ ] **Write plain copy for MYSTERY-042**");
  });
});

describe("a Monday the room cannot meet", () => {
  it("records a meeting skip and exits cleanly when the budget refuses", async () => {
    const stateRoot = await stateWithReport();
    const result = await runWeeklyRetro({
      stateRoot, cycleId: "c", today: MONDAY, report, now: NOW, budgetContext, env: ON,
      call: (async () => { throw new Error("Reserve refused: cycle envelope reached"); }) as never
    });

    expect(result.narrative).toBeNull();
    expect(result.skippedReason).toContain("Reserve refused");
    expect(result.artifacts).toEqual([`meetings/skips/${MONDAY}-weekly-retro.json`]);
    const skip = JSON.parse(await readFile(
      path.join(stateRoot, "meetings", "skips", `${MONDAY}-weekly-retro.json`), "utf8"
    ));
    expect(skip.schemaVersion).toBe("meeting-skip/1");
    expect(skip.phase).toBe("weekly-retro");

    // The report keeps its honest null rather than a half-written narrative.
    const onDisk = JSON.parse(await readFile(path.join(stateRoot, "reports/weekly/2026-W32.json"), "utf8"));
    expect(onDisk.narrative).toBeNull();
  });

  it("does the same on an unparsable reply", async () => {
    const stateRoot = await stateWithReport();
    const result = await runWeeklyRetro({
      stateRoot, cycleId: "c", today: MONDAY, report, now: NOW, budgetContext, env: ON,
      call: (async () => { throw new SyntaxError("Unexpected token"); }) as never
    });
    expect(result.artifacts).toEqual([`meetings/skips/${MONDAY}-weekly-retro.json`]);
  });
});

describe("what the room is asked about", () => {
  it("is handed the owner's unexplained items as something specific to fix", async () => {
    const stateRoot = await stateWithReport({
      schemaVersion: "owner-attention/1",
      generatedAt: "2026-08-10T04:00:00.000Z",
      approvals: [{ id: "MYSTERY-042", needsPlainCopy: true, urgency: "soon" }],
      manualTasks: [{ id: "ADMIN_USER", urgency: "blocking" }]
    });
    let seen = "";
    await runWeeklyRetro({
      stateRoot, cycleId: "c", today: MONDAY, report, now: NOW, budgetContext, env: ON,
      call: (async (request: { input: string; parse: (text: string) => unknown }) => {
        seen = request.input;
        return { value: request.parse(reply()), cached: false, usd: 0.02 };
      }) as never
    });
    expect(seen).toContain("MYSTERY-042");
    expect(seen).toContain("\"blocking\":1");
  });
});
