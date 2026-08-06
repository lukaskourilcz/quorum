import { describe, expect, it } from "vitest";
import type { ArticlePackage } from "../src/contracts/mma-files.js";
import type { BoutRecord } from "../src/contracts/mma.js";
import { SUBJECT_REPEAT_WINDOW_DAYS, spentSubjectRefs } from "../src/mma-files/repeat-window.js";

const NOW = new Date("2026-08-06T08:00:00.000Z");
const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - (days * DAY_MS)).toISOString();
}

function article(overrides: Partial<ArticlePackage>): ArticlePackage {
  return {
    fighterRefs: [],
    publishAt: daysAgo(1),
    ...overrides
  } as ArticlePackage;
}

function completedBout(refs: [string, string], at: string): BoutRecord {
  return {
    status: "completed",
    event: { startsAtUtc: at },
    fighters: { red: refs[0], blue: refs[1] }
  } as unknown as BoutRecord;
}

/**
 * The old rule marked every ref an article ever declared as spent for good. Against a 92-fighter
 * roster and, since the cadence became one article a day, a single slot, that is a countdown: a
 * little under three months of material and then a desk with nothing left and no way back.
 */
describe("when a subject the desk covered becomes writable again", () => {
  it("keeps it spent inside the window", () => {
    const spent = spentSubjectRefs({
      articles: [article({ fighterRefs: ["ufc:aleksandar-rakic"], publishAt: daysAgo(1) })],
      now: NOW
    });

    expect([...spent]).toEqual(["ufc:aleksandar-rakic"]);
  });

  it("releases it once the window has passed", () => {
    const spent = spentSubjectRefs({
      articles: [article({
        fighterRefs: ["ufc:aleksandar-rakic"],
        publishAt: daysAgo(SUBJECT_REPEAT_WINDOW_DAYS + 1)
      })],
      now: NOW
    });

    expect([...spent]).toEqual([]);
  });

  it("releases it the moment they fight again, whatever the calendar says", () => {
    // A fighter who has fought since the desk last covered them is a new story on the day of the
    // fight. The bout record is the dated, sourced fact that it happened; the fighter card's own
    // history is a summary the intake rewrites.
    const spent = spentSubjectRefs({
      articles: [article({ fighterRefs: ["ufc:aleksandar-rakic"], publishAt: daysAgo(10) })],
      bouts: [completedBout(["ufc:aleksandar-rakic", "ufc:jiri-prochazka"], daysAgo(3))],
      now: NOW
    });

    expect([...spent]).toEqual([]);
  });

  it("ignores a bout that happened before the coverage, or has not happened yet", () => {
    const spent = spentSubjectRefs({
      articles: [article({ fighterRefs: ["ufc:aleksandar-rakic"], publishAt: daysAgo(3) })],
      bouts: [
        completedBout(["ufc:aleksandar-rakic", "ufc:jiri-prochazka"], daysAgo(30)),
        { ...completedBout(["ufc:aleksandar-rakic", "ufc:magomed-ankalaev"], daysAgo(1)), status: "announced" } as BoutRecord
      ],
      now: NOW
    });

    expect([...spent]).toEqual(["ufc:aleksandar-rakic"]);
  });

  it("counts every ref an article declared, not only its headline subject", () => {
    const spent = spentSubjectRefs({
      articles: [article({
        fighterRefs: ["ufc:aleksandar-rakic", "ufc:jiri-prochazka"],
        eventRef: "ufc:event:ufc-330-makhachev-vs-machado-garry"
      })],
      now: NOW
    });

    expect([...spent].sort()).toEqual([
      "ufc:aleksandar-rakic",
      "ufc:event:ufc-330-makhachev-vs-machado-garry",
      "ufc:jiri-prochazka"
    ]);
  });

  it("measures from the most recent coverage when a subject has several", () => {
    const spent = spentSubjectRefs({
      articles: [
        article({ fighterRefs: ["ufc:aleksandar-rakic"], publishAt: daysAgo(90) }),
        article({ fighterRefs: ["ufc:aleksandar-rakic"], publishAt: daysAgo(2) })
      ],
      now: NOW
    });

    expect([...spent]).toEqual(["ufc:aleksandar-rakic"]);
  });

  it("is six weeks", () => {
    // Long enough that no reader sees the same fighter twice in a month and a half, short enough
    // that a 92-fighter roster refills faster than one daily slot drains it.
    expect(SUBJECT_REPEAT_WINDOW_DAYS).toBe(42);
  });
});
