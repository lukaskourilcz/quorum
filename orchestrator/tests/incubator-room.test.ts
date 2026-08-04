import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The incubator scan room, from the trigger that opens it to the log that closes it.
 *
 * The room had never met. `incubator-scan` was agenda-required and no meeting has ever issued
 * it an agenda, so every scheduled wake-up wrote a PAUSED record and went back to sleep. It now
 * wakes on the same signal `mma-intake` uses — material the room has not read — and the tests
 * below drive that through `runPortfolioCycle` itself rather than around it. The previous
 * attempt tested the policy file and a pure function, and deleting the entire opening branch
 * left the suite green; each case here names what deleting its part of the branch does.
 */

const testStateRoot = vi.hoisted(
  () => `${process.env.TMPDIR ?? "/tmp"}/quorum-incubator-room-${process.pid}-${Date.now()}`
);

/** The literal `refreshIncubatorEvidence` writes. Kept out of the module under test on purpose. */
const SWEPT_PACKET_PATH = "ventures/incubator/evidence.json";

const sweep = vi.hoisted(() => ({
  calls: 0,
  /** Items the next sweep writes into the packet. */
  items: [] as Array<Record<string, unknown>>
}));

const seats = vi.hoisted(() => ({ called: [] as string[] }));

vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  // Only the state root moves. repoRoot and configRoot stay real, so the run reads the real
  // prompts, personas, venture registry, models and meeting policy.
  return { ...actual, stateRoot: testStateRoot };
});

vi.mock("../src/portfolio/evidence.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/portfolio/evidence.js")>();
  return {
    ...actual,
    refreshIncubatorEvidence: async (input: { root: string; now: Date }) => {
      const { atomicWriteJson } = await import("../src/state.js");
      sweep.calls += 1;
      await atomicWriteJson(input.root, SWEPT_PACKET_PATH, {
        schemaVersion: "incubator-evidence/1",
        generatedAt: input.now.toISOString(),
        refs: [...new Set(sweep.items.map((item) => `source:${item.sourceId as string}`))],
        packet: JSON.stringify(sweep.items),
        sourceResults: []
      });
      return {
        artifactPaths: [SWEPT_PACKET_PATH],
        evidenceRefs: [...new Set(sweep.items.map((item) => `source:${item.sourceId as string}`))]
      };
    }
  };
});

vi.mock("../src/llm/call.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/llm/call.js")>();
  return {
    ...actual,
    guardedJsonCall: async (request: {
      agent: string;
      parse: (text: string) => unknown;
    }) => {
      seats.called.push(request.agent);
      return {
        value: request.parse(JSON.stringify({
          stance: request.agent === "PULSE" ? "plan" : "pass",
          summary: `${request.agent} read the packet in a stubbed room.`,
          evidenceRefs: [],
          task: null,
          nicheProposals: [],
          editorialSlate: null,
          marketingPlan: null,
          templateProposal: null,
          inspirationObservations: [],
          idea: null,
          followUpRequest: null
        })),
        cached: false,
        usd: 0
      };
    }
  };
});

const { repoRoot } = await import("../src/paths.js");
const { runPortfolioCycle } = await import("../src/portfolio/run.js");
const { atomicWriteJson, readJson } = await import("../src/state.js");
const {
  INCUBATOR_EVIDENCE_PATH,
  INCUBATOR_PACKET_CHARS,
  INCUBATOR_READ_ITEMS_LIMIT,
  INCUBATOR_READ_ITEMS_PATH,
  assertSweptToPacketPath,
  boundIncubatorPacket,
  incubatorScanTriggerPreview,
  packetItemKey,
  readIncubatorReadItems,
  recordIncubatorPacketRead,
  unreadPacketItems
} = await import("../src/incubator/packet.js");
const { loadMeetingPolicy, phaseNeedsAgenda, phaseWakesOnChange } =
  await import("../src/meetings/agenda.js");
const { loadRatingLedger, runPalatePass } = await import("../src/taste/pipeline.js");

function item(index: number, overrides: Record<string, unknown> = {}) {
  return {
    sourceId: `source-${index}`,
    title: `Story number ${index}`,
    url: `https://example.invalid/story-${index}`,
    publishedAt: `2026-08-0${(index % 9) + 1}T06:00:00.000Z`,
    summary: `A summary of story ${index}.`,
    tags: ["tag"],
    ...overrides
  };
}

async function run(now: Date) {
  seats.called = [];
  return runPortfolioCycle({
    phase: "incubator-scan",
    cycleId: `${now.toISOString().replace(/[^0-9]/gu, "").slice(0, 14)}-incubator-scan`,
    dry: false,
    explainBudget: false,
    explainRouting: false,
    now
  });
}

async function meetingRecord(date: string) {
  return JSON.parse(await readFile(
    path.join(testStateRoot, "meetings", `${date}-incubator-scan.json`),
    "utf8"
  )) as {
    status: string;
    operatingBrief: string;
    growthPlan: string;
    participantReasons: Array<{ agent: string; reason: string; participated: boolean }>;
    roomTranscript: { setting: string };
  };
}

describe("the incubator packet key survives everything upstream decides by race", () => {
  it("ignores sourceId, order, fetch time and tracking parameters, but not the story", () => {
    // sources/run.ts dedupes by raw URL and keeps whichever of six workers arrived first, so
    // the sourceId on a URL two feeds carry is a coin toss between runs. Reading it would call
    // an unchanged day changed and open a paid room.
    const base = { url: "https://example.invalid/a", title: "A Story" };
    expect(packetItemKey({ ...base })).toBe(packetItemKey({ ...base }));
    expect(packetItemKey({ url: "https://example.invalid/a#section", title: "  a   story " }))
      .toBe(packetItemKey(base));
    expect(packetItemKey({ url: "https://example.invalid/a?utm_source=x&ref=y", title: "A Story" }))
      .toBe(packetItemKey(base));
    expect(packetItemKey({ url: "https://example.invalid/b", title: "A Story" }))
      .not.toBe(packetItemKey(base));
    expect(packetItemKey({ url: "https://example.invalid/a?page=2", title: "A Story" }))
      .not.toBe(packetItemKey(base));
  });

  it("compares as a set, so digest order and the 40-item slice cannot fake a change", () => {
    // createDigest sorts, then slices to 40; ties fall back to insertion order and undated
    // items to fetchedAt, which is new every run. Membership, not position, decides here.
    const items = [item(1), item(2), item(3)];
    const keys = items.map((entry) => packetItemKey(entry));
    expect(unreadPacketItems([...items].reverse(), keys)).toEqual([]);
    expect(unreadPacketItems(items, [keys[1]!])).toEqual([items[0], items[2]]);
    // The flap: item 2 drops out of tomorrow's packet and returns the day after. It is still
    // an item this room has read, so it does not open a room a second time.
    expect(unreadPacketItems([item(2)], keys)).toEqual([]);
  });
});

describe("the packet the room is shown is cut by whole items", () => {
  it("keeps whole items inside the budget and narrows the citation allowlist to them", () => {
    // A source summary may be 2,000 characters, so forty items is several times the room's
    // context budget. Slicing the serialised JSON produced a string ending mid-token.
    const long = Array.from({ length: 40 }, (_, index) =>
      item(index, { summary: "x".repeat(2_000), sourceId: `source-${index % 3}` }));
    const bound = boundIncubatorPacket(long);
    expect(bound.offered).toBe(40);
    expect(bound.items.length).toBeLessThan(40);
    expect(bound.items.length).toBeGreaterThan(0);
    expect(bound.text.length).toBeLessThanOrEqual(INCUBATOR_PACKET_CHARS + bound.text.indexOf("\n") + 1);
    expect(() => JSON.parse(bound.text.slice(bound.text.indexOf("\n") + 1))).not.toThrow();
    expect(bound.text).toContain(`${bound.items.length} shown here`);
    // Only the sources whose items survived the cut may be cited.
    expect(bound.evidenceRefs).toEqual([...new Set(bound.items.map((kept) => `source:${kept.sourceId}`))]);
    expect(bound.evidenceRefs.every((reference) => reference.startsWith("source:"))).toBe(true);
  });

  it("is deterministic, so the trigger and the room see the same items", () => {
    const items = Array.from({ length: 30 }, (_, index) => item(index));
    expect(boundIncubatorPacket(items).items).toEqual(boundIncubatorPacket(items).items);
  });
});

describe("the read log", () => {
  const root = `${testStateRoot}-log`;

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("keeps the most recently read keys and drops the oldest past its limit", async () => {
    const first = Array.from({ length: INCUBATOR_READ_ITEMS_LIMIT }, (_, index) => item(index));
    await recordIncubatorPacketRead({ root, items: first, cycleId: "cycle-1", now: new Date("2026-08-05T05:00:00.000Z") });
    const newest = item(9_999);
    await recordIncubatorPacketRead({ root, items: [newest], cycleId: "cycle-2", now: new Date("2026-08-06T05:00:00.000Z") });
    const log = await readIncubatorReadItems(root);
    expect(log.keys).toHaveLength(INCUBATOR_READ_ITEMS_LIMIT);
    expect(log.lastReadBy).toBe("cycle-2");
    expect(log.keys.at(-1)).toBe(packetItemKey(newest));
    expect(log.keys).not.toContain(packetItemKey(first[0]!));
  });
});

describe("the sweep path and the trigger path cannot drift apart", () => {
  it("refuses a sweep that wrote somewhere else instead of shutting the room in silence", () => {
    expect(() => assertSweptToPacketPath([INCUBATOR_EVIDENCE_PATH])).not.toThrow();
    expect(() => assertSweptToPacketPath(["ventures/incubator/evidence-v2.json"]))
      .toThrowError(/never see a change again/);
  });

  it("still names the path refreshIncubatorEvidence writes", async () => {
    // The runtime assertion above only fires on a live run. This one fails in review, which is
    // where a rename to evidence.ts — a file the trigger cannot import a constant from without
    // a cycle — would otherwise pass unnoticed.
    const source = await readFile(path.join(repoRoot, "orchestrator", "src", "portfolio", "evidence.ts"), "utf8");
    expect(source).toContain(`"${INCUBATOR_EVIDENCE_PATH}"`);
  });
});

describe("what one opening of the incubator room costs", () => {
  it("makes no palate call while the incubator rating ledger is empty", async () => {
    // incubator-scan is the venture's first meeting and the venture has taste enabled, so it
    // carries a palate pre-step: a Haiku call capped at PALATE_PASS_BUDGET_USD ($0.02) on top
    // of the room's own $0.06 envelope. runPalatePass returns before the distiller is reached
    // when no rating has ever been filed, which is today's state — so today an opening costs
    // the room only. A first owner rating flips that and the comment on
    // INCUBATOR_CONTEXT_CHARS has to be read with the $0.02 added.
    expect(await loadRatingLedger(repoRoot, "incubator")).toEqual([]);
    const result = await runPalatePass({
      repoRoot,
      ventureId: "incubator",
      now: new Date("2026-08-05T05:00:00.000Z"),
      distiller: {
        distill: async () => {
          throw new Error("the palate pre-step reached the provider on an empty rating ledger");
        }
      }
    });
    expect(result.status).toBe("no_ratings");
    expect(result.writes).toEqual([]);
  });
});

describe("a scheduled incubator scan, through runPortfolioCycle", () => {
  const liveEnabled = process.env.PORTFOLIO_LIVE_ENABLED;
  const trigger = process.env.MEETING_TRIGGER;

  beforeAll(async () => {
    process.env.PORTFOLIO_LIVE_ENABLED = "true";
    process.env.MEETING_TRIGGER = "schedule";
    await mkdir(path.join(testStateRoot, "decisions"), { recursive: true });
    for (const decision of [
      "2026-08-01-budget-raise.md",
      "2026-08-02-budget-mma.md",
      "2026-08-04-budget-fifty.md",
      "2026-08-02-fightaiq-founding.md"
    ]) {
      await cp(
        path.join(repoRoot, "state", "decisions", decision),
        path.join(testStateRoot, "decisions", decision)
      );
    }
    await atomicWriteJson(testStateRoot, "budget/ledger.json", { schemaVersion: 1, entries: [] });
  });

  afterAll(async () => {
    if (liveEnabled === undefined) delete process.env.PORTFOLIO_LIVE_ENABLED;
    else process.env.PORTFOLIO_LIVE_ENABLED = liveEnabled;
    if (trigger === undefined) delete process.env.MEETING_TRIGGER;
    else process.env.MEETING_TRIGGER = trigger;
    await rm(testStateRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    sweep.calls = 0;
  });

  it("no longer needs an agenda nobody has ever issued", async () => {
    const policy = await loadMeetingPolicy();
    expect(phaseNeedsAgenda(policy, "incubator-scan")).toBe(false);
    expect(phaseWakesOnChange(policy, "incubator-scan")).toBe(true);
    // The queue is still the record of what a meeting asked for. Nothing has ever asked for
    // this room, and this test does not put a request there.
    const queue = JSON.parse(await readFile(
      path.join(repoRoot, "state", "meeting-agendas", "queue.json"),
      "utf8"
    )) as { agendas: Array<{ phase: string }> };
    expect(queue.agendas.some((agenda) => agenda.phase === "incubator-scan")).toBe(false);
  });

  it("opens on items no seat has read, and records what it read afterwards", async () => {
    sweep.items = [item(1), item(2), item(3)];
    const result = await run(new Date("2026-08-05T05:00:00.000Z"));

    // The sweep has to run before the decision. On a state root with no packet yet, a decision
    // taken first reads an absent file, finds nothing unread and closes the room — so this
    // assertion fails if the two are ever swapped back.
    expect(sweep.calls).toBe(1);
    expect(result.status).toBe("live_complete");
    expect(result.decision).toBe("PLAN");
    expect(seats.called).toEqual(["PULSE", "ANGLE", "SCOUT", "COHORT", "VAULT"]);

    const record = await meetingRecord("2026-08-05");
    // HELD is what buildRecord stamps on a live room; PLAN is the fixture status.
    expect(record.status).toBe("HELD");
    expect(record.participantReasons.every((seat) => seat.participated)).toBe(true);

    const log = await readIncubatorReadItems(testStateRoot);
    expect(log.keys).toEqual(sweep.items.map((entry) => packetItemKey(entry as { url: string; title: string })));
    expect(result.artifacts).toContain(path.relative(repoRoot, path.join(testStateRoot, INCUBATOR_READ_ITEMS_PATH)));
  });

  it("stays shut on the same items the next morning, and says that is why", async () => {
    // Deleting the read-log write, or the unread comparison, opens a paid room every day on
    // the same three stories. This is the case that catches it.
    const result = await run(new Date("2026-08-06T05:00:00.000Z"));
    expect(sweep.calls).toBe(1);
    expect(result.status).toBe("paused");
    expect(result.decision).toBe("PAUSED");
    expect(seats.called).toEqual([]);

    const record = await meetingRecord("2026-08-06");
    expect(record.status).toBe("PAUSED");
    // Every published line says the reason that applied, not the agenda queue's.
    expect(record.operatingBrief).toContain("The sweep kept 3 items and 3 of them fit this room's context budget");
    expect(record.operatingBrief).toContain("already read in an earlier scan");
    expect(record.participantReasons).toHaveLength(5);
    for (const seat of record.participantReasons) {
      expect(seat.participated).toBe(false);
      expect(seat.reason).toBe("registered for this room but not called because the sweep brought nothing this room has not already read");
    }
    expect(record.roomTranscript.setting).toContain("read log");
    expect(record.roomTranscript.setting).not.toContain("agenda");
    expect(record.growthPlan).toContain("already read");
  });

  it("opens again for one new item, and not for the three beside it", async () => {
    sweep.items = [item(4), item(1), item(2), item(3)];
    const result = await run(new Date("2026-08-07T05:00:00.000Z"));
    expect(result.decision).toBe("PLAN");
    expect(seats.called).toHaveLength(5);
    const log = await readIncubatorReadItems(testStateRoot);
    expect(log.keys).toHaveLength(4);
    expect(log.keys).toContain(packetItemKey(item(4)));
  });

  it("says the sweep came back empty rather than blaming the agenda queue", async () => {
    sweep.items = [];
    const result = await run(new Date("2026-08-08T05:00:00.000Z"));
    expect(result.decision).toBe("PAUSED");
    expect(seats.called).toEqual([]);
    const record = await meetingRecord("2026-08-08");
    expect(record.operatingBrief).toContain("returned no items");
    expect(record.participantReasons[0]?.reason).toContain("returned no items to read");
    expect(record.roomTranscript.setting).toContain("returned no items");
  });

  it("lets a dry run say what the next scheduled run would decide, without sweeping", async () => {
    // The dry room writes to tmp/dry-run and calls no model, so the only thing it can honestly
    // report about this room is the live state root's own answer. Deleting the preview, or
    // pointing it at the dry root, fails here.
    const printed: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
      printed.push(String(value));
    });
    sweep.calls = 0;
    try {
      await runPortfolioCycle({
        phase: "incubator-scan",
        cycleId: "20260809050000-incubator-scan",
        dry: true,
        explainBudget: false,
        explainRouting: false,
        now: new Date("2026-08-09T05:00:00.000Z")
      });
    } finally {
      log.mockRestore();
    }
    expect(sweep.calls).toBe(0);
    const preview = printed
      .map((line) => { try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; } })
      .find((value) => value?.event === "incubator_scan_trigger_preview");
    // The live root holds the empty packet the last sweep wrote and four keys already read.
    expect(preview).toMatchObject({
      packetPath: INCUBATOR_EVIDENCE_PATH,
      itemsInPacket: 0,
      itemsShownToRoom: 0,
      itemsNoSeatHasRead: 0,
      wouldOpenOnThisPacket: false
    });
    expect(await incubatorScanTriggerPreview(testStateRoot)).toEqual(preview);
  });

  it("blames the month's spend for a closed room, not a decision the owner signed", async () => {
    // phaseEnabled goes false for two unrelated reasons and the record used to name the
    // countersigned budget shape for both. Spend the month down to the rung that closes this
    // room and the record has to say so; the shape still funds it at full headroom.
    await atomicWriteJson(testStateRoot, "budget/ledger.json", {
      schemaVersion: 1,
      entries: [{
        ts: "2026-08-09T04:00:00.000Z",
        cycleId: "20260809040000-cu-edition",
        requestHash: "a".repeat(64),
        phase: "cu-edition",
        agent: "HERALD",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        serviceTier: "default",
        tokensIn: 1_000,
        cachedTokensIn: 0,
        tokensOut: 100,
        toolUses: 0,
        usd: 24,
        kind: "text"
      }]
    });
    try {
      const result = await run(new Date("2026-08-10T05:00:00.000Z"));
      expect(result.decision).toBe("PAUSED");
      expect(sweep.calls).toBe(0);
      const record = await meetingRecord("2026-08-10");
      expect(record.operatingBrief).toContain("$1.00 of the $25.00 monthly model-API budget is left");
      expect(record.operatingBrief).toContain("below the rung that funds this room");
      expect(record.participantReasons[0]?.reason).toContain("monthly model-API budget is left");
      expect(record.roomTranscript.setting).toContain("degradation ladder");
      expect(record.roomTranscript.setting).not.toContain("countersigned budget shape");
    } finally {
      await atomicWriteJson(testStateRoot, "budget/ledger.json", { schemaVersion: 1, entries: [] });
    }
  });

  it("leaves the read log alone when the room never opened", async () => {
    // The sweep replaces the packet before any seat is called, so a room that closes after the
    // sweep must not leave a log claiming the packet was read. The two shut runs above wrote
    // nothing, so the keys are still the four the two open rooms actually read.
    const log = await readIncubatorReadItems(testStateRoot);
    expect(log.keys).toHaveLength(4);
    expect(log.lastReadBy).toBe("20260807050000-incubator-scan");
    const evidence = await readJson<{ packet?: string }>(testStateRoot, INCUBATOR_EVIDENCE_PATH, {});
    // ...even though the packet on disk is the empty one the last sweep wrote over it.
    expect(evidence.packet).toBe("[]");
  });
});
