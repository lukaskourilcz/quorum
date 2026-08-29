import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ventureRegistry from "../../../config/ventures.json";
import type { CalendarDefinition, CalendarStatus } from "./calendar-feed-model";
import {
  REPLAY_FIRST_HOUR,
  REPLAY_LAST_HOUR,
  WORKSHOP_ROOM,
  doorNoteKind,
  litRoomForHour,
  type WorkflowsSlot
} from "./office-workflows-model";
import { resolveOfficeWorkflows } from "./office-workflows";
import { getPublicCalendarSchedule } from "./venture-registry";
import { getPublicStandups } from "./standup-records";
import { getPublicMeetingRecords } from "./meeting-records";
import { getPublicMeetingSkips } from "./meeting-skips";
import { getPublicArticleSlots } from "./article-slots";

const originalRoot = process.env.BOARDLESSAI_REPO_ROOT;

afterEach(() => {
  if (originalRoot === undefined) delete process.env.BOARDLESSAI_REPO_ROOT;
  else process.env.BOARDLESSAI_REPO_ROOT = originalRoot;
});

function slot(partial: Partial<WorkflowsSlot> & { hour: number }): WorkflowsSlot {
  return {
    kind: "cu-edition",
    label: "DNESKAi edition production",
    room: "caught-up",
    color: "#fe45e2",
    status: "held",
    note: "quiet",
    reason: null,
    sits: true,
    ...partial
  };
}

describe("door notes", () => {
  it("separates a session that sent something from one that decided nothing was needed", () => {
    // Both are successes and both hang a note. Only one of them put something outside the
    // building, and that is the whole difference the two fills carry.
    expect(doorNoteKind("held", true)).toBe("sent");
    expect(doorNoteKind("held", false)).toBe("quiet");
  });

  it("treats a gated slot and a room with no agenda as quiet closes, not failures", () => {
    expect(doorNoteKind("skipped", false)).toBe("quiet");
    expect(doorNoteKind("not-needed", false)).toBe("quiet");
  });

  it("hangs nothing for a slot whose hour has passed with no record", () => {
    expect(doorNoteKind("missed", false)).toBe("missed");
  });

  it("hangs nothing at all before the hour, or while the run is still working", () => {
    // An empty clip before the hour would be a lie about the day.
    expect(doorNoteKind("scheduled", false)).toBe("none");
    expect(doorNoteKind("ongoing", false)).toBe("none");
  });

  it("shows a slot still inside its grace as waiting rather than as lost", () => {
    expect(doorNoteKind("late", false)).toBe("waiting");
  });

  it("covers every calendar status", () => {
    const statuses: CalendarStatus[] = [
      "scheduled", "ongoing", "late", "held", "missed", "not-needed", "skipped"
    ];
    for (const status of statuses) {
      expect(doorNoteKind(status, false)).not.toBeUndefined();
    }
  });
});

describe("which room the hour lights", () => {
  const slots = [
    slot({ hour: 5, kind: "cu-edition", room: "caught-up" }),
    slot({ hour: 7, kind: "ms-daily", room: "marketingshark" }),
    slot({ hour: 13, kind: "gv-brief", room: "goviral", status: "skipped", sits: false }),
    slot({ hour: 20, kind: "mag-desk", room: "mma-files" })
  ];

  it("lights the room whose slot owns the hour", () => {
    expect(litRoomForHour(5, slots)).toBe("caught-up");
    expect(litRoomForHour(7, slots)).toBe("marketingshark");
  });

  it("leaves GoVIRAL dark at 13:00 on the six days its room does not sit", () => {
    // The registry carries gv-brief every day; the gate is what makes it a Monday room, and a
    // gated slot is recorded rather than left to a second calendar somewhere in the component.
    expect(litRoomForHour(13, slots)).toBeNull();
    const monday = slots.map((entry) =>
      entry.hour === 13 ? { ...entry, status: "held" as CalendarStatus, sits: true } : entry
    );
    expect(litRoomForHour(13, monday)).toBe("goviral");
  });

  it("lights nothing on an hour no room owns", () => {
    expect(litRoomForHour(4, slots)).toBeNull();
    expect(litRoomForHour(23, slots)).toBeNull();
  });

  it("never returns the workshop, which is lit always rather than by an hour", () => {
    const withStudio = [...slots, slot({ hour: 12, kind: "studio", room: WORKSHOP_ROOM })];
    expect(litRoomForHour(12, withStudio)).toBeNull();
  });
});

describe("resolving against committed state", () => {
  it("crosses the boundary carrying no path, no repository and no full hash", async () => {
    const resolved = await resolveOfficeWorkflows(new Date("2026-08-06T09:00:00Z"));
    const serialized = JSON.stringify(resolved);

    expect(serialized).not.toMatch(/"state\//u);
    expect(serialized).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\\\/u);
    // The one hash-like value allowed is the 12-character receipt form the delivery commit
    // subject already publishes. A 40- or 64-character hex string is a raw hash or a commit.
    expect(serialized).not.toMatch(/[0-9a-f]{40,}/u);
    // A repository name is an internal address even when the repository is public.
    expect(serialized).not.toMatch(/lukaskourilcz\//u);

    if (resolved.receipt) {
      expect(resolved.receipt.packageRef).toMatch(/^\[package:[0-9a-f]{12}\]$/u);
    }
  });

  it("reads the hook libraries and the question bank from the repository", async () => {
    const resolved = await resolveOfficeWorkflows(new Date("2026-08-06T09:00:00Z"));
    // Counts, not literals: the libraries grow, and a test that pinned today's numbers would
    // fail on the next honest append rather than on a regression.
    expect(resolved.hooks.quiz).toBeGreaterThan(0);
    expect(resolved.hooks.quizTierB).toBeGreaterThan(0);
    expect(resolved.bank?.questions).toBeGreaterThan(0);
    expect(resolved.bank?.importedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it("takes the edition gate figures from config rather than from prose", async () => {
    const resolved = await resolveOfficeWorkflows(new Date("2026-08-06T09:00:00Z"));
    expect(resolved.gates.minimumSuccessfulSources).toBe(10);
    expect(resolved.gates.minimumCandidateItems).toBe(10);
    expect(resolved.gates.maximumCurationCandidates).toBe(50);
    expect(resolved.gates.minimumScore).toBe(35);
    expect(resolved.gates.maximumRegenerationAttempts).toBe(2);
    expect(resolved.gates.targetWords).toBe(1100);
    expect(resolved.editionCap).toBe(0.5);
  });

  it("builds the company room, every operating venture's room and today's slots from one calendar read", async () => {
    const now = new Date("2026-08-06T09:00:00Z");
    const [standups, meetings, skips, articleSlots, definitions] = await Promise.all([
      getPublicStandups(),
      getPublicMeetingRecords(),
      getPublicMeetingSkips(),
      getPublicArticleSlots(),
      getPublicCalendarSchedule()
    ]);
    const resolved = await resolveOfficeWorkflows(now, {
      standups, meetings, skips, articleSlots, definitions
    });

    // One room per operating public venture plus the company room. A venture the owner paused
    // in Settings leaves the plan and the calendar together, so its desk kinds must be absent —
    // computed from the registry so this holds whichever way the switches point today.
    const operating = ventureRegistry.ventures
      .filter((venture) => venture.status === "operating" && venture.visibility === "public");
    const pausedKinds = new Set(ventureRegistry.ventures
      .filter((venture) => venture.status === "paused")
      .flatMap((venture) => venture.meetings.map(({ kind }) => kind)));
    expect(resolved.rooms).toHaveLength(operating.length + 1);
    expect(resolved.slots).toHaveLength(definitions.length);
    for (const kind of ["bh-desk", "dm-desk", "dm-growth", "ts-desk", "kv-desk"]) {
      expect(resolved.slots.some((slot) => slot.kind === kind), kind).toBe(!pausedKinds.has(kind));
    }
    // The workshop holds no session, so it hangs no note and appears with no slots at all.
    expect(resolved.rooms.find((room) => room.key === WORKSHOP_ROOM)?.slots).toEqual([]);
    // Every slot lands in a room the plan actually draws.
    const drawn = new Set(resolved.rooms.map((room) => room.key));
    for (const entry of resolved.slots) expect(drawn.has(entry.room)).toBe(true);
    // Nothing on the plan raises a tooltip, so no room carries a sentence for one. The recorded
    // reasons travel on the slots, where the replay rail's controls read them.
    for (const room of resolved.rooms) expect(room).not.toHaveProperty("title");
  });
});

describe("resolving against an empty state root", () => {
  it("returns null or an empty list for every figure and throws nothing", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "boardlessai-workflows-"));
    process.env.BOARDLESSAI_REPO_ROOT = empty;

    const resolved = await resolveOfficeWorkflows(new Date("2026-08-06T09:00:00Z"));

    expect(resolved.receipt).toBeNull();
    expect(resolved.example).toBeNull();
    expect(resolved.bank).toBeNull();
    // The absence of a library is itself the datum: that surface takes the logged no-hook
    // fallback, which is an ordinary outcome and not a zero-length library.
    expect(resolved.hooks).toEqual({ quiz: null, quizTierB: null, news: null, mma: null });
    expect(resolved.slots).toEqual([]);
    // The rooms still draw. A plan with no records is a building with every light off, which is
    // a true picture of a day nothing was recorded for. Paused ventures' rooms are off the plan
    // entirely, so the count follows the registry.
    expect(resolved.rooms).toHaveLength(ventureRegistry.ventures
      .filter((venture) => venture.status === "operating" && venture.visibility === "public").length + 1);
    expect(resolved.today).toBe("2026-08-06");
  });
});

describe("the schedule the plan is drawn against", () => {
  it("puts every registry slot inside the working day the plan is drawn against", async () => {
    const definitions: readonly CalendarDefinition[] = await getPublicCalendarSchedule();
    for (const definition of definitions) {
      expect(definition.hour).toBeGreaterThanOrEqual(REPLAY_FIRST_HOUR);
      expect(definition.hour).toBeLessThanOrEqual(REPLAY_LAST_HOUR);
    }
  });
});
