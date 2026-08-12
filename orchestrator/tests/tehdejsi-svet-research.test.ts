import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TS_RESEARCH_BRIEF_CEILING_USD,
  TS_RESEARCH_MONTHLY_CEILING_USD,
  type TsResearchLedgerEntry,
  type TsResearchPurchase
} from "../src/contracts/ts-research.js";
import {
  appendTsResearchLedger,
  assertTsResearchReservation,
  briefHash,
  decideResearch,
  findPurchase,
  loadBriefPriorities,
  monthlySpendUsd,
  nextUnansweredPriority,
  priorityBrief,
  readTsResearchLedger,
  researchUsage,
  TsResearchBudgetError,
  type TsBrief
} from "../src/ventures/tehdejsi-svet/research.js";

const NOW = new Date("2026-08-14T12:00:00.000Z");
const BRIEF: TsBrief = {
  topicKey: "ua-everyday-1970s",
  question: "What did an ordinary week cost in a Ukrainian city between 1970 and 1985?",
  language: "uk"
};

const temporaryRoots: string[] = [];

async function temporaryState(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-research-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function purchase(overrides: Partial<TsResearchPurchase> = {}): TsResearchPurchase {
  return {
    schemaVersion: "ts-research-ledger/1",
    kind: "purchase",
    topicKey: BRIEF.topicKey,
    briefHash: briefHash(BRIEF),
    cycleId: "cycle-2026-08-13-ts",
    provider: "anthropic-web-search",
    model: "claude-test",
    startedAt: "2026-08-13T17:00:00.000Z",
    completedAt: "2026-08-13T17:02:00.000Z",
    tokensIn: 1_200,
    tokensOut: 800,
    searches: 3,
    costUsd: 0.18,
    dossierRef: "state/ventures/tehdejsi-svet/dossiers/ua-everyday-1970s-abc123def456.json",
    ...overrides
  };
}

describe("Tehdejsi svet research ceilings", () => {
  it("refuses a brief above the per-brief ceiling rather than trimming it", () => {
    // Trimming would buy a worse answer at the edge of the cap, which is where a partial answer
    // is least useful.
    expect(() => assertTsResearchReservation({ envelopeUsd: 0.31, now: NOW }, []))
      .toThrow(TsResearchBudgetError);
    try {
      assertTsResearchReservation({ envelopeUsd: 0.31, now: NOW }, []);
    } catch (error) {
      expect((error as TsResearchBudgetError).code).toBe("BRIEF_CAP");
    }
    expect(assertTsResearchReservation({ envelopeUsd: TS_RESEARCH_BRIEF_CEILING_USD, now: NOW }, []).envelopeUsd)
      .toBe(TS_RESEARCH_BRIEF_CEILING_USD);
  });

  it("refuses a brief the month cannot afford, counting only this month's purchases", () => {
    const ledger: TsResearchLedgerEntry[] = [
      purchase({ costUsd: 0.3, briefHash: "a".repeat(64), completedAt: "2026-08-01T10:00:00.000Z" }),
      purchase({ costUsd: 0.3, briefHash: "b".repeat(64), completedAt: "2026-08-05T10:00:00.000Z" }),
      purchase({ costUsd: 0.3, briefHash: "c".repeat(64), completedAt: "2026-08-09T10:00:00.000Z" }),
      purchase({ costUsd: 0.3, briefHash: "d".repeat(64), completedAt: "2026-08-11T10:00:00.000Z" }),
      purchase({ costUsd: 0.3, briefHash: "e".repeat(64), completedAt: "2026-08-12T10:00:00.000Z" }),
      purchase({ costUsd: 0.3, briefHash: "f".repeat(64), completedAt: "2026-08-13T10:00:00.000Z" }),
      // Last month's spend is last month's problem and must not shrink this month's headroom.
      purchase({ costUsd: 0.3, briefHash: "0".repeat(64), completedAt: "2026-07-30T10:00:00.000Z" })
    ];
    expect(monthlySpendUsd(ledger, NOW)).toBe(1.8);
    expect(assertTsResearchReservation({ envelopeUsd: 0.2, now: NOW }, ledger).monthlyRemainingUsd).toBe(0.2);
    try {
      assertTsResearchReservation({ envelopeUsd: 0.25, now: NOW }, ledger);
      expect.unreachable("a brief above the remaining headroom must be refused");
    } catch (error) {
      expect((error as TsResearchBudgetError).code).toBe("MONTHLY_CAP");
    }
  });

  it("refuses a caller trying to raise the monthly ceiling above the standing one", () => {
    try {
      assertTsResearchReservation({ envelopeUsd: 0.1, now: NOW, monthlyCeilingUsd: 25 }, []);
      expect.unreachable("the standing ceiling cannot be raised by an argument");
    } catch (error) {
      expect((error as TsResearchBudgetError).code).toBe("INVALID_CAP");
    }
    expect(TS_RESEARCH_MONTHLY_CEILING_USD).toBe(2);
  });
});

describe("Tehdejsi svet research idempotency", () => {
  it("keys a purchase on the topic and the exact brief that was asked", () => {
    const ledger = [purchase()];
    expect(findPurchase(ledger, BRIEF)?.costUsd).toBe(0.18);
    // Same topic, different question: a different purchase, because a reworded brief buys a
    // different answer.
    expect(findPurchase(ledger, { ...BRIEF, question: `${BRIEF.question} And what was on the radio?` }))
      .toBeNull();
    // Same question, different topic key: also a different purchase.
    expect(findPurchase(ledger, { ...BRIEF, topicKey: "era-music" })).toBeNull();
  });

  it("hashes a brief by its values and not by the order they were written", () => {
    const reordered: TsBrief = { language: "uk", question: BRIEF.question, topicKey: BRIEF.topicKey };
    expect(briefHash(reordered)).toBe(briefHash(BRIEF));
  });

  it("reuses a bought brief even when the month has no headroom left", () => {
    const spent = Array.from({ length: 7 }, (_, index) => purchase({
      costUsd: 0.29,
      briefHash: `${index}`.repeat(64).slice(0, 64),
      completedAt: "2026-08-10T10:00:00.000Z"
    }));
    const decision = decideResearch({ brief: BRIEF, envelopeUsd: 0.2, now: NOW }, [...spent, purchase()]);
    expect(decision.status).toBe("reused");
    expect(decision.status === "reused" && decision.purchase.dossierRef).toContain("dossiers/");
  });

  it("declines rather than throwing when the money is gone, because writing without a dossier is normal", () => {
    const exhausted = [purchase({ costUsd: 0.3, briefHash: "a".repeat(64) }),
      purchase({ costUsd: 0.3, briefHash: "b".repeat(64) }),
      purchase({ costUsd: 0.3, briefHash: "c".repeat(64) }),
      purchase({ costUsd: 0.3, briefHash: "d".repeat(64) }),
      purchase({ costUsd: 0.3, briefHash: "e".repeat(64) }),
      purchase({ costUsd: 0.3, briefHash: "f".repeat(64) }),
      purchase({ costUsd: 0.2, briefHash: "9".repeat(64) })];
    const decision = decideResearch(
      { brief: { ...BRIEF, topicKey: "era-music" }, envelopeUsd: 0.2, now: NOW },
      exhausted
    );
    expect(decision).toMatchObject({ status: "declined", code: "MONTHLY_CAP" });
  });

  it("names the dossier a purchase will write, so the ref is decided before the money is spent", () => {
    const decision = decideResearch({ brief: BRIEF, envelopeUsd: 0.2, now: NOW }, []);
    expect(decision.status).toBe("buy");
    expect(decision.status === "buy" && decision.dossierRef)
      .toBe(`state/ventures/tehdejsi-svet/dossiers/ua-everyday-1970s-${briefHash(BRIEF).slice(0, 12)}.json`);
  });
});

describe("Tehdejsi svet research ledger", () => {
  it("round-trips through an append-only file", async () => {
    const root = await temporaryState();
    expect(await readTsResearchLedger(root)).toEqual([]);
    await appendTsResearchLedger(root, [purchase()]);
    await appendTsResearchLedger(root, [{
      schemaVersion: "ts-research-ledger/1",
      kind: "use",
      topicKey: BRIEF.topicKey,
      briefHash: briefHash(BRIEF),
      at: "2026-08-14T18:00:00.000Z",
      recommendationId: "ts-2026-08-14-kyiv-fares"
    }]);
    expect(await readTsResearchLedger(root)).toHaveLength(2);
  });

  it("derives what the spend bought instead of flipping a flag on the purchase", () => {
    // A rewritable line is a line that can be made to say the spend never happened, so usage is
    // a second append and the file stays append-only.
    const usage = researchUsage([
      purchase(),
      { schemaVersion: "ts-research-ledger/1", kind: "use", topicKey: BRIEF.topicKey, briefHash: briefHash(BRIEF), at: "2026-08-14T18:00:00.000Z", recommendationId: "ts-a" },
      { schemaVersion: "ts-research-ledger/1", kind: "use", topicKey: BRIEF.topicKey, briefHash: briefHash(BRIEF), at: "2026-08-20T18:00:00.000Z", recommendationId: "ts-a" },
      { schemaVersion: "ts-research-ledger/1", kind: "use", topicKey: BRIEF.topicKey, briefHash: briefHash(BRIEF), at: "2026-08-21T18:00:00.000Z", recommendationId: "ts-b" }
    ]);
    expect(usage).toEqual([{ topicKey: BRIEF.topicKey, briefHash: briefHash(BRIEF), costUsd: 0.18, usedBy: ["ts-a", "ts-b"] }]);
  });

  it("drops a use that names no purchase, and shows a purchase nothing used", () => {
    const usage = researchUsage([
      purchase({ topicKey: "era-music", briefHash: "c".repeat(64) }),
      { schemaVersion: "ts-research-ledger/1", kind: "use", topicKey: "never-bought", briefHash: "d".repeat(64), at: "2026-08-14T18:00:00.000Z", recommendationId: "ts-c" }
    ]);
    expect(usage).toEqual([{ topicKey: "era-music", briefHash: "c".repeat(64), costUsd: 0.18, usedBy: [] }]);
  });

  it("refuses a ledger line recording a cost above the per-brief ceiling", async () => {
    const root = await temporaryState();
    await expect(appendTsResearchLedger(root, [purchase({ costUsd: 0.31 })])).rejects.toThrow();
  });
});

describe("Tehdejsi svet standing brief priorities", () => {
  it("reads them as ranked data with a rationale a reviewer can disagree with", async () => {
    const priorities = await loadBriefPriorities();
    expect(priorities.map((priority) => priority.topicKey))
      .toEqual(["ua-everyday-1970s", "ua-culture-gaps", "cs-ua-names-pre-2010", "era-music"]);
    for (const priority of priorities) {
      expect(priority.rationale.length).toBeGreaterThan(20);
    }
  });

  it("walks the priorities in rank order and skips the ones already bought", async () => {
    const priorities = await loadBriefPriorities();
    expect((await nextUnansweredPriority([]))?.topicKey).toBe("ua-everyday-1970s");

    const bought = priorities.slice(0, 2).map((priority) => purchase({
      topicKey: priority.topicKey,
      briefHash: briefHash(priorityBrief(priority))
    }));
    expect((await nextUnansweredPriority(bought))?.topicKey).toBe("cs-ua-names-pre-2010");

    const all = priorities.map((priority) => purchase({
      topicKey: priority.topicKey,
      briefHash: briefHash(priorityBrief(priority))
    }));
    expect(await nextUnansweredPriority(all)).toBeNull();
  });
});
