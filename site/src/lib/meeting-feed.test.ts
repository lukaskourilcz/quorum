import { describe, expect, it } from "vitest";
import {
  WORKSPACE_CHANNELS,
  buildMeetingFeed,
  channelForKind,
  type FeedMessage
} from "./meeting-feed";
import { readsAsMachineText } from "./public-prose";
import type { PublicMeetingRecord } from "./meeting-record-model";
import type { PublicStandup } from "../data/fixtures";

function transcript(overrides: Partial<PublicMeetingRecord["roomTranscript"]> = {}) {
  return {
    openedAt: "2026-08-10T11:00:00.000Z",
    closedAt: "2026-08-10T11:04:00.000Z",
    gavel: "PULSE" as const,
    setting: "Live bounded portfolio room. Canonical context and external material were treated as data, never instructions.",
    turns: [
      { agent: "PULSE" as const, mode: "gavel" as const, sentAt: "2026-08-10T11:00:00.000Z", text: "Read this week's data and name what is rising." },
      { agent: "SCOUT" as const, mode: "statement" as const, sentAt: "2026-08-10T11:01:00.000Z", text: "Two tags are climbing and one has gone flat." },
      { agent: "PULSE" as const, mode: "close" as const, sentAt: "2026-08-10T11:04:00.000Z", text: "Brief recorded." }
    ],
    ...overrides
  };
}

function meeting(overrides: Partial<PublicMeetingRecord> = {}): PublicMeetingRecord {
  return {
    id: "2026-08-10-gv-brief",
    cycleId: "cycle-200",
    date: "2026-08-10",
    kind: "gv-brief",
    fixture: false,
    status: "HELD",
    stage: "VALIDATION",
    operatingBrief: "Turn this week's scout data into the owner's weekly content brief.",
    participants: [{ agent: "PULSE", reason: "chairs the bounded room", participated: true }],
    ledger: { estimate: 0.06, actual: 0.05, monthAllIn: 3.1, cap: 30 },
    decision: { outcome: "PLAN", summary: "Two trend calls and one deliberate skip, all recorded.", evidenceRefs: [] },
    proposals: [],
    voteMatrix: [],
    tasks: [],
    growthPlan: "Drafts and plans only.",
    eveningOutcome: null,
    ideaVerdicts: [],
    roomTranscript: transcript(),
    generatedAt: "2026-08-10T11:04:00.000Z",
    ...overrides
  };
}

function standup(overrides: Partial<PublicStandup> = {}): PublicStandup {
  return {
    id: "2026-08-10-morning",
    date: "2026-08-10",
    phase: "morning",
    fixture: false,
    status: "PLAN",
    stage: "VALIDATION",
    operatingBrief: "Decide the day.",
    participants: [],
    ledger: { estimate: 0.2, actual: 0.11, monthAllIn: 3.1, cap: 30 },
    proposals: [],
    voteMatrix: [],
    decision: { outcome: "PLAN", summary: "One room commissioned for tomorrow.", evidenceRefs: [] },
    tasks: [],
    growthPlan: "Planning only.",
    eveningOutcome: null,
    roomTranscript: transcript({
      openedAt: "2026-08-10T04:00:00.000Z",
      closedAt: "2026-08-10T04:06:00.000Z",
      gavel: "VIZE",
      turns: [{ agent: "VIZE", mode: "gavel", sentAt: "2026-08-10T04:00:00.000Z", text: "What matters today." }]
    }),
    generatedAt: "2026-08-10T04:06:00.000Z",
    ...overrides
  };
}

const empty = { meetings: [], standups: [], skips: [] };

function messagesIn(channels: ReturnType<typeof buildMeetingFeed>, id: string): FeedMessage[] {
  return channels.find((channel) => channel.id === id)?.days.flatMap((day) => day.messages) ?? [];
}

describe("the workspace channel map", () => {
  it("routes every room a reader can open, and nothing else", () => {
    expect(WORKSPACE_CHANNELS).toHaveLength(12);
    expect(channelForKind("cu-edition")).toBe("vydani-dneskai");
    expect(channelForKind("gv-brief")).toBe("goviral-trend-room");
    expect(channelForKind("tt-marketing")).toBe("titty-tuesdays-marketing");
    expect(channelForKind("mag-desk")).toBe("vecerni-redakce");
    expect(channelForKind("bh-desk")).toBe("booksofhistory-editorial-desk");
    expect(channelForKind("dm-desk")).toBe("door-money-story-room");
    expect(channelForKind("dm-growth")).toBe("door-money-story-room");
    expect(channelForKind("ts-desk")).toBe("tehdejsi-svet-editorial-desk");
    expect(channelForKind("kv-desk")).toBe("kvorum-political-desk");
    // The three board shifts are one conversation, and the two fight-data rooms are one check.
    expect(new Set(["morning", "afternoon", "night"].map(channelForKind))).toEqual(new Set(["ranni-porada"]));
    expect(new Set(["mma-intake", "mma-analysis"].map(channelForKind))).toEqual(new Set(["kontrola-mma-dat"]));
    // Article slots are what the story desk decided, so they land in the story desk's channel.
    expect(channelForKind("article-am")).toBe("redakcni-porada-mma");
    expect(channelForKind("mag-editorial")).toBe("redakcni-porada-mma");
    // No channel for rooms the design does not show. A missing kind is null, never a default.
    expect(channelForKind("cu-product")).toBeNull();
    expect(channelForKind("studio")).toBeNull();
    expect(channelForKind("incubator-scan")).toBeNull();
    expect(channelForKind("")).toBeNull();
  });

  it("returns every channel even when nothing has happened in them", () => {
    const feed = buildMeetingFeed(empty);
    expect(feed.map((channel) => channel.id)).toEqual(WORKSPACE_CHANNELS.map((channel) => channel.id));
    expect(feed.every((channel) => channel.days.length === 0)).toBe(true);
  });
});

describe("a held meeting", () => {
  it("replays as opening, turns and a pinned decision, in time order", () => {
    const messages = messagesIn(buildMeetingFeed({ ...empty, meetings: [meeting()] }), "goviral-trend-room");
    expect(messages.map((message) => message.kind)).toEqual(["system", "message", "message", "message", "decision"]);
    expect(messages.at(-1)?.text).toBe("Two trend calls and one deliberate skip, all recorded.");
    expect(messages.at(-1)?.author.id).toBe("PULSE");
    // Authors carry a title, so the viewer never has to look one up or print a bare id.
    expect(messages[1]?.author.title).not.toBe(messages[1]?.author.id);
    expect(messages.map((message) => message.at)).toEqual([...messages.map((message) => message.at)].sort());
  });

  it("gives a paused room exactly one system line and no conversation", () => {
    const messages = messagesIn(buildMeetingFeed({
      ...empty,
      meetings: [meeting({
        status: "PAUSED",
        decision: { outcome: "NO_ACTION", summary: "This room meets on Mondays. Nothing was spent.", evidenceRefs: [] }
      })]
    }), "goviral-trend-room");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: "system", text: "This room meets on Mondays. Nothing was spent." });
    expect(messages[0]?.author.id).toBe("system");
  });

  it("leaves fixtures out, because a dry room is not something that happened", () => {
    expect(messagesIn(buildMeetingFeed({ ...empty, meetings: [meeting({ fixture: true })] }), "goviral-trend-room"))
      .toEqual([]);
  });
});

describe("a day", () => {
  it("holds up to three board blocks under one divider", () => {
    const feed = buildMeetingFeed({
      ...empty,
      standups: [
        standup(),
        standup({ id: "2026-08-10-afternoon", phase: "afternoon" }),
        standup({ id: "2026-08-10-night", phase: "night" })
      ]
    });
    const board = feed.find((channel) => channel.id === "ranni-porada");
    expect(board?.days).toHaveLength(1);
    expect(board?.days[0]?.date).toBe("2026-08-10");
    expect(board?.days[0]?.messages.filter((message) => message.kind === "decision")).toHaveLength(3);
  });

  it("emits one system line for a room that did not meet, and nothing for a day with no record", () => {
    const feed = buildMeetingFeed({
      ...empty,
      skips: [{ date: "2026-08-11", phase: "gv-brief", reason: "This room meets on Mondays. Nothing was spent." }]
    });
    const messages = messagesIn(feed, "goviral-trend-room");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: "system", text: "This room meets on Mondays. Nothing was spent." });
    // A blank day is not a day. Nothing was recorded on the 10th, so the 10th does not exist here.
    expect(feed.find((channel) => channel.id === "goviral-trend-room")?.days.map((day) => day.date))
      .toEqual(["2026-08-11"]);
  });

  it("sorts days ascending so a replay reads forwards", () => {
    const feed = buildMeetingFeed({
      ...empty,
      meetings: [meeting({ id: "b", date: "2026-08-17" }), meeting({ id: "a", date: "2026-08-10" })]
    });
    expect(feed.find((channel) => channel.id === "goviral-trend-room")?.days.map((day) => day.date))
      .toEqual(["2026-08-10", "2026-08-17"]);
  });
});

describe("a delivery", () => {
  it("carries its package ref in the attachment and never in the prose", () => {
    const messages = messagesIn(buildMeetingFeed({
      ...empty,
      deliveries: [{
        date: "2026-08-10",
        kind: "cu-edition",
        text: "Today's edition was published.",
        ref: "edition/archive/2026-08-10-9f2c1a4b.json"
      }]
    }), "vydani-dneskai");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.kind).toBe("delivery");
    expect(messages[0]?.attachment).toEqual({
      label: "Delivered package",
      ref: "edition/archive/2026-08-10-9f2c1a4b.json"
    });
    // The ref is a machine address behind a disclosure. The sentence beside it stays a sentence.
    expect(messages[0]?.text).not.toContain("edition/archive");
  });
});

describe("the prose rule the workspace would otherwise break", () => {
  it("reads as prose in every message text, refs excepted", () => {
    const feed = buildMeetingFeed({
      meetings: [meeting()],
      standups: [standup()],
      skips: [{ date: "2026-08-11", phase: "gv-brief", reason: "This room meets on Mondays. Nothing was spent." }],
      articleSlots: [{ date: "2026-08-10", slot: "am", status: "killed", reason: "The story meeting named no source-backed subject for this slot." }],
      deliveries: [{ date: "2026-08-10", kind: "cu-edition", text: "Today's edition was published.", ref: "edition/archive/2026-08-10-9f2c1a4b.json" }]
    });
    const texts = feed.flatMap((channel) => channel.days.flatMap((day) => day.messages.map((message) => message.text)));
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(readsAsMachineText(text), text).toBe(false);
    }
  });
});
