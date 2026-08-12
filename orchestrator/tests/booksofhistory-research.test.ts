import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BhResearchBriefBundle } from "../src/contracts/bh-research-brief.js";
import type { BhResearchLedgerEntry } from "../src/contracts/bh-dossier.js";
import type { BhSeedLibrary } from "../src/contracts/bh-seed.js";
import type { guardedJsonCall } from "../src/llm/call.js";
import { repoRoot } from "../src/paths.js";
import type { RawResearch, ResearchProvider } from "../src/research/provider.js";
import {
  assessBhResearchNeed,
  appendBhResearchLedger,
  assertBhResearchReservation,
  BH_RESEARCH_LEDGER_PATH,
  bhDossierPath,
  BhResearchBudgetError,
  parseBhResearchLedgerJsonl,
  planBhResearchBatch,
  runBhCandidateResearch,
  type BhSynthCallConfig
} from "../src/ventures/booksofhistory/research.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureInput() {
  const [library, bundle] = await Promise.all([
    readFile(path.join(repoRoot, "state/ventures/booksofhistory/seed/library.json"), "utf8")
      .then((raw) => JSON.parse(raw) as BhSeedLibrary),
    readFile(path.join(repoRoot, "contracts/fixtures/bh-research-brief.valid.json"), "utf8")
      .then((raw) => JSON.parse(raw) as BhResearchBriefBundle)
  ]);
  const brief = bundle.briefs[0]!;
  const book = library.books.find(({ bookId }) => bookId === brief.bookId)!;
  return { book, brief };
}

function synthesis() {
  return {
    claims: [{
      claimId: "claim-publication-context",
      text: "The first edition appeared in 1936 through a documented serial-to-book path.",
      sources: [
        { url: "https://example.com/archive", title: "Archive catalogue", category: "archive" },
        { url: "https://example.org/study", title: "Publishing study", category: "scholarship" }
      ],
      confidence: 0.91,
      corroboration: 2,
      verificationState: "verified",
      publicationSuitable: true
    }],
    storyCandidates: [{
      storyId: "story-serial-to-book",
      angle: "How a serial publication became the book readers recognize.",
      score: 88,
      claimRefs: ["claim-publication-context"],
      used: false
    }],
    quotes: [{
      text: "A short attributed line from the archival record.",
      attribution: "Archive catalogue",
      sourceUrl: "https://example.com/archive",
      claimRef: "claim-publication-context"
    }],
    visualNotes: ["Use abstract typography and a dated printing timeline without depicting the jacket."]
  };
}

function rawResearch(): RawResearch {
  return {
    response: { findings: [{ source: "https://example.com/archive", signal: "publication record" }] },
    providerId: "stub-research",
    model: "fixture-research-model",
    startedAt: "2026-08-12T10:10:00.000Z",
    completedAt: "2026-08-12T10:10:01.000Z",
    tokensIn: 100,
    tokensOut: 200,
    searchUses: 1,
    usd: 0.02
  };
}

function provider() {
  const researchBook = vi.fn(async () => rawResearch());
  return { value: { researchBook } satisfies ResearchProvider, researchBook };
}

function synthCall() {
  const call = vi.fn(async (request: Parameters<typeof guardedJsonCall>[0]) => ({
    value: request.parse(JSON.stringify(synthesis())),
    cached: false,
    usd: 0.01,
    usage: {
      model: "claude-haiku-4-5-20251001",
      tokensIn: 300,
      tokensOut: 150,
      toolUses: 0
    }
  }));
  return call as unknown as typeof guardedJsonCall & typeof call;
}

function callConfig(): BhSynthCallConfig {
  return {
    stateRoot: "/unused",
    cycleId: "bh-20260812-001",
    phase: "bh-research",
    ventureId: "booksofhistory",
    agent: "RESEARCH_SYNTH",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    system: "Normalize the retained fixture only.",
    maxOutputTokens: 3_000,
    budgetContext: {
      now: new Date("2026-08-12T10:10:00.000Z"),
      cycleId: "bh-20260812-001",
      stage: "VALIDATION",
      ledger: [],
      allInNonApiSpentUsd: 0,
      allInCommittedUsd: 0,
      knownMonthlyForecastUsd: 0,
      remainingScheduledCycles: 1
    }
  };
}

function researchBudget(candidateCount = 1) {
  return {
    candidateCount,
    synthEnvelopeUsd: 0.05,
    cycleEnvelopeUsd: 0.5,
    monthlyCeilingUsd: 5,
    recordedMonthlyHeadroomUsd: 1
  };
}

describe("BOOKSOFHISTORY candidate research", () => {
  it("gathers, synthesizes and writes byte-stable normalized and raw dossier files", async () => {
    const { book, brief } = await fixtureInput();
    const outputs: Array<{ dossier: string; raw: string; ledger: string }> = [];
    for (let index = 0; index < 2; index += 1) {
      const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-research-"));
      roots.push(root);
      const gather = provider();
      const synth = synthCall();
      const result = await runBhCandidateResearch({
        root,
        book,
        brief,
        provider: gather.value,
        gatherEnvelopeUsd: 0.1,
        researchedAt: new Date("2026-08-12T10:10:02.000Z"),
        requestingMeetingRef: "meetings/2026-08-12-bh-desk.json",
        researchBudget: researchBudget(),
        synthCallConfig: callConfig(),
        synthCall: synth
      });
      expect(result.status).toBe("researched");
      if (result.status !== "researched") throw new Error("fixture research must complete");
      expect(result.precheck).toEqual({
        existingDossier: false,
        questionAnswered: false,
        trustworthy: false,
        stale: false,
        shelfSufficient: false,
        decision: "research",
        reason: "missing-dossier"
      });
      expect(gather.researchBook).toHaveBeenCalledOnce();
      expect(synth).toHaveBeenCalledOnce();
      const rawRef = result.rawRef;
      outputs.push({
        dossier: await readFile(path.join(root, bhDossierPath(book.bookId)), "utf8"),
        raw: await readFile(path.join(root, rawRef), "utf8"),
        ledger: await readFile(path.join(root, BH_RESEARCH_LEDGER_PATH), "utf8")
      });
    }

    expect(outputs[0]).toEqual(outputs[1]);
    const dossier = JSON.parse(outputs[0]!.dossier);
    const raw = JSON.parse(outputs[0]!.raw);
    const ledger = parseBhResearchLedgerJsonl(outputs[0]!.ledger);
    expect(dossier).toMatchObject({
      schemaVersion: "bh-dossier/1",
      bookId: book.bookId,
      answeredBriefHashes: [brief.briefHash],
      storyCandidates: [{ storyId: "story-serial-to-book", score: 88, used: false }]
    });
    expect(dossier.quotes[0].text.length).toBeLessThanOrEqual(300);
    expect(dossier.quotes[0].attribution).toBeTruthy();
    expect(raw).toMatchObject({
      schemaVersion: "bh-raw-research/1",
      briefHash: brief.briefHash,
      research: { response: rawResearch().response }
    });
    expect(ledger).toEqual([
      expect.objectContaining({ step: "gather", searches: 1, costUsd: 0.02, used: false }),
      expect.objectContaining({ step: "synth", searches: 0, costUsd: 0.01, tokensIn: 300, used: false })
    ]);
  });

  it("reuses a fresh, trustworthy, answered and sufficient shelf without either call", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-reuse-"));
    roots.push(root);
    const { book, brief } = await fixtureInput();
    const firstGather = provider();
    await runBhCandidateResearch({
      root,
      book,
      brief,
      provider: firstGather.value,
      gatherEnvelopeUsd: 0.1,
      researchedAt: new Date("2026-08-12T10:10:02.000Z"),
      requestingMeetingRef: "meetings/2026-08-12-bh-desk.json",
      researchBudget: researchBudget(),
      synthCallConfig: callConfig(),
      synthCall: synthCall()
    });
    const secondGather = provider();
    const secondSynth = synthCall();
    const reused = await runBhCandidateResearch({
      root,
      book,
      brief,
      provider: secondGather.value,
      gatherEnvelopeUsd: 0.1,
      researchedAt: new Date("2026-08-13T10:10:02.000Z"),
      requestingMeetingRef: "meetings/2026-08-12-bh-desk.json",
      researchBudget: researchBudget(),
      synthCallConfig: callConfig(),
      synthCall: secondSynth
    });

    expect(reused.status).toBe("already-researched");
    if (reused.status !== "already-researched") throw new Error("fixture must hit idempotency");
    expect(reused.message).toContain("zero provider calls made");
    expect(secondGather.researchBook).not.toHaveBeenCalled();
    expect(secondSynth).not.toHaveBeenCalled();
  });

  it("records every check and treats malformed stored data as existing but untrustworthy", () => {
    expect(assessBhResearchNeed({
      dossier: { schemaVersion: "bh-dossier/1", claims: "not-an-array" },
      briefHash: "a".repeat(64),
      now: new Date("2026-08-12T10:00:00.000Z")
    })).toEqual({
      existingDossier: true,
      questionAnswered: false,
      trustworthy: false,
      stale: false,
      shelfSufficient: false,
      decision: "research",
      reason: "unanswered-question"
    });
  });

  it("appends validated research ledger lines without rewriting existing bytes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-ledger-"));
    roots.push(root);
    const fixture = JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/bh-research-ledger.valid.json"),
      "utf8"
    )) as BhResearchLedgerEntry;
    await appendBhResearchLedger(root, [fixture]);
    const before = await readFile(path.join(root, BH_RESEARCH_LEDGER_PATH), "utf8");
    await appendBhResearchLedger(root, [{
      ...fixture,
      step: "synth",
      searches: 0,
      startedAt: fixture.completedAt,
      costUsd: 0.01
    }]);
    const after = await readFile(path.join(root, BH_RESEARCH_LEDGER_PATH), "utf8");
    expect(after.startsWith(before)).toBe(true);
    expect(parseBhResearchLedgerJsonl(after)).toHaveLength(2);
  });

  it("keeps two candidates by default and admits a third only when all three are reserved", async () => {
    const bundle = JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/bh-research-brief.valid.json"),
      "utf8"
    )) as BhResearchBriefBundle;
    const third = {
      ...bundle.briefs[1]!,
      bookId: "third-book",
      bookRef: "ventures/booksofhistory/seed/library.json#third-book",
      shortlistRank: 3,
      briefHash: "c".repeat(64)
    };
    const common = {
      bundle: { ...bundle, maximumCandidates: 3 as const, briefs: [...bundle.briefs, third] },
      budget: {
        cycleId: bundle.cycleId,
        now: new Date("2026-08-12T10:00:00.000Z"),
        gatherEnvelopeUsd: 0.1,
        synthEnvelopeUsd: 0.05,
        cycleEnvelopeUsd: 0.5,
        monthlyCeilingUsd: 5
      },
      ledger: []
    };

    expect(planBhResearchBatch({
      ...common,
      bundle: { ...common.bundle, monthlyResearchHeadroomUsd: 0.44 }
    }).briefs).toHaveLength(2);
    const three = planBhResearchBatch({
      ...common,
      bundle: { ...common.bundle, monthlyResearchHeadroomUsd: 0.45 }
    });
    expect(three.briefs).toHaveLength(3);
    expect(three.reservation.reservedUsd).toBe(0.45);
  });

  it("refuses cycle spend before the first provider call and never accepts raised hard ceilings", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-cap-"));
    roots.push(root);
    const { book, brief } = await fixtureInput();
    const fixture = JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/bh-research-ledger.valid.json"),
      "utf8"
    )) as BhResearchLedgerEntry;
    await appendBhResearchLedger(root, Array.from({ length: 4 }, () => ({
      ...fixture,
      cycleId: "bh-20260812-001",
      costUsd: 0.1
    })));
    const gather = provider();
    const synth = synthCall();

    await expect(runBhCandidateResearch({
      root,
      book,
      brief,
      provider: gather.value,
      gatherEnvelopeUsd: 0.1,
      researchedAt: new Date("2026-08-12T10:10:02.000Z"),
      requestingMeetingRef: "meetings/2026-08-12-bh-desk.json",
      researchBudget: researchBudget(),
      synthCallConfig: callConfig(),
      synthCall: synth
    })).rejects.toMatchObject({ code: "CYCLE_CAP" });
    expect(gather.researchBook).not.toHaveBeenCalled();
    expect(synth).not.toHaveBeenCalled();

    expect(() => assertBhResearchReservation({
      cycleId: "bh-raised",
      now: new Date("2026-08-12T10:00:00.000Z"),
      candidateCount: 1,
      gatherEnvelopeUsd: 0.1,
      synthEnvelopeUsd: 0.05,
      cycleEnvelopeUsd: 0.51,
      monthlyCeilingUsd: 5.01,
      recordedMonthlyHeadroomUsd: 5
    }, [])).toThrowError(BhResearchBudgetError);

    const month = Array.from({ length: 49 }, (_, index) => ({
      ...fixture,
      cycleId: `prior-${index}`,
      costUsd: 0.1
    }));
    expect(() => assertBhResearchReservation({
      cycleId: "bh-new-cycle",
      now: new Date("2026-08-12T10:00:00.000Z"),
      candidateCount: 1,
      gatherEnvelopeUsd: 0.1,
      synthEnvelopeUsd: 0.05,
      cycleEnvelopeUsd: 0.5,
      monthlyCeilingUsd: 5,
      recordedMonthlyHeadroomUsd: 0.1
    }, month)).toThrowError(expect.objectContaining({ code: "MONTHLY_CAP" }));
  });

  it("returns an explicit in-flight result while the same cycle is spending", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-concurrent-"));
    roots.push(root);
    const { book, brief } = await fixtureInput();
    let releaseProvider!: () => void;
    let reportStarted!: () => void;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const providerStarted = new Promise<void>((resolve) => { reportStarted = resolve; });
    const researchBook = vi.fn(async () => {
      reportStarted();
      await providerGate;
      return rawResearch();
    });
    const sharedProvider = { researchBook } satisfies ResearchProvider;
    const args = {
      root,
      book,
      brief,
      provider: sharedProvider,
      gatherEnvelopeUsd: 0.1,
      researchedAt: new Date("2026-08-12T10:10:02.000Z"),
      requestingMeetingRef: "meetings/2026-08-12-bh-desk.json",
      researchBudget: researchBudget(),
      synthCallConfig: callConfig(),
      synthCall: synthCall()
    };

    const first = runBhCandidateResearch(args);
    await providerStarted;
    const concurrent = await runBhCandidateResearch(args);
    expect(concurrent).toMatchObject({ status: "in-flight", lock: "cycle-budget" });
    if (concurrent.status !== "in-flight") throw new Error("fixture must see the in-flight lock");
    expect(concurrent.message).toContain("zero provider calls made");
    expect(researchBook).toHaveBeenCalledOnce();
    releaseProvider();
    await expect(first).resolves.toMatchObject({ status: "researched" });
  });
});
