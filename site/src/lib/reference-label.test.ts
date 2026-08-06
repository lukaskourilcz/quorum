import { describe, expect, it } from "vitest";
import { describeReference } from "./reference-label";

/**
 * Evidence pills used to print the stored reference: `source:the-odds-api:2026-08-05`,
 * `meeting:2026-08-05-mma-analysis`, `event:ufc:event:ufc-fight-night-gamrot-vs-salkilld`,
 * `idea-2026-08-05-bbffd7f5`. Every live reference has one of these shapes.
 */
describe("an evidence pill says what it points at", () => {
  it("names a source and the day it was read", () => {
    expect(describeReference("source:the-odds-api:2026-08-05")).toEqual({
      label: "Source: The Odds API (5 Aug)"
    });
    expect(describeReference("source:hn-frontpage")).toEqual({ label: "Source: HN Frontpage" });
  });

  it("links a meeting reference to its notes", () => {
    expect(describeReference("meeting:2026-08-05-mma-analysis")).toEqual({
      label: "Meeting notes, 5 Aug",
      href: "/meetings/2026-08-05-mma-analysis"
    });
    // The same reference is stored as a path in older records.
    expect(describeReference("meetings/2026-08-01-incubator-scan")).toEqual({
      label: "Meeting notes, 1 Aug",
      href: "/meetings/2026-08-01-incubator-scan"
    });
  });

  it("spells out an event and an idea", () => {
    expect(describeReference("event:ufc:event:ufc-fight-night-gamrot-vs-salkilld")).toEqual({
      label: "UFC Fight Night Gamrot vs Salkilld"
    });
    expect(describeReference("idea-2026-08-05-bbffd7f5")).toEqual({ label: "Idea from 5 Aug" });
    expect(describeReference("budget-2026-08e")).toEqual({ label: "Budget decision, Aug 2026" });
  });

  it.each([
    ["a shape nobody writes", "SOURCE-INJECTION-FIXTURE"],
    ["an empty reference", "   "],
    ["a bare token", "whatever"]
  ])("drops %s rather than print it", (_name, reference) => {
    expect(describeReference(reference)).toBeNull();
  });
});
