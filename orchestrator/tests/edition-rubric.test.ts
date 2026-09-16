import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot, stateRoot } from "../src/paths.js";
import {
  EditionQualityConfigSchema,
  loadEditionQualityConfig,
  rubricThreshold
} from "../src/edition/config.js";
import { QUALITY_METRIC_KEYS } from "../src/edition/quality.js";
import { EditionRubricReceiptSchema } from "../src/contracts/edition-rubric-receipt.js";
import {
  buildEditionRubricReceipt,
  EDITION_RUBRIC_DIRECTORY,
  gradeEditionRun,
  readEditionRunReportsByDate
} from "../src/edition/rubric.js";

/**
 * Every violation code `evaluateEditionQuality` can emit, read out of its own source.
 *
 * Deliberately not a list in this file. A hand-kept list of the codes would pass on the day a
 * fifteenth code was added and the rubric was not extended, which is the single failure this
 * check exists to catch.
 */
async function evaluatorCodes(): Promise<string[]> {
  const source = await readFile(path.join(repoRoot, "orchestrator/src/edition/quality.ts"), "utf8");
  return [...new Set([...source.matchAll(/violations\.push\("([a-z_]+)"\)/gu)].map((match) => match[1]!))].sort();
}

const METRICS = {
  successfulSources: 29,
  candidateItems: 80,
  citedSources: 8,
  signalStrength: 86,
  maximumSingleSourceShare: 0.25,
  sourceDiversity: 0.84,
  duplicateStorySimilarity: 0.06,
  repeatedTopicFrequency: 0.16,
  primarySourceRelevant: true,
  primarySourcePresent: true,
  unsupportedWatchlistItems: 0,
  costPerRun: 0.3
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    runId: "00000000-0000-4000-8000-000000000001",
    status: "edition",
    regenerationAttempts: 0,
    quality: { metrics: METRICS, result: { passed: true, violations: [], action: "publish" } },
    ...overrides
  };
}

describe("the edition rubric", () => {
  it("names every violation code the gate can emit, and no code it cannot", async () => {
    const config = await loadEditionQualityConfig();
    expect(config.rubric.criteria.map((criterion) => criterion.code).sort())
      .toEqual(await evaluatorCodes());
    expect(config.rubric.criteria).toHaveLength(14);
  });

  it("reads every threshold out of the config the gate reads, and cites real metrics", async () => {
    const config = await loadEditionQualityConfig();
    for (const criterion of config.rubric.criteria) {
      for (const metric of criterion.metrics) {
        expect(QUALITY_METRIC_KEYS as readonly string[], criterion.code).toContain(metric);
      }
      if (criterion.thresholdKey === null) {
        // One criterion reads no threshold: an unmeasured cost is a violation on its own terms.
        expect(criterion.code).toBe("hard_cost_unavailable");
        continue;
      }
      expect(rubricThreshold(config, criterion.thresholdKey), criterion.thresholdKey)
        .not.toBeUndefined();
    }
  });

  it("refuses a criterion that points at a threshold this config does not hold", async () => {
    const config = await loadEditionQualityConfig();
    const broken = structuredClone(config) as unknown as {
      rubric: { criteria: { thresholdKey: string | null }[] };
    };
    broken.rubric.criteria[0]!.thresholdKey = "quality.minimumInventedThreshold";
    const parsed = EditionQualityConfigSchema.safeParse(broken);
    expect(parsed.success).toBe(false);
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message.slice(0, 40)))
      .toContain("quality.minimumInventedThreshold resolve");
  });

  it("refuses the same code twice", async () => {
    const config = await loadEditionQualityConfig();
    const duplicated = structuredClone(config) as unknown as { rubric: { criteria: unknown[] } };
    duplicated.rubric.criteria.push(structuredClone(duplicated.rubric.criteria[0]));
    expect(EditionQualityConfigSchema.safeParse(duplicated).success).toBe(false);
  });
});

describe("grading one run", () => {
  it("grades every criterion and agrees with the verdict the run recorded", async () => {
    const config = await loadEditionQualityConfig();
    const grade = gradeEditionRun({
      report: report(),
      reportRef: "edition/runs/synthetic.json",
      config
    });
    expect(grade.grade?.criteria).toHaveLength(14);
    expect(grade.grade?.criteria.every((criterion) => criterion.outcome === "met")).toBe(true);
    expect(grade.grade?.regraded).toEqual([]);
    expect(grade.grade?.divergence).toEqual([]);
    expect(grade.ungraded).toBeNull();
  });

  it("fails the criterion the metric actually breaks and reports it as a divergence", async () => {
    const config = await loadEditionQualityConfig();
    const grade = gradeEditionRun({
      report: report({
        quality: {
          metrics: { ...METRICS, citedSources: 1 },
          result: { passed: true, violations: [], action: "publish" }
        }
      }),
      reportRef: "edition/runs/synthetic.json",
      config
    });
    expect(grade.grade?.regraded).toEqual(["minimum_cited_sources"]);
    expect(grade.grade?.recorded).toEqual([]);
    // The run said it passed and the rubric says it did not. That disagreement is the finding.
    expect(grade.grade?.divergence).toEqual(["minimum_cited_sources"]);
    expect(
      grade.grade?.criteria.find((criterion) => criterion.code === "minimum_cited_sources")?.outcome
    ).toBe("failed");
  });

  it("leaves a run that never reached the gate ungraded rather than passing", async () => {
    const config = await loadEditionQualityConfig();
    const grade = gradeEditionRun({
      report: report({ status: "no_edition", quality: undefined }),
      reportRef: "edition/runs/synthetic.json",
      config
    });
    expect(grade.grade).toBeNull();
    expect(grade.ungraded).toContain("before the quality gate");
  });

  it("keeps an unreadable report as one ungraded run rather than dropping the day", async () => {
    const config = await loadEditionQualityConfig();
    for (const broken of [null, { quality: { metrics: { successfulSources: "twelve" } } }]) {
      const grade = gradeEditionRun({
        report: broken,
        reportRef: "edition/runs/synthetic.json",
        config
      });
      expect(grade.grade).toBeNull();
      expect(grade.ungraded).not.toBeNull();
    }
  });

  it("grades no action, because a run report cannot reproduce one", async () => {
    const config = await loadEditionQualityConfig();
    const grade = gradeEditionRun({
      report: report({
        regenerationAttempts: 2,
        quality: {
          metrics: { ...METRICS, citedSources: 1 },
          result: { passed: false, violations: ["minimum_cited_sources"], action: "regenerate" }
        }
      }),
      reportRef: "edition/runs/synthetic.json",
      config
    });
    // `action` reads the attempt index the gate was called with; the report records the run's
    // final count. Two committed reports differ on `action` alone for that reason, so the rubric
    // grades the codes and stays silent about what the run did next.
    expect(JSON.stringify(grade)).not.toContain("regenerate");
    expect(grade.grade?.divergence).toEqual([]);
  });
});

describe("the per-date receipt", () => {
  it("builds the same bytes twice from the same reports", async () => {
    const config = await loadEditionQualityConfig();
    const reports = [
      { reportRef: "edition/runs/2026-09-13-bbbb.json", report: report() },
      { reportRef: "edition/runs/2026-09-13-aaaa.json", report: report({ quality: undefined }) }
    ];
    const first = buildEditionRubricReceipt({ date: "2026-09-13", config, reports });
    const second = buildEditionRubricReceipt({ date: "2026-09-13", config, reports: [...reports].reverse() });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // Sorted by report path, so a date with two runs reads the same way on every build.
    expect(first.runs.map((run) => run.reportRef)).toEqual([
      "edition/runs/2026-09-13-aaaa.json",
      "edition/runs/2026-09-13-bbbb.json"
    ]);
    expect(first.summary).toEqual({ runs: 2, graded: 1, ungraded: 1, passed: 1, failed: 0, diverged: 0 });
  });

  it("carries no clock, so the committed receipts can be compared byte for byte", async () => {
    const source = await readFile(path.join(repoRoot, "orchestrator/src/edition/rubric.ts"), "utf8");
    expect(source).not.toMatch(/Date\.now\(\)|new Date\(\)|Math\.random\(\)/u);
    const config = await loadEditionQualityConfig();
    const receipt = buildEditionRubricReceipt({
      date: "2026-09-13",
      config,
      reports: [{ reportRef: "edition/runs/2026-09-13-aaaa.json", report: report() }]
    });
    expect(Object.keys(receipt)).not.toContain("generatedAt");
  });
});

describe("the committed record", () => {
  it("regrades every committed report to the verdict that report recorded", async () => {
    const config = await loadEditionQualityConfig();
    const byDate = await readEditionRunReportsByDate(stateRoot);
    expect(byDate.size).toBeGreaterThan(0);
    const findings: string[] = [];
    for (const [date, reports] of byDate) {
      for (const run of buildEditionRubricReceipt({ date, config, reports }).runs) {
        if (run.grade && run.grade.divergence.length > 0) {
          findings.push(`${run.reportRef}: ${run.grade.divergence.join(", ")}`);
        }
      }
    }
    /*
     * Zero today, and a threshold change is expected to break this.
     *
     * A recorded verdict was produced under the thresholds of its own day, so raising one moves
     * the regrade of every historical report that sits between the old value and the new. That is
     * the drift this exists to surface, not a defect in the test: bump `rubric.revision`, run
     * `pnpm edition:rubric`, and say in the commit which days changed verdict and why.
     */
    expect(findings).toEqual([]);
  });

  /*
   * Stale, not missing.
   *
   * `pnpm test` runs inside the cycle's post-cycle gate, and that gate runs before the step that
   * commits what the cycle wrote. So a test that failed because a brand-new run report had no
   * receipt yet would fail the job and take the run report — the only record of the spend — down
   * with it. The receipt is derived; engineering rule 6 says a derived record may cost itself and
   * never the run. Missing receipts are the CI step's business: `pnpm edition:rubric -- --check`
   * runs on source pushes and pull requests and never inside a cycle.
   */
  it("keeps every committed receipt current and valid against its contract", async () => {
    const config = await loadEditionQualityConfig();
    const byDate = await readEditionRunReportsByDate(stateRoot);
    const directory = path.join(stateRoot, EDITION_RUBRIC_DIRECTORY);
    const committed = (await readdir(directory).catch(() => [] as string[]))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(name));
    expect(committed.length).toBeGreaterThan(0);
    const stale: string[] = [];
    for (const name of committed) {
      const date = name.slice(0, 10);
      const actual = await readFile(path.join(directory, name), "utf8");
      expect(EditionRubricReceiptSchema.safeParse(JSON.parse(actual)).success, date).toBe(true);
      const reports = byDate.get(date);
      if (!reports) {
        stale.push(`${date} has a receipt and no run report`);
        continue;
      }
      const expected = `${JSON.stringify(buildEditionRubricReceipt({ date, config, reports }), null, 2)}\n`;
      if (actual !== expected) stale.push(`${date} is stale`);
    }
    expect(stale).toEqual([]);
  });
});
