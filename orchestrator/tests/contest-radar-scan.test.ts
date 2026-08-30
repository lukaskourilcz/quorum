import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runContestScan } from "../src/ventures/contest-radar/scan.js";
import {
  appendContestOwnerEvent,
  effectiveOwnerEvents,
  readContestOwnerEvents,
  readContestRecords,
  writeContestRecord
} from "../src/ventures/contest-radar/store.js";
import { loadContestSourceRegistry } from "../src/ventures/contest-radar/sources.js";
import type { ContestOwnerEvent } from "../src/contracts/contest-radar.js";
import { repoRoot } from "../src/paths.js";

const NOW = new Date("2026-08-30T06:00:00.000Z");
const DATE = "2026-08-30";

async function root(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "contest-radar-"));
}

async function bodies(): Promise<Record<string, string>> {
  const dir = path.join(repoRoot, "orchestrator/tests/fixtures/contest-radar");
  const [devpost, esutaze, wordpress] = await Promise.all([
    readFile(path.join(dir, "devpost.json"), "utf8"),
    readFile(path.join(dir, "esutaze.xml"), "utf8"),
    readFile(path.join(dir, "chcemesoutezit.json"), "utf8")
  ]);
  return { devpost, "esutaze-sk": esutaze, "chcemesoutezit-cz": wordpress };
}

describe("the daily contest scan", () => {
  it("produces ranked records from fixtures at $0 and touches no network", async () => {
    let called = 0;
    const { run } = await runContestScan({
      root: await root(),
      date: DATE,
      now: NOW,
      mode: "fixture",
      bodies: await bodies(),
      fetchImpl: (async () => { called += 1; throw new Error("unreachable"); }) as never
    });

    expect(called).toBe(0);
    expect(run.outcome).toBe("success");
    expect(run.records).toBeGreaterThan(0);
    // The free path is the product. Nothing in it costs anything.
    expect(run.spend).toMatchObject({ modelCalls: 0, modelUsd: 0, apifyUsd: 0 });
  });

  it("writes records and a receipt on a live run, and is idempotent on the day", async () => {
    const stateRoot = await root();
    const body = await bodies();
    const registry = await loadContestSourceRegistry();
    const fetchImpl = (async (url: string) => {
      const source = registry.sources.find((candidate) => candidate.endpoint === url)!;
      return new Response(body[source.id] ?? "{}", { status: 200 });
    }) as never;

    const first = await runContestScan({ root: stateRoot, date: DATE, now: NOW, mode: "live", fetchImpl });
    const second = await runContestScan({ root: stateRoot, date: DATE, now: NOW, mode: "live", fetchImpl });

    expect(first.run.idempotencyKey).toBe(second.run.idempotencyKey);
    const stored = await readContestRecords(stateRoot);
    expect(stored.records.length).toBe(first.run.records);
    expect(stored.dropped).toBe(0);
    // A second identical run reuses the cache rather than re-reading every listing.
    expect(second.run.cacheReused).toBeGreaterThan(0);
  });

  /*
   * One failed source costs one source. This is the rule that keeps a single slow host from
   * turning a useful day into an empty one.
   */
  it("keeps a failing source from costing the run", async () => {
    const registry = await loadContestSourceRegistry();
    const body = await bodies();
    const { run } = await runContestScan({
      root: await root(),
      date: DATE,
      now: NOW,
      mode: "live",
      fetchImpl: (async (url: string) => {
        const source = registry.sources.find((candidate) => candidate.endpoint === url)!;
        if (source.id === "devpost") return new Response("nope", { status: 503 });
        return new Response(body[source.id] ?? "{}", { status: 200 });
      }) as never
    });

    expect(run.outcome).toBe("partial");
    expect(run.records).toBeGreaterThan(0);
    expect(run.sources.find((entry) => entry.sourceId === "devpost")?.outcome).toBe("failed");
    expect(run.errors.join(" ")).toContain("503");
  });

  it("calls a day with nothing new quiet rather than failed", async () => {
    const registry = await loadContestSourceRegistry();
    const { run } = await runContestScan({
      root: await root(),
      date: DATE,
      now: NOW,
      mode: "live",
      fetchImpl: (async (url: string) => {
        const source = registry.sources.find((candidate) => candidate.endpoint === url)!;
        return new Response(source.type === "json-api" ? "[]" : "<rss></rss>", { status: 200 });
      }) as never
    });

    // Quiet is a success with nothing to show, and must not read as a fault.
    expect(run.outcome).toBe("quiet");
    expect(run.reason).toContain("nothing new");
    expect(run.nextSafeAction).toContain("Nothing is entered automatically");
  });

  it("fails only when no enabled source answered at all", async () => {
    const { run } = await runContestScan({
      root: await root(),
      date: DATE,
      now: NOW,
      mode: "live",
      fetchImpl: (async () => new Response("down", { status: 500 })) as never
    });

    expect(run.outcome).toBe("failed");
    expect(run.records).toBe(0);
  });
});

describe("the record and owner-event stores", () => {
  it("keeps a field the owner corrected through a later scan", async () => {
    const stateRoot = await root();
    const { run: _run } = await runContestScan({
      root: stateRoot, date: DATE, now: NOW, mode: "fixture", bodies: await bodies()
    });
    const seeded = await readContestRecords(stateRoot);
    expect(seeded.records).toHaveLength(0);

    const clusters = await runContestScan({ root: stateRoot, date: DATE, now: NOW, mode: "fixture", bodies: await bodies() });
    void clusters;

    // Write a record, lock a field the owner fixed, then let a later extraction disagree.
    const registry = await loadContestSourceRegistry();
    void registry;
    const base = {
      schemaVersion: "contest-record/1" as const,
      id: "cr-locked",
      canonicalUrl: "https://one.test/x",
      sourceRefs: [{ sourceId: "esutaze-sk", sourceItemId: "1", listingUrl: "https://one.test/x" }],
      title: "A contest",
      organizer: null,
      track: "consumer" as const,
      kind: "sweepstakes" as const,
      categories: [],
      language: "cs" as const,
      eligibility: {
        facts: [],
        minimumAge: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] },
        residency: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] }
      },
      dates: {
        registrationOpens: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] },
        submissionCloses: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] },
        eventStarts: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] },
        deadline: { value: "2026-09-30", confidence: "stated" as const, unavailableReason: null, evidenceRefs: [] },
        resultsAnnounced: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] }
      },
      prize: {
        description: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] },
        valueAmount: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] },
        currency: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] }
      },
      cost: {
        purchaseRequired: { value: null, confidence: null, unavailableReason: "requires-owner-check" as const, evidenceRefs: [] },
        entryFee: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] }
      },
      mechanics: [],
      repeatHints: [],
      judging: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] },
      participation: { value: null, confidence: null, unavailableReason: "not-collected" as const, evidenceRefs: [] },
      effort: { tier: "unknown" as const, minutes: { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] }, basis: "None." },
      legitimacy: { state: "unverified" as const, reasons: ["Not checked."] },
      readiness: "needs-detail" as const,
      readinessReasons: ["Rules page unread."],
      conflicts: [],
      rankingRefs: [],
      preparationRefs: [],
      firstSeenAt: "2026-08-01T00:00:00.000Z",
      lastSeenAt: "2026-08-01T00:00:00.000Z",
      lifecycle: "discovered" as const,
      staleAfter: null,
      versions: { source: "1.0.0", extraction: "1.0.0", enrichment: null, ranking: null },
      lockedFields: ["dates.deadline"],
      supersedesRef: null
    };
    await writeContestRecord(stateRoot, base);

    await writeContestRecord(stateRoot, {
      ...base,
      firstSeenAt: "2026-08-30T00:00:00.000Z",
      dates: { ...base.dates, deadline: { value: "2026-12-31", confidence: "derived", unavailableReason: null, evidenceRefs: [] } }
    });

    const stored = await readContestRecords(stateRoot);
    const record = stored.records.find((entry) => entry.id === "cr-locked")!;
    // The owner's fix survives. Otherwise a correction lasts until the next run and they stop making them.
    expect(record.dates.deadline.value).toBe("2026-09-30");
    expect(record.firstSeenAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("appends owner events and never rewrites one", async () => {
    const stateRoot = await root();
    const event = (over: Partial<ContestOwnerEvent>): ContestOwnerEvent => ({
      schemaVersion: "contest-owner-event/1",
      id: "ev-1",
      contestId: "cr-1",
      recordedAt: "2026-08-30T10:00:00.000Z",
      action: "shortlist",
      result: null,
      note: null,
      actualMinutes: null,
      realizedValue: null,
      supersedesEventId: null,
      ...over
    } as ContestOwnerEvent);

    await appendContestOwnerEvent(stateRoot, event({}));
    await expect(appendContestOwnerEvent(stateRoot, event({}))).rejects.toThrow(/already exists/u);
    await appendContestOwnerEvent(stateRoot, event({ id: "ev-2", action: "correction", supersedesEventId: "ev-1" }));

    const { events } = await readContestOwnerEvents(stateRoot);
    expect(events.map(({ id }) => id)).toEqual(["ev-1", "ev-2"]);
    // The history stays; the reader gets what still stands.
    expect(effectiveOwnerEvents(events).map(({ id }) => id)).toEqual(["ev-2"]);
  });

  it("refuses a correction that supersedes an event nobody recorded", async () => {
    const stateRoot = await root();

    await expect(appendContestOwnerEvent(stateRoot, {
      schemaVersion: "contest-owner-event/1",
      id: "ev-9",
      contestId: "cr-1",
      recordedAt: "2026-08-30T10:00:00.000Z",
      action: "correction",
      result: null,
      note: null,
      actualMinutes: null,
      realizedValue: null,
      supersedesEventId: "ev-missing"
    } as ContestOwnerEvent)).rejects.toThrow(/not on file/u);
  });
});
