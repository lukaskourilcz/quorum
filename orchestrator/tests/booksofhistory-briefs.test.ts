import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BhSeedLibrary } from "../src/contracts/bh-seed.js";
import { BhShortlistSchema, type BhShortlist } from "../src/contracts/bh-shortlist.js";
import type { guardedJsonCall } from "../src/llm/call.js";
import { repoRoot } from "../src/paths.js";
import {
  candidateSetForBhBriefs,
  generateBhResearchBriefs,
  planBhEditorialSelection,
  type BhFolioCallConfig
} from "../src/ventures/booksofhistory/briefs.js";
import { applyBooksofHistoryCycleDay, createBooksofHistoryCycle } from "../src/ventures/booksofhistory/state.js";

async function books(): Promise<BhSeedLibrary["books"]> {
  const library = JSON.parse(await readFile(
    path.join(repoRoot, "state/ventures/booksofhistory/seed/library.json"),
    "utf8"
  )) as BhSeedLibrary;
  return library.books.slice(0, 3);
}

async function shortlist(): Promise<BhShortlist> {
  const base = JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/bh-shortlist.valid.json"),
    "utf8"
  )) as BhShortlist;
  const selectedBooks = await books();
  const factor = base.entries[0]!.factors;
  return BhShortlistSchema.parse({
    ...base,
    entries: selectedBooks.map((book, index) => ({
      rank: index + 1,
      bookId: book.bookId,
      bookRef: `ventures/booksofhistory/seed/library.json#${book.bookId}`,
      title: book.title,
      author: book.author,
      totalScore: 90 - index,
      culturalMoment: false,
      factors: structuredClone(factor)
    }))
  });
}

function callConfig(): BhFolioCallConfig {
  return {
    stateRoot: "/unused",
    cycleId: "bh-20260812-001",
    phase: "bh-desk",
    ventureId: "booksofhistory",
    agent: "FOLIO",
    provider: "anthropic",
    model: "claude-sonnet-5",
    system: "FOLIO fixture",
    maxOutputTokens: 1_200,
    budgetContext: {
      now: new Date("2026-08-12T10:00:00.000Z"),
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

function folioOutput(ids: readonly string[]) {
  return {
    selected: ids.map((bookId) => ({
      bookId,
      selectionReason: `The recorded factors give ${bookId} a distinct evidence-backed route.`,
      objective: `Trace the documented turning point unique to ${bookId}.`,
      investigateSpecifically: [`Which dated record first establishes the key change for ${bookId}?`],
      lookFor: [`Primary records and independent scholarship that name ${bookId}.`],
      avoid: [`Do not turn uncertain anecdotes about ${bookId} into facts.`]
    }))
  };
}

function stubCall(output: ReturnType<typeof folioOutput>) {
  const call = vi.fn(async (request: Parameters<typeof guardedJsonCall>[0]) => ({
    value: request.parse(JSON.stringify(output)),
    cached: false,
    usd: 0.02
  }));
  return call as unknown as typeof guardedJsonCall & typeof call;
}

describe("BOOKSOFHISTORY research briefs", () => {
  it("uses one FOLIO call and deterministically binds two tailored briefs to seed and angle history", async () => {
    const candidateBooks = await books();
    const recordedShortlist = await shortlist();
    const call = stubCall(folioOutput(candidateBooks.slice(0, 2).map(({ bookId }) => bookId)));
    const input = {
      date: "2026-08-12",
      shortlist: recordedShortlist,
      shortlistRef: "ventures/booksofhistory/shortlists/2026-08-12.json",
      requestingMeetingRef: "meetings/2026-08-12-bh-desk.json",
      books: candidateBooks,
      angleHistory: [{
        bookId: candidateBooks[0]!.bookId,
        angle: "publishing-history",
        featureRef: "ventures/booksofhistory/features/2026-07-01-svejk.json"
      }],
      monthlyResearchHeadroomUsd: 0.1,
      generatedAt: new Date("2026-08-12T10:05:00.000Z"),
      callConfig: callConfig(),
      call
    };

    const first = await generateBhResearchBriefs(input);
    const second = await generateBhResearchBriefs(input);

    expect(call).toHaveBeenCalledTimes(2);
    expect(first).toEqual(second);
    expect(first.maximumCandidates).toBe(2);
    expect(first.briefs).toHaveLength(2);
    expect(first.briefs[0]!.objective).toContain(candidateBooks[0]!.title);
    expect(first.briefs[1]!.objective).toContain(candidateBooks[1]!.title);
    expect(first.briefs[0]!.objective).not.toBe(first.briefs[1]!.objective);
    expect(first.briefs[0]!.avoid.join(" ")).toContain("publishing-history");
    expect(first.briefs.every((brief) => brief.avoid.join(" ").includes("cover artwork"))).toBe(true);
    expect(candidateSetForBhBriefs(first)).toEqual(first.briefs.map((brief) => expect.objectContaining({
      candidateId: brief.bookId,
      source: "shortlist",
      briefRef: expect.stringContaining(`#${brief.bookId}`),
      dossierRef: null
    })));
    const packet = (call.mock.calls[0]![0] as { input: string }).input;
    expect(packet).toContain('"maximumCandidates":2');
    expect(packet).not.toContain("coverRef");
  });

  it("permits a third brief only when its monthly reserve is recorded", async () => {
    const candidateBooks = await books();
    const recordedShortlist = await shortlist();
    const selected = folioOutput(candidateBooks.map(({ bookId }) => bookId));
    const common = {
      date: "2026-08-12",
      shortlist: recordedShortlist,
      shortlistRef: "ventures/booksofhistory/shortlists/2026-08-12.json",
      requestingMeetingRef: "meetings/2026-08-12-bh-desk.json",
      books: candidateBooks,
      angleHistory: [],
      generatedAt: new Date("2026-08-12T10:05:00.000Z"),
      callConfig: callConfig()
    };

    await expect(generateBhResearchBriefs({
      ...common,
      monthlyResearchHeadroomUsd: 0.14,
      call: stubCall(selected)
    })).rejects.toThrow("recorded headroom permits 2");

    const withHeadroom = await generateBhResearchBriefs({
      ...common,
      monthlyResearchHeadroomUsd: 0.15,
      call: stubCall(selected)
    });
    expect(withHeadroom.maximumCandidates).toBe(3);
    expect(withHeadroom.briefs).toHaveLength(3);
    expect(withHeadroom.monthlyResearchHeadroomUsd).toBe(0.15);
  });

  it("takes the top candidate's unused above-threshold dossier story straight to production", async () => {
    const candidateBooks = await books();
    const recordedShortlist = await shortlist();
    const top = recordedShortlist.entries[0]!;
    top.factors.shelfBonus = {
      multiplier: 1.6,
      eligibleStoryIds: ["story-paid-once"],
      highestScore: 88
    };
    const call = stubCall(folioOutput(candidateBooks.slice(0, 2).map(({ bookId }) => bookId)));
    const plan = await planBhEditorialSelection({
      date: "2026-08-12",
      shortlist: recordedShortlist,
      shortlistRef: "ventures/booksofhistory/shortlists/2026-08-12.json",
      requestingMeetingRef: "meetings/2026-08-12-bh-desk.json",
      books: candidateBooks,
      angleHistory: [],
      monthlyResearchHeadroomUsd: 0.3,
      generatedAt: new Date("2026-08-12T10:05:00.000Z"),
      callConfig: callConfig(),
      call,
      shelf: [{
        bookId: top.bookId,
        dossierRef: `ventures/booksofhistory/dossiers/${top.bookId}/dossier.json`,
        stories: [
          { storyId: "story-used", score: 99, used: true },
          { storyId: "story-paid-once", score: 88, used: false }
        ]
      }]
    });

    expect(plan).toMatchObject({
      kind: "shelf-shortcut",
      shortcut: { bookId: top.bookId, storyId: "story-paid-once", score: 88 }
    });
    expect(call).not.toHaveBeenCalled();
    if (plan.kind !== "shelf-shortcut") throw new Error("fixture must take the shelf shortcut");
    const production = applyBooksofHistoryCycleDay({
      cycle: createBooksofHistoryCycle({
        date: "2026-08-12",
        now: new Date("2026-08-12T10:00:00.000Z")
      }),
      date: "2026-08-12",
      now: new Date("2026-08-12T10:05:00.000Z"),
      outcome: { completed: true, shelfShortcut: true, candidateSet: plan.shortcut.candidateSet }
    });
    expect(production.phase).toBe("production");
    expect(production.dayStatuses.research).toBe("not-needed");
    expect(production.candidateSet).toEqual(plan.shortcut.candidateSet);
  });
});
