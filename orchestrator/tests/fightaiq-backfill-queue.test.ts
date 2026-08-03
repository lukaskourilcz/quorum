import { describe, expect, it } from "vitest";
import { FighterCardSchema } from "../src/contracts/mma.js";
import { buildBackfillQueue } from "../src/fightaiq/roster.js";
import { rebuildDerivedFighterData } from "../src/fightaiq/derived.js";
import fighterFixture from "../../contracts/fixtures/fighter-record.valid.json" with { type: "json" };

const NOW = new Date("2026-08-03T12:00:00.000Z");

function card(overrides: Record<string, unknown>) {
  return FighterCardSchema.parse({ ...fighterFixture, ...overrides });
}

/** A critical field on a single provider — populated, but never usable by the model. */
function singleSourced(value: string) {
  return { value, sourceRefs: ["source:wikipedia:1"], retrievedAt: "2026-08-01T10:00:00.000Z", status: "provisional" as const, corroborated: false };
}

describe("what puts a fighter back in the backfill queue", () => {
  it("queues a card whose critical fields rest on one provider, gaps or no gaps", () => {
    // Fifty of ninety-two cards carried a division and a record and none was model-eligible,
    // because every value came from one source. Filling gaps cannot fix that; only a second
    // reading can, and nothing was asking for one.
    const subject = card({
      history: [],
      modelEligible: false,
      fields: { ...fighterFixture.fields, division: singleSourced("Lightweight"), record: singleSourced("12-2-0") }
    });
    const queue = buildBackfillQueue({ fighters: [subject], bouts: [], now: NOW });
    expect(queue[0]!.uncorroborated).toEqual(["division", "record"]);
  });

  it("lists the single-sourced fields even when another reason ranks higher", () => {
    // The backfill decides whether to re-read from this list, not from the winning reason: the
    // twenty-seven profiles with no history at all were also the worst-corroborated ones.
    const subject = card({
      history: [],
      modelEligible: false,
      fields: { ...fighterFixture.fields, division: singleSourced("Lightweight") }
    });
    const [item] = buildBackfillQueue({ fighters: [subject], bouts: [], now: NOW });
    expect(item!.reason).toBe("missing-history");
    expect(item!.uncorroborated).toEqual(["division"]);
  });

  it("serves the least recently read first inside a band", () => {
    // Breaking the tie on the id served the same alphabetically-first twelve every run, so the
    // tail of the roster was never re-read at all.
    const stale = card({ id: "ufc:zz-example", slug: "zz-example", history: [], quality: { ...fighterFixture.quality, lastReviewedAt: "2026-07-01T00:00:00.000Z" } });
    const fresh = card({ id: "ufc:aa-example", slug: "aa-example", history: [], quality: { ...fighterFixture.quality, lastReviewedAt: "2026-08-02T00:00:00.000Z" } });
    const queue = buildBackfillQueue({ fighters: [fresh, stale], bouts: [], now: NOW });
    expect(queue.map((item) => item.fighterRef)).toEqual(["ufc:zz-example", "ufc:aa-example"]);
  });
});

describe("a stated record against a history that does not cover it", () => {
  it("calls it incomplete rather than a conflict", () => {
    // We hold four of Ilia Topuria's eighteen bouts. Reading 3-1-0 against 17-1-0 as two sources
    // disagreeing opened a discrepancy that could never close, and an open discrepancy on a
    // critical field bars the fighter from the model for good.
    const subject = card({ history: [], modelEligible: true });
    const [rebuilt] = rebuildDerivedFighterData({ fighters: [subject], bouts: [], now: NOW });
    expect(rebuilt!.discrepancies.filter((item) => item.status === "open" && item.field === "record")).toEqual([]);
    expect(rebuilt!.quality.gaps).not.toContain("record-history-mismatch");
  });
});
