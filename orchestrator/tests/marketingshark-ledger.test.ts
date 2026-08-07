import { describe, expect, it } from "vitest";
import { contentHashOf, NormalizedQuestionSchema, truthSubjectOf, type NormalizedQuestion } from "../src/ventures/marketingshark/bank.js";
import { loadMarketingSharkConfig, patternIsTruthful, type HookPattern } from "../src/ventures/marketingshark/config.js";
import {
  assignHooks,
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

describe("marketingShark hook assignment", () => {
  const library = async (): Promise<HookPattern[]> => (await loadMarketingSharkConfig()).hookLibrary;
  const brand = { tone: "dev" as const, categoryLists: { commonUse: ["javascript"], interview: ["dsa"], core: ["git"] } };

  it("never offers a pattern whose truth condition fails for the question", async () => {
    const easy = question("q1", { difficulty: 1, hasCode: false, category: "misc", en: { introduction: "", question: "What is this?", options: ["a", "b", "c"], explanation: "x" } });
    const assignment = assignHooks({
      library: await library(), brand, brandId: "devshark", question: easy,
      date: "2026-08-08", served: [], minEligibleBeforeRelax: 2
    });

    // difficulty 1, three options, no code, an uncategorised category and no "Why" opening: only
    // the unconditional patterns can truthfully front it.
    expect(assignment.eligibleIds).toEqual(["speed-run", "no-google", "bet-on-it", "explain-it", "daily-rep"]);
    expect(assignment.relaxed).toBe(false);
    expect(assignment.a.id).not.toBe(assignment.b.id);
  });

  it("picks A and B deterministically, and B is the next eligible pattern after A", async () => {
    const patterns = await library();
    const input = {
      library: patterns, brand, brandId: "devshark", question: question("q7", { difficulty: 4, hasCode: true, category: "javascript" }),
      date: "2026-08-08", served: [], minEligibleBeforeRelax: 2
    };
    const first = assignHooks(input);
    const second = assignHooks(input);

    expect(first.a.id).toBe(second.a.id);
    expect(first.b.id).toBe(second.b.id);
    const indexA = first.eligibleIds.indexOf(first.a.id);
    expect(first.eligibleIds[(indexA + 1) % first.eligibleIds.length]).toBe(first.b.id);

    // A different date moves the pick without any other input changing.
    const later = assignHooks({ ...input, date: "2026-09-14" });
    expect(later.eligibleIds).toEqual(first.eligibleIds);
    expect(later.a.id).not.toBe(first.a.id);
  });

  it("excludes a pattern inside its cooldown and lets it back at the boundary", async () => {
    const patterns = await library();
    const history = [served({ date: "2026-08-08", hookA: "speed-run", hookB: "no-google" })];
    const input = {
      library: patterns, brand, brandId: "devshark", question: question("q2", { difficulty: 1, category: "misc" }),
      served: history, minEligibleBeforeRelax: 2
    };

    // cooldownDays is 10: nine days later it is still blocked, ten days later it is back.
    expect(assignHooks({ ...input, date: "2026-08-17" }).eligibleIds).not.toContain("speed-run");
    expect(assignHooks({ ...input, date: "2026-08-18" }).eligibleIds).toContain("speed-run");

    // Slot B does not spend the cooldown. It is recorded as the alternate and never fronts
    // anything, and counting it would burn two patterns a day against a sixteen-pattern library.
    expect(assignHooks({ ...input, date: "2026-08-09" }).eligibleIds).toContain("no-google");
  });

  it("relaxes the cooldown oldest-first, only as far as two, and says that it did", async () => {
    const patterns = await library();
    // Five consecutive days burn every unconditional pattern; the question can front nothing else.
    const history = [
      served({ date: "2026-08-08", hookA: "speed-run" }),
      served({ date: "2026-08-09", hookA: "no-google" }),
      served({ date: "2026-08-10", hookA: "bet-on-it" }),
      served({ date: "2026-08-11", hookA: "explain-it" }),
      served({ date: "2026-08-12", hookA: "daily-rep" })
    ];
    const assignment = assignHooks({
      library: patterns, brand, brandId: "devshark",
      question: question("q3", { difficulty: 1, category: "misc", en: { introduction: "", question: "What is this?", options: ["a", "b", "c"], explanation: "x" } }),
      date: "2026-08-13", served: history, minEligibleBeforeRelax: 2
    });

    expect(assignment.relaxed).toBe(true);
    // Exactly two, oldest use first. Relaxation buys the day a hook; it does not reopen the library.
    expect(assignment.eligibleIds).toEqual(["speed-run", "no-google"]);
    expect([assignment.a.id, assignment.b.id].sort()).toEqual(["no-google", "speed-run"]);
  });

  it("relaxation reaches the cooldown and never the truth rule", async () => {
    const patterns = await library();
    const easy = question("q4", { difficulty: 1, hasCode: false, category: "misc", en: { introduction: "", question: "What is this?", options: ["a", "b", "c"], explanation: "x" } });
    const truthful = patterns
      .filter((pattern) => patternIsTruthful(pattern, brand.tone, truthSubjectOf(easy), brand.categoryLists))
      .map((pattern) => pattern.id);

    // Every pattern that could truthfully front this question, used inside its own cooldown.
    const history = truthful.map((id, index) => served({
      date: new Date(Date.parse("2026-08-08T00:00:00Z") + index * 86_400_000).toISOString().slice(0, 10),
      hookA: id
    }));
    const assignment = assignHooks({
      library: patterns, brand, brandId: "devshark", question: easy,
      date: "2026-08-13", served: history, minEligibleBeforeRelax: 2
    });

    // Relaxation has to fire, and everything it hands back is still true of this question. A
    // "hard mode" hook on a difficulty-1 question is not a compromise this makes at any pressure.
    expect(assignment.relaxed).toBe(true);
    expect(assignment.eligibleIds.every((id) => truthful.includes(id))).toBe(true);
    for (const untruthful of ["hard-mode", "spot-it", "streak-breaker", "two-look-right", "know-why"]) {
      expect(truthful).not.toContain(untruthful);
      expect(assignment.eligibleIds).not.toContain(untruthful);
    }
  });

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
