import { describe, expect, it } from "vitest";
import { classifyRun, renderYieldMarkdown, summarizeEditionYield } from "../src/edition/yield.js";

// quorum#564: the numbers behind the DNESKAi yield proposals come from here, so they are pinned.

type Run = Parameters<typeof classifyRun>[0];

function run(date: string, overrides: Partial<Run> = {}): Run {
  return {
    date,
    status: "no_edition",
    mode: "production",
    startedAt: `${date}T03:00:00.000Z`,
    stages: [],
    warnings: [],
    measuredCostUsd: 0,
    sourceSummary: { successfulSources: 30, candidateItems: 80 },
    ...overrides
  };
}

const stage = (name: string, errorCode: string, errorMessage: string) => ({
  name, status: "failed" as const, startedAt: "", completedAt: "", durationMs: 1, errorCode, errorMessage
});

const invalid = (field: string) =>
  `write: [\n  {\n    "expected": "array",\n    "code": "invalid_type",\n    "path": [\n      "${field}"\n    ]\n  }\n]`;

describe("classifying one run", () => {
  it("names the gate that stopped it, earliest first", () => {
    expect(classifyRun(run("2026-09-01", { status: "edition" })).kind).toBe("published");
    expect(classifyRun(run("2026-09-01", { warnings: ["budget_exhausted"] })).kind).toBe("budget-spent");
    expect(classifyRun(run("2026-09-01", {
      stages: [stage("curate", "CurationGateError", "curation gate: maximum_single_source_share")]
    }))).toMatchObject({ kind: "curation-gate", detail: "maximum_single_source_share" });
    expect(classifyRun(run("2026-09-01", {
      stages: [stage("curate", "Error", "400 Your credit balance is too low")]
    }))).toMatchObject({ kind: "provider-error", detail: "provider refused: credit balance too low" });
    const lost = classifyRun(run("2026-09-01", {
      measuredCostUsd: 0.44,
      stages: [
        stage("write", "InvalidModelOutputError", invalid("dispatches")),
        stage("rewrite_1", "InvalidModelOutputError", invalid("wire")),
        stage("rewrite_2", "InvalidModelOutputError", invalid("dispatches"))
      ]
    }));
    expect(lost).toMatchObject({ kind: "write-output-invalid", invalidFields: ["dispatches"], costUsd: 0.44 });
    expect(lost.invalidFieldsByAttempt).toEqual([["dispatches"], ["wire"], ["dispatches"]]);
  });

  it("says a published run needed a retry, without calling it lost", () => {
    const verdict = classifyRun(run("2026-09-01", {
      status: "edition",
      stages: [stage("write", "InvalidModelOutputError", invalid("uncertainty"))]
    }));
    expect(verdict).toMatchObject({ kind: "published", detail: "published after 1 rejected write attempt" });
  });
});

describe("summarising a range", () => {
  const report = summarizeEditionYield({
    since: "2026-09-01",
    until: "2026-09-04",
    enabledSources: 32,
    skips: { "2026-09-03": "The checks on the code behind this meeting did not pass." },
    runs: [
      run("2026-09-01", { status: "edition", measuredCostUsd: 0.17 }),
      run("2026-09-02", {
        measuredCostUsd: 0.44,
        stages: [stage("write", "InvalidModelOutputError", invalid("dispatches"))]
      }),
      run("2026-09-02", { warnings: ["budget_exhausted"], startedAt: "2026-09-02T07:00:00.000Z" }),
      run("2026-09-04", { mode: "dry_run", status: "edition" }),
      run("2026-08-31", { status: "edition" })
    ]
  });

  it("counts days by the run that did the work, not the retry that found the budget spent", () => {
    expect(report.days.map(({ date, published }) => [date, published])).toEqual([
      ["2026-09-01", true],
      ["2026-09-02", false]
    ]);
    expect(report.lostDaysByCause).toEqual([{ kind: "write-output-invalid", days: 1 }]);
    expect(report.days[1]).toMatchObject({ costUsd: 0.44, lostUsd: 0.44 });
    expect(report.invalidFieldCounts).toEqual([{ field: "dispatches", attempts: 1 }]);
  });

  it("names the days nothing ran, with the room's own reason, and ignores dry runs", () => {
    expect(report.daysWithoutRun).toEqual(["2026-09-03", "2026-09-04"]);
    // Most days first, then alphabetical.
    expect(report.skipReasons).toEqual([
      { reason: "no run record and no skip record", dates: ["2026-09-04"] },
      { reason: "The checks on the code behind this meeting did not pass.", dates: ["2026-09-03"] }
    ]);
  });

  it("renders the same numbers it computed", () => {
    const markdown = renderYieldMarkdown(report, "pnpm edition:yield -- --since 2026-09-01");
    expect(markdown).toContain("# DNESKAi yield, 2026-09-01 to 2026-09-04");
    expect(markdown).toContain("Days with a run: 2. Published: 1. No edition: 1.");
    expect(markdown).toContain("$0.61, of which $0.44 went to runs that published nothing");
    expect(markdown).toContain("| write-output-invalid | 1 |");
    expect(markdown).toContain("| `dispatches` | 1 |");
    expect(markdown).toContain("out of the 32 the registry enables");
  });
});
