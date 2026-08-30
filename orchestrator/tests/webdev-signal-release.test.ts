import { describe, expect, it } from "vitest";
import { auditWebDevSignalRelease } from "../src/ventures/webdev-signal/release-audit.js";

/**
 * The audit reads the files rather than trusting a checklist, because a checklist passes on the
 * day someone deletes the thing it describes.
 */
describe("the WebDev Signal release audit", () => {
  it("passes every deterministic ownership, authority and isolation check", async () => {
    const audit = await auditWebDevSignalRelease();

    const failed = audit.checks.filter((check) => !check.passed);
    expect(failed.map((check) => `${check.id}: ${check.detail}`)).toEqual([]);
    expect(audit.passed).toBe(true);
  });

  it("checks the two things a release could quietly grant", async () => {
    const audit = await auditWebDevSignalRelease();
    const ids = audit.checks.map((check) => check.id);

    // Factual authority and account authority are the two that nothing else in this repository
    // would fail if they were widened by accident.
    expect(ids).toContain("secondary-sources-stay-discovery-only");
    expect(ids).toContain("accounts-and-authority-held");
    expect(ids).toContain("goviral-optional-and-held");
  });

  it("names evidence a reader can open for every check", async () => {
    const audit = await auditWebDevSignalRelease();

    for (const check of audit.checks) {
      expect(check.evidenceRefs.length, `${check.id} cites nothing`).toBeGreaterThan(0);
      for (const ref of check.evidenceRefs) expect(ref).toMatch(/^(?:config|docs|state|\.github)\//u);
    }
  });
});
