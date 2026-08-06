import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

const seats = vi.hoisted(() => ({
  called: [] as string[],
  /** What the chair asks for next, when a case wants to drive the follow-up path. */
  followUp: null as { phase: string; summary: string; evidenceRefs: string[] } | null
}));

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
          followUpRequest: request.agent === "PULSE" ? seats.followUp : null
        })),
        cached: false,
        usd: 0
      };
    }
  };
});

const { repoRoot } = await import("../src/paths.js");
const { composePortfolioContext, runPortfolioCycle } = await import("../src/portfolio/run.js");
const { loadVentureRegistry } = await import("../src/ventures/registry.js");
const { atomicWriteJson, readJson } = await import("../src/state.js");
const {
  INCUBATOR_CONTEXT_CHARS,
  INCUBATOR_EVIDENCE_PATH,
  INCUBATOR_OPENING_USD_TODAY,
  INCUBATOR_PACKET_CHARS,
  INCUBATOR_READ_ITEMS_LIMIT,
  INCUBATOR_READ_ITEMS_PATH,
  INCUBATOR_SCAN_CHARS,
  INCUBATOR_TASTE_CHARS,
  assertSweptToPacketPath,
  boundIncubatorPacket,
  incubatorScanBrief,
  incubatorScanTriggerPreview,
  packetItemKey,
  readIncubatorReadItems,
  recordIncubatorPacketRead,
  unreadPacketItems
} = await import("../src/incubator/packet.js");
const { loadMeetingPolicy, mayRequestMeeting, phaseNeedsAgenda, phaseWakesOnChange } =
  await import("../src/meetings/agenda.js");
const { phaseEnabled, resolveEffectivePortfolioSchedule } = await import("../src/portfolio/schedule.js");
const { MeetingRecordSchema } = await import("../src/contracts/meeting-record.js");
const { PALATE_PASS_BUDGET_USD, loadRatingLedger, runPalatePass } = await import("../src/taste/pipeline.js");

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

  it("gives the same key to the same story arriving under a different sourceId", () => {
    // The case the whole invariant exists for, and the one nothing tested. Six concurrent
    // workers race, `runScrapersDetailed` keeps whichever arrival reached the byUrl map first,
    // so a URL two feeds both carry is filed under either feed's id depending on the race. The
    // story is the same story. A key that read sourceId would call it new the next morning and
    // open a paid room on material every seat had already read.
    const story = { url: "https://example.invalid/shared-scoop", title: "Two Feeds Carry This" };
    const viaFirstFeed = { ...story, sourceId: "feed-a" };
    const viaSecondFeed = { ...story, sourceId: "feed-b" };
    expect(packetItemKey(viaSecondFeed)).toBe(packetItemKey(viaFirstFeed));
    // ...and the read log built from one arrival covers the other, which is what actually keeps
    // the room shut.
    expect(unreadPacketItems([viaSecondFeed], [packetItemKey(viaFirstFeed)])).toEqual([]);
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

describe("the synthesis room reads whole blocks, not a prefix of them", () => {
  const scanRecord = JSON.stringify({
    date: "2026-08-05",
    status: "HELD",
    decision: { outcome: "PLAN", summary: "S".repeat(400) },
    proposals: [{ agent: "ANGLE", summary: "P".repeat(400) }],
    tasks: [{ owner: "SCOUT", summary: "T".repeat(400) }],
    growthPlan: "G".repeat(400),
    roomTranscript: {
      turns: Array.from({ length: 12 }, (_, index) => ({ agent: "PULSE", text: `turn ${index} ${"x".repeat(400)}` }))
    }
  });

  it("hands the scan over as valid JSON however long the record is", () => {
    // The defect this replaces: `${packet}\n${taste}\n${scan}` was cut to the context ceiling by
    // characters, so the scan — always last — ended wherever 8,000 fell. Measured on the real
    // 1 August record behind a full packet, the room got 72.7% of it, ending inside a string
    // literal. Whole turns are dropped instead, so what arrives always parses.
    const brief = incubatorScanBrief(scanRecord);
    expect(brief.length).toBeLessThanOrEqual(INCUBATOR_SCAN_CHARS);
    const parsed = JSON.parse(brief) as { turns: unknown[]; turnsOmitted: number; outcome: string };
    expect(parsed.outcome).toBe("PLAN");
    // It had to drop turns to fit, and it says how many rather than letting the room assume it
    // has the whole transcript.
    expect(parsed.turnsOmitted).toBeGreaterThan(0);
    expect(parsed.turns.length + parsed.turnsOmitted).toBe(12);
  });

  it("keeps a short record whole and omits nothing", () => {
    const brief = incubatorScanBrief(JSON.stringify({
      date: "2026-08-05",
      status: "HELD",
      decision: { outcome: "NO_ACTION", summary: "nothing to argue" },
      roomTranscript: { turns: [{ agent: "PULSE", text: "one turn" }] }
    }));
    expect(JSON.parse(brief)).toMatchObject({ turnsOmitted: 0, turns: [{ agent: "PULSE", text: "one turn" }] });
  });

  it("states an absent or unreadable record instead of crashing the room", () => {
    expect(JSON.parse(incubatorScanBrief(""))).toMatchObject({ scanRecord: expect.stringContaining("none on file") });
    expect(JSON.parse(incubatorScanBrief("{not json"))).toMatchObject({ scanRecord: expect.stringContaining("unreadable") });
    expect(JSON.parse(incubatorScanBrief(JSON.stringify({ decision: 7 })))).toMatchObject({
      scanRecord: expect.stringContaining("not in the expected shape")
    });
  });

  it("keeps the three block budgets summing below the ceiling", () => {
    // The arithmetic the context comment states, checked rather than asserted in prose. The
    // packet block is not INCUBATOR_PACKET_CHARS exactly — boundIncubatorPacket fills that with
    // JSON and then prefixes a counted header — so raising any budget to the ceiling minus the
    // other two would overflow. composePortfolioContext throws if this ever stops holding; this
    // catches it in review instead.
    let worstPacket = 0;
    for (const count of [1, 9, 10, 40, 99]) {
      for (const summaryChars of [0, 50, 200, 2_000]) {
        const items = Array.from({ length: count }, (_, index) => item(index, {
          summary: "x".repeat(summaryChars),
          title: "T".repeat(300),
          url: `https://example.invalid/${"u".repeat(200)}-${index}`
        }));
        worstPacket = Math.max(worstPacket, boundIncubatorPacket(items).text.length);
      }
    }
    // The header pushes the block past the JSON budget, which is the trap this guards.
    expect(worstPacket).toBeGreaterThan(INCUBATOR_PACKET_CHARS - 200);
    const worstTotal = worstPacket + 1 + INCUBATOR_TASTE_CHARS + 1 + INCUBATOR_SCAN_CHARS;
    expect(worstTotal).toBeLessThan(INCUBATOR_CONTEXT_CHARS);
  });

  it("composes a full packet, taste and scan inside the ceiling without trimming", async () => {
    // The end-to-end shape of the same claim, through the function the room actually calls. A
    // full packet is the case that used to overflow; the composed text has to land under the
    // ceiling on its own rather than by being cut to it.
    const root = `${testStateRoot}-synthesis`;
    const heavy = Array.from({ length: 40 }, (_, index) =>
      item(index, { summary: "x".repeat(2_000) }));
    await atomicWriteJson(root, INCUBATOR_EVIDENCE_PATH, {
      schemaVersion: "incubator-evidence/1",
      generatedAt: "2026-08-05T04:00:00.000Z",
      refs: [...new Set(heavy.map((entry) => `source:${entry.sourceId}`))],
      packet: JSON.stringify(heavy),
      sourceResults: []
    });
    await mkdir(path.join(root, "meetings"), { recursive: true });
    await writeFile(path.join(root, "meetings", "2026-08-05-incubator-scan.json"), scanRecord);
    try {
      // The venture is paused and holds no meeting, so its rooms are given back here rather
      // than read off the registry: what this case is about is the packet the synthesis room is
      // handed, not whether that room is currently on the clock.
      const live = await loadVentureRegistry();
      const registry = structuredClone(live);
      registry.ventures.find((venture) => venture.id === "incubator")!.meetings = [
        { ...live.ventures.find((venture) => venture.id === "titty-tuesdays")!.meetings[0]!, kind: "incubator-scan" },
        { ...live.ventures.find((venture) => venture.id === "titty-tuesdays")!.meetings[0]!, kind: "incubator-synthesis" }
      ];
      const context = await composePortfolioContext(
        "incubator-synthesis", root, "2026-08-05", registry, new Date("2026-08-05T19:00:00.000Z")
      );
      expect(context.text.length).toBeLessThanOrEqual(INCUBATOR_CONTEXT_CHARS);
      // The scan block is the last one and it is still whole JSON — the property the character
      // cut destroyed. Deleting the per-block budgets and cutting the join instead fails here.
      const scanBlock = context.text.slice(context.text.lastIndexOf("\n") + 1);
      expect(() => JSON.parse(scanBlock)).not.toThrow();
      expect(JSON.parse(scanBlock)).toMatchObject({ scanRecord: "2026-08-05", outcome: "PLAN" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

describe("the length limits a shut record has to respect", () => {
  it("caps setting and every turn at 800, not only sharperData.summary at 280", async () => {
    // The comment above recordNoAgendaCycle's sharperData used to call 280 "the only field of
    // this record with a length limit". It is the tightest, not the only one: roomTranscript
    // .setting and turns[].text cap at 800 and take caller strings too. A record that fails to
    // parse takes the whole scheduled run out with exit 1, so this pins the limits the writer
    // clips against — if the schema moves, the clipping in run.ts has to move with it.
    const base = JSON.parse(await readFile(
      path.join(repoRoot, "state", "meetings", "2026-08-04-incubator-scan.json"), "utf8"
    )) as Record<string, unknown>;
    const transcript = base.roomTranscript as { setting: string; turns: Array<{ text: string }> };

    expect(MeetingRecordSchema.safeParse(base).success).toBe(true);
    // 800 is accepted, 801 is not — for the setting...
    for (const [chars, ok] of [[800, true], [801, false]] as const) {
      const candidate = { ...base, roomTranscript: { ...transcript, setting: "s".repeat(chars) } };
      expect(MeetingRecordSchema.safeParse(candidate).success).toBe(ok);
    }
    // ...and for a turn's text.
    for (const [chars, ok] of [[800, true], [801, false]] as const) {
      const turns = transcript.turns.map((turn, index) => index === 0 ? { ...turn, text: "t".repeat(chars) } : turn);
      const candidate = { ...base, roomTranscript: { ...transcript, turns } };
      expect(MeetingRecordSchema.safeParse(candidate).success).toBe(ok);
    }
  });
});

/**
 * The venture is paused: no owner goal needs new venture proposals now, nobody was acting on the
 * ones produced, and the two rooms cost up to about $0.13 a day when they convened.
 *
 * Everything above this line still runs, because it is the machinery reviving the venture would
 * depend on: the packet key that survives a re-keyed sweep, the whole-item context cut, the read
 * log, and the parity between the sweep path and the trigger path. What is gone from this file
 * is the set of cases that drove runPortfolioCycle through a room the registry no longer
 * defines -- there is no route definition for them to compose.
 */
describe("the incubator rooms are parked, not merely quiet", () => {
  it("has no meeting on the clock and no phase the board can commission", async () => {
    const registry = await loadVentureRegistry();
    const venture = registry.ventures.find((entry) => entry.id === "incubator")!;
    expect(venture.status).toBe("paused");
    expect(venture.meetings).toEqual([]);

    const policy = await loadMeetingPolicy();
    expect(policy.agendaRequiredPhases).not.toContain("incubator-synthesis");
    expect(policy.changeTriggeredPhases).not.toContain("incubator-scan");
    expect(policy.transitions.morning).not.toContain("incubator-scan");

    // Its state is untouched, which is the whole point of pausing rather than deleting.
    expect(venture.adminTabs).toContain("niche-proposals");
    expect(venture.taste).toBe(true);
  });
});
