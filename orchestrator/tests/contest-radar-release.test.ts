import { describe, expect, it } from "vitest";
import { auditContestRadarRelease } from "../src/ventures/contest-radar/release-audit.js";

/**
 * Most of these checks are about what the venture must be unable to do, which is exactly the class
 * of property that gets added by accident and noticed months later.
 */
describe("the Contest Radar release audit", () => {
  it("passes every check against the repository as it stands", async () => {
    const audit = await auditContestRadarRelease();

    expect(audit.checks.filter((check) => !check.passed).map((check) => `${check.id}: ${check.detail}`)).toEqual([]);
    expect(audit.passed).toBe(true);
  });

  it("checks the two things nothing else would catch", async () => {
    const ids = (await auditContestRadarRelease()).checks.map((check) => check.id);

    // "It never enters anything" is only true while nothing in the source could, and "the paid
    // rungs are shut" is only true while the capacity decision does not exist.
    expect(ids).toContain("cannot-act-on-a-contest");
    expect(ids).toContain("paid-rungs-shut");
  });

  it("cites evidence a reader can open for every check", async () => {
    for (const check of (await auditContestRadarRelease()).checks) {
      expect(check.evidenceRefs.length, `${check.id} cites nothing`).toBeGreaterThan(0);
      for (const ref of check.evidenceRefs) expect(ref).toMatch(/^(?:config|docs|state|orchestrator)\//u);
    }
  });
});
