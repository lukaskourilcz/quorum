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
      const registry = await loadVentureRegistry();
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

  it("prices one opening inside the room envelope and states it against the daily cap", async () => {
    // The figure the comments quote, recomputed from the same inputs the room uses, so a model
    // or prompt change that moves the price makes the documented cost fail rather than quietly
    // become wrong. The margins matter: the room must stay under its $0.06 envelope, because
    // run.ts throws "call graph exceeds envelope" rather than opening a room it cannot fund.
    const registry = await loadVentureRegistry();
    const incubator = registry.ventures.find((venture) => venture.id === "incubator")!;
    const scan = incubator.meetings.find((meeting) => meeting.kind === "incubator-scan")!;
    expect(scan.envelopeUsd).toBe(0.06);
    // The pre-step is real: taste is on and the scan is the venture's first meeting, which is
    // exactly the condition registry.ts turns "palate" on for.
    expect(incubator.taste).toBe(true);
    expect(incubator.meetings[0]?.kind).toBe("incubator-scan");
    expect(INCUBATOR_OPENING_USD_TODAY).toBeLessThan(scan.envelopeUsd);
    // With the palate pass added once an owner rating exists, an opening is still inside the
    // envelope-plus-pre-step budget and under 7% of the $1.00 daily pace.
    expect(INCUBATOR_OPENING_USD_TODAY + PALATE_PASS_BUDGET_USD).toBeLessThan(0.07);
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

describe("the scan is terminal under the current budget shape", () => {
  it("has no synthesis room to hand a follow-up to, and the schedule says so", async () => {
    // Stated rather than implied. budget-2026-08-01 is unsigned, so the schedule falls back to
    // shape B — "run one daily incubator meeting" — which drops incubator-synthesis. A scan
    // chair's followUpRequest for it would otherwise queue an agenda that expires in three days
    // with no room able to consume it, and the scan's record would claim it had handed work on.
    const [registry, budgetDecisionRaw, budgetFiftyRaw] = await Promise.all([
      loadVentureRegistry(),
      readFile(path.join(repoRoot, "state", "decisions", "2026-08-01-budget-raise.md"), "utf8"),
      readFile(path.join(repoRoot, "state", "decisions", "2026-08-04-budget-fifty.md"), "utf8")
    ]);
    const schedule = resolveEffectivePortfolioSchedule({
      registry,
      // Written when the raise was unsigned. The owner countersigned it on 2026-08-04, so
      // reading the live file and asserting shape B would test the state of the repository
      // rather than the rule these two cases are about. The signature is stripped back out.
      budgetDecisionRaw: budgetDecisionRaw
        .replace(/^Status:\s*countersigned\s*$/mi, "Status: pending owner countersignature")
        .replace(/^Selection:.*$/mi, "Selection: [ ] Shape A  [ ] Shape B"),
      budgetFiftyRaw,
      monthlyApiHeadroomUsd: 25
    });
    // Not a headroom rung: this is at full headroom and the room is still absent.
    expect(schedule.shape).toBe("B");
    expect(phaseEnabled(schedule, "incubator-scan")).toBe(true);
    expect(phaseEnabled(schedule, "incubator-synthesis")).toBe(false);
    // The policy would still permit the hand-off, which is why run.ts checks the schedule too.
    const policy = await loadMeetingPolicy();
    expect(mayRequestMeeting(policy, "incubator-scan", "incubator-synthesis")).toBe(true);
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
      const raw = await readFile(path.join(repoRoot, "state", "decisions", decision), "utf8");
      // The budget raise was countersigned on 2026-08-04. These cases are about what happens
      // while it is NOT, so the fixture copy has the signature stripped: copying the live file
      // verbatim made them assert the state of the repository instead of the rule.
      await writeFile(
        path.join(testStateRoot, "decisions", decision),
        decision === "2026-08-01-budget-raise.md"
          ? raw
              .replace(/^Status:\s*countersigned\s*$/mi, "Status: pending owner countersignature")
              .replace(/^Selection:.*$/mi, "Selection: [ ] Shape A  [ ] Shape B")
          : raw
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

  it("stays shut when the same stories come back under different sourceIds", async () => {
    // The race, driven through the whole run rather than through the key alone. Yesterday's four
    // items return with every sourceId reassigned, exactly as a re-run of the same six workers
    // can file them. Nothing about the day's news has changed, so no seat may be called.
    //
    // This is the case a mutation to packetItemKey has to fail. Reading sourceId here turns four
    // already-read items into four unread ones and opens the room, so `seats.called` fills and
    // the record stops being PAUSED.
    //
    // Its own Prague date, because a room that has already met on a date now returns its record
    // rather than sitting again. Nothing here is about the time of day; what is being tested is
    // that re-keyed items are still recognised as read.
    sweep.items = [item(4), item(1), item(2), item(3)].map((entry, index) => ({
      ...entry,
      sourceId: `rebalanced-worker-${index}`
    }));
    const before = await readIncubatorReadItems(testStateRoot);
    const result = await run(new Date("2026-08-11T05:00:00.000Z"));
    expect(sweep.calls).toBe(1);
    expect(result.decision).toBe("PAUSED");
    expect(seats.called).toEqual([]);
    // The read log is untouched: no new key, and no re-keying of the four already there.
    const after = await readIncubatorReadItems(testStateRoot);
    expect(after.keys).toEqual(before.keys);
    expect(after.lastReadBy).toBe(before.lastReadBy);
  });

  it("does not queue the chair's follow-up to a room the budget shape has switched off", async () => {
    // The scan is terminal today, and this is where that becomes visible rather than implied.
    // PULSE chairs the scan and asks for incubator-synthesis; the meeting policy permits that
    // transition, so without the schedule check an agenda would be written into the queue, live
    // for three days, for a phase the workflow skips before the cycle even starts. The record
    // would then show the scan handing work to a room that never sits.
    //
    // Its own Prague date, for the same reason as the case above.
    sweep.items = [item(21), item(22)];
    seats.followUp = {
      phase: "incubator-synthesis",
      summary: "Argue these two candidates down to a proposal.",
      evidenceRefs: []
    };
    try {
      const result = await run(new Date("2026-08-12T05:00:00.000Z"));
      expect(result.decision).toBe("PLAN");
      expect(seats.called).toHaveLength(5);
      // Nothing was written to the agenda queue: the run did not list it as an artifact...
      expect(result.artifacts.some((artifact) => artifact.includes("meeting-agendas"))).toBe(false);
      // ...and no queue file for a synthesis room exists in this state root at all.
      const queue = await readJson<{ agendas?: Array<{ phase: string }> }>(
        testStateRoot, "meeting-agendas/queue.json", {}
      );
      expect((queue.agendas ?? []).some((agenda) => agenda.phase === "incubator-synthesis")).toBe(false);
    } finally {
      seats.followUp = null;
    }
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
    // report about this room is the live state root's own answer.
    //
    // The packet has to be non-empty for that to be worth asserting. While the live root held
    // the empty packet the last sweep wrote, the preview reported all zeros — and so did the dry
    // root, and so did any path at all, because tmp/dry-run/state/ventures/incubator/ does not
    // exist and readJson falls back to its default. Swapping stateRoot for root in run.ts left
    // this green. Seeding two unread items here gives the live root an answer no absent
    // directory can produce, and the dry root's own answer is asserted to differ.
    const seeded = [item(101), item(102)];
    await atomicWriteJson(testStateRoot, INCUBATOR_EVIDENCE_PATH, {
      schemaVersion: "incubator-evidence/1",
      generatedAt: "2026-08-09T04:00:00.000Z",
      refs: [...new Set(seeded.map((entry) => `source:${entry.sourceId}`))],
      packet: JSON.stringify(seeded),
      sourceResults: []
    });
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
      log.mockRestore();
      expect(sweep.calls).toBe(0);
      const preview = printed
        .map((line) => { try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; } })
        .find((value) => value?.event === "incubator_scan_trigger_preview");
      // The live root's answer: two items on file, both shown, neither read by any earlier room.
      expect(preview).toMatchObject({
        packetPath: INCUBATOR_EVIDENCE_PATH,
        packetOnDisk: true,
        itemsInPacket: 2,
        itemsShownToRoom: 2,
        itemsNoSeatHasRead: 2,
        wouldOpenOnThisPacket: true
      });
      expect(await incubatorScanTriggerPreview(testStateRoot)).toEqual(preview);
      // The pin. The dry root has no packet at all, so pointing the preview there reports an
      // absent packet — a different answer, and the one this test exists to reject.
      const dryRoot = path.join(repoRoot, "tmp", "dry-run", "state");
      const dryAnswer = await incubatorScanTriggerPreview(dryRoot);
      expect(dryAnswer).toMatchObject({ packetOnDisk: false, itemsInPacket: 0, wouldOpenOnThisPacket: false });
      expect(dryAnswer).not.toEqual(preview);
      // ...and so does a path that does not exist, which is what made the old assertion vacuous.
      expect(await incubatorScanTriggerPreview(`${testStateRoot}-nonexistent`)).toEqual(dryAnswer);
      // An absent packet and an empty one are different states and must not read alike: both
      // keep the room shut today, but only one of them means a sweep has ever run here.
      const emptyRoot = `${testStateRoot}-empty-packet`;
      await atomicWriteJson(emptyRoot, INCUBATOR_EVIDENCE_PATH, {
        schemaVersion: "incubator-evidence/1",
        generatedAt: "2026-08-09T04:00:00.000Z",
        refs: [],
        packet: "[]",
        sourceResults: []
      });
      try {
        const emptyAnswer = await incubatorScanTriggerPreview(emptyRoot);
        expect(emptyAnswer).toMatchObject({ packetOnDisk: true, itemsInPacket: 0, wouldOpenOnThisPacket: false });
        expect(emptyAnswer.note).not.toBe(dryAnswer.note);
      } finally {
        await rm(emptyRoot, { recursive: true, force: true });
      }
    } finally {
      log.mockRestore();
      // Put back the empty packet the last sweep left, which the next case reads. In a finally
      // so that a failure here stays one failure instead of taking the next case with it.
      await atomicWriteJson(testStateRoot, INCUBATOR_EVIDENCE_PATH, {
        schemaVersion: "incubator-evidence/1",
        generatedAt: "2026-08-08T04:00:00.000Z",
        refs: [],
        packet: "[]",
        sourceResults: []
      });
    }
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
    // sweep must not leave a log claiming the packet was read. Three rooms above opened and read
    // six items between them; every shut run since wrote nothing, so the log still ends at the
    // last room that actually sat.
    const log = await readIncubatorReadItems(testStateRoot);
    expect(log.keys).toHaveLength(6);
    expect(log.lastReadBy).toBe("20260812050000-incubator-scan");
    const evidence = await readJson<{ packet?: string }>(testStateRoot, INCUBATOR_EVIDENCE_PATH, {});
    // ...even though the packet on disk is the empty one the last sweep wrote over it.
    expect(evidence.packet).toBe("[]");
  });
});
