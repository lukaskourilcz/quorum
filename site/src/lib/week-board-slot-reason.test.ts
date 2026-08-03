import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// week-board.tsx cannot be imported here: the site tsconfig sets jsx=preserve, so vitest has no
// transform for a .tsx. src/lib/public-route-policy.test.ts reads component sources for the same
// reason, so this guard reads the two slot branches instead of rendering them.
const boardSource = readFile(
  path.resolve(import.meta.dirname, "../components/week-board.tsx"),
  "utf8"
);

describe("the week board keeps the reason a slot was skipped", () => {
  it("gives both slot branches the reason, not only the one with a meeting link", async () => {
    // buildPublicCalendarFeed sets decisionOneLiner on a skipped slot, but a skipped slot has no
    // meeting page, so it took the branch that carried neither title nor reason. Every skip
    // reached the owner as a coloured square with no explanation anywhere.
    const tags = (await boardSource).match(/<(?:Link|div)\b[^>]*\bdata-calendar-slot\b[^>]*>/g) ?? [];
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(tag).toContain("title={slot.decisionOneLiner}");
      expect(tag).toContain("aria-label={label}");
    }
  });

  it("prints the reason inside the cell that has no page to open", async () => {
    const source = await boardSource;
    const unlinked = source.slice(source.lastIndexOf("data-calendar-slot"));
    expect(unlinked).toContain("data-calendar-reason");
    expect(unlinked).toContain("{slot.decisionOneLiner}");
  });

  it("folds the reason into the accessible name", async () => {
    // An element that already has an aria-label never announces its title, so title alone left
    // the reason reachable by mouse hover only.
    const source = await boardSource;
    const helper = source.slice(source.indexOf("function calendarSlotLabel"));
    expect(helper.slice(0, helper.indexOf("\n}"))).toContain("parts.push(slot.decisionOneLiner)");
  });
});
