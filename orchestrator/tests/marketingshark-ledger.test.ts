import { describe, expect, it } from "vitest";
import { contentHashOf, NormalizedQuestionSchema, type NormalizedQuestion } from "../src/ventures/marketingshark/bank.js";
import {
  brandLedgerFor,
  daysBetween,
  EMPTY_LEDGER,
  epochOrder,
  orderSeedFor,
  recordServed,
  rotationCoverage,
  selectQuestion,
  type MarketingSharkLedger,
  type ServedEntry
} from "../src/ventures/marketingshark/ledger.js";

const question = (id: string, overrides: Partial<NormalizedQuestion> = {}): NormalizedQuestion =>
  NormalizedQuestionSchema.parse({
    id,
    category: "javascript",
    difficulty: 2,
    importance: null,
    hasCode: false,
    correctIndex: 0,
    en: { introduction: "", question: "What is this?", options: ["a", "b", "c", "d"], explanation: "because" },
    ...overrides
  });

const bank = (count: number): NormalizedQuestion[] =>
  Array.from({ length: count }, (_, index) => question(`q${index + 1}`));

const served = (overrides: Partial<ServedEntry> = {}): ServedEntry => ({
  date: "2026-08-08",
  epoch: 1,
  questionId: "q1",
  hookA: "speed-run",
  hookB: "no-google",
  relaxed: false,
  package: "state/ventures/marketingshark/packages/2026-08-08/devshark/package.json",
  ...overrides
});

/** Serve every day from a start date until the bank is exhausted, exactly as the room would. */
function runDays(input: {
  days: number;
  questions: NormalizedQuestion[];
  startDate?: string;
}): { ledger: MarketingSharkLedger; picks: Array<{ date: string; questionId: string; epoch: number }> } {
  const contentHash = contentHashOf(input.questions);
  const ids = input.questions.map((entry) => entry.id);
  let ledger = EMPTY_LEDGER;
  const picks: Array<{ date: string; questionId: string; epoch: number }> = [];
  const start = Date.parse(`${input.startDate ?? "2026-08-08"}T00:00:00Z`);
  for (let day = 0; day < input.days; day += 1) {
    const date = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
    const selection = selectQuestion({ ledger, brandId: "devshark", date, questionIds: ids, contentHash });
    ledger = recordServed(ledger, "devshark", selection.brandLedger, served({
      date,
      epoch: selection.epoch,
      questionId: selection.questionId
    }));
    picks.push({ date, questionId: selection.questionId, epoch: selection.epoch });
  }
  return { ledger, picks };
}

describe("marketingShark selection ledger", () => {
  it("returns the same question for the same date and bank, however many times it is asked", () => {
    const questions = bank(50);
    const contentHash = contentHashOf(questions);
    const ids = questions.map((entry) => entry.id);

    const first = selectQuestion({ ledger: EMPTY_LEDGER, brandId: "devshark", date: "2026-08-08", questionIds: ids, contentHash });
    const ledger = recordServed(EMPTY_LEDGER, "devshark", first.brandLedger, served({ questionId: first.questionId }));

    // A backstop sweep, a rerun and a manual dispatch all land here on a morning that already ran.
    const rerun = selectQuestion({ ledger, brandId: "devshark", date: "2026-08-08", questionIds: ids, contentHash });
    expect(rerun.questionId).toBe(first.questionId);
    expect(rerun.alreadyServed).not.toBeNull();
    expect(rerun.reshuffle).toBeNull();
    expect(ledger.brands.devshark!.served).toHaveLength(1);

    // And a cold start with the same inputs reaches the same answer, because the order is a
    // property of the epoch and the bank hash rather than of when it was asked.
    const cold = selectQuestion({ ledger: EMPTY_LEDGER, brandId: "devshark", date: "2026-08-08", questionIds: ids, contentHash });
    expect(cold.questionId).toBe(first.questionId);
  });

  it("serves every question once before any question repeats", () => {
    const questions = bank(40);
    const { picks } = runDays({ days: 40, questions });

    expect(new Set(picks.map((pick) => pick.questionId)).size).toBe(40);
    expect(picks.every((pick) => pick.epoch === 1)).toBe(true);
  });

  it("records an epoch reshuffle on exhaustion and reseeds the order", () => {
    const questions = bank(12);
    const { ledger, picks } = runDays({ days: 25, questions });

    const brand = ledger.brands.devshark!;
    expect(brand.epoch).toBe(3);
    expect(brand.reshuffles.map((entry) => entry.epoch)).toEqual([2, 3]);
    expect(brand.reshuffles.every((entry) => entry.reason === "bank exhausted")).toBe(true);
    // Twelve questions, twelve days, then a fresh pass. No question is served twice inside one
    // epoch, which is the whole guarantee.
    for (const epoch of [1, 2]) {
      const inEpoch = picks.filter((pick) => pick.epoch === epoch).map((pick) => pick.questionId);
      expect(new Set(inEpoch).size).toBe(inEpoch.length);
      expect(inEpoch).toHaveLength(12);
    }
    // A reseeded epoch is a different order, not the same list again.
    const firstPass = picks.filter((pick) => pick.epoch === 1).map((pick) => pick.questionId);
    const secondPass = picks.filter((pick) => pick.epoch === 2).map((pick) => pick.questionId);
    expect(secondPass).not.toEqual(firstPass);
    expect([...secondPass].sort()).toEqual([...firstPass].sort());

    // WHICH question opens the new epoch was pinned by nothing: replacing the exhaustion-day pick
    // with a random index left every assertion above satisfied, because a random draw is still a
    // permutation. The determinism guarantee is weakest exactly here, so it is stated outright.
    const contentHash = contentHashOf(questions);
    expect(secondPass[0]).toBe(epochOrder(questions.map((entry) => entry.id), orderSeedFor(2, contentHash))[0]);
    expect(picks.filter((pick) => pick.epoch === 3)[0]!.questionId)
      .toBe(epochOrder(questions.map((entry) => entry.id), orderSeedFor(3, contentHash))[0]);
  });

  it("keeps served history and relative order when the bank is re-imported", () => {
    const original = bank(20);
    const { ledger } = runDays({ days: 5, questions: original });
    const servedIds = ledger.brands.devshark!.served.map((entry) => entry.questionId);

    const grown = [...original, question("new-1"), question("new-2"), question("new-3")];
    const grownHash = contentHashOf(grown);
    expect(grownHash).not.toBe(contentHashOf(original));

    const next = selectQuestion({
      ledger,
      brandId: "devshark",
      date: "2026-08-13",
      questionIds: grown.map((entry) => entry.id),
      contentHash: grownHash
    });

    // Nothing already served comes back, the epoch stands, and the new hash is recorded beside it.
    expect(servedIds).not.toContain(next.questionId);
    expect(next.epoch).toBe(1);
    expect(next.reshuffle).toBeNull();
    expect(next.brandLedger.contentHash).toBe(grownHash);
    expect(next.brandLedger.orderSeed).toBe(orderSeedFor(1, contentHashOf(original)));
    expect(next.brandLedger.served).toHaveLength(5);

    // Every surviving question keeps its position relative to the others. Only the new ids are
    // new entries in the order.
    const before = epochOrder(original.map((entry) => entry.id), next.brandLedger.orderSeed);
    const after = epochOrder(grown.map((entry) => entry.id), next.brandLedger.orderSeed);
    expect(after.filter((id) => !id.startsWith("new-"))).toEqual(before);
  });

  it("keeps one brand's exhaustion out of another brand's ledger", () => {
    const questions = bank(3);
    const ids = questions.map((entry) => entry.id);
    const contentHash = contentHashOf(questions);
    let ledger = EMPTY_LEDGER;

    for (const [index, date] of ["2026-08-08", "2026-08-09", "2026-08-10"].entries()) {
      const dev = selectQuestion({ ledger, brandId: "devshark", date, questionIds: ids, contentHash });
      ledger = recordServed(ledger, "devshark", dev.brandLedger, served({ date, epoch: dev.epoch, questionId: dev.questionId }));
      expect(index).toBeGreaterThanOrEqual(0);
    }

    const geo = selectQuestion({ ledger, brandId: "geoshark", date: "2026-08-10", questionIds: ids, contentHash });
    expect(geo.epoch).toBe(1);
    expect(geo.alreadyServed).toBeNull();
    expect(ledger.brands.devshark!.epoch).toBe(1);
  });

  it("creates a brand node on first sight without touching the ledger it was read from", () => {
    const node = brandLedgerFor(EMPTY_LEDGER, "geoshark", "a".repeat(64));
    expect(node.epoch).toBe(1);
    expect(node.served).toEqual([]);
    expect(node.orderSeed).toBe(orderSeedFor(1, "a".repeat(64)));
    expect(EMPTY_LEDGER.brands).toEqual({});
  });
});

describe("marketingShark rotation bookkeeping", () => {
  // Hook assignment itself moved to the studio and is exercised in studio/tests/hooks.test.ts:
  // eligible sets, the channel cooldown, archetype variety, the seeded pick and the `no-hook`
  // fallback. What stays here is what the ledger still owns — the rotation measure and the date
  // arithmetic both it and the channel cooldown are built on.

  it("counts rotation coverage over the trailing window only", () => {
    const history = [
      served({ date: "2026-07-01", hookA: "speed-run" }),
      served({ date: "2026-08-01", hookA: "no-google" }),
      served({ date: "2026-08-05", hookA: "bet-on-it" }),
      served({ date: "2026-08-06", hookA: "no-google" })
    ];
    expect(rotationCoverage(history, "2026-08-10", 30)).toBe(2);
    expect(rotationCoverage(history, "2026-08-10", 90)).toBe(3);
  });

  it("measures day gaps across a month boundary", () => {
    expect(daysBetween("2026-08-08", "2026-08-18")).toBe(10);
    expect(daysBetween("2026-07-31", "2026-08-01")).toBe(1);
    expect(daysBetween("2026-08-08", "2026-08-08")).toBe(0);
  });
});
