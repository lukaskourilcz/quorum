import { describe, expect, it } from "vitest";
import { CALENDAR_SLOTS } from "@/lib/calendar-feed-model";
import { PROJECT_COLOR, projectForKind } from "@/lib/office-walkthrough";
import type { WorkflowsSlot } from "@/lib/office-workflows-model";
import {
  BEAT_FALL_MS,
  BEAT_HOLD_MS,
  BEAT_RISE_MS,
  BEAT_STRIDE_MS,
  beatAt,
  beatTag,
  buildTimeline,
  elapsedForBeat,
  legsAt,
  notesAt
} from "@/lib/office-workflows-timeline";

/** The standing day, built the way the resolver builds it, so the tests run on real hours. */
const SLOTS: WorkflowsSlot[] = CALENDAR_SLOTS.map((definition) => ({
  kind: definition.kind,
  hour: definition.hour,
  label: definition.label,
  room: projectForKind(definition.kind),
  color: PROJECT_COLOR[projectForKind(definition.kind)] ?? "#ffffff",
  status: "held",
  note: "sent",
  reason: null,
  sits: true
}));

const timeline = buildTimeline(SLOTS);

describe("buildTimeline", () => {
  it("gives one beat per slot, in hour order", () => {
    expect(timeline.beats).toHaveLength(SLOTS.length);
    const hours = timeline.beats.map((beat) => beat.hour);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
    expect(hours).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 19, 20, 22]);
  });

  it("sorts the day itself, so the caller's order cannot change the story", () => {
    const shuffled = [...SLOTS].reverse();
    expect(buildTimeline(shuffled).beats.map((beat) => beat.hour)).toEqual(
      timeline.beats.map((beat) => beat.hour)
    );
  });

  it("runs beats at a fixed stride, each readable after its rise", () => {
    timeline.beats.forEach((beat, index) => {
      expect(beat.startsAt).toBe(index * BEAT_STRIDE_MS);
      expect(beat.readableAt).toBe(beat.startsAt + BEAT_RISE_MS);
      expect(beat.closesAt).toBe(beat.startsAt + BEAT_RISE_MS + BEAT_HOLD_MS);
    });
  });

  it("holds each beat at or above the contract's 1.2s floor", () => {
    expect(BEAT_HOLD_MS).toBeGreaterThanOrEqual(1200);
  });

  it("tags every beat with the registry's own hour and label, unreformatted", () => {
    const edition = timeline.beats.find((beat) => beat.kind === "cu-edition");
    expect(edition?.tag).toBe("05:00 · Edition production");
    const board = timeline.beats.find((beat) => beat.kind === "venture-morning");
    expect(board?.tag).toBe("06:00 · Morning shift");
    // Every tag is exactly its slot's own two fields, and nothing else.
    timeline.beats.forEach((beat) => {
      expect(beat.tag).toBe(beatTag(beat.hour, beat.label));
      const slot = SLOTS.find((entry) => entry.kind === beat.kind && entry.hour === beat.hour);
      expect(beat.label).toBe(slot?.label);
    });
  });

  it("lands the whole performance between 30 and 50 seconds", () => {
    expect(timeline.duration).toBeGreaterThan(30_000);
    expect(timeline.duration).toBeLessThan(50_000);
  });

  it("ends after the last beat has fallen and the last leg has rested", () => {
    const lastBeat = timeline.beats.at(-1);
    expect(timeline.restsAt).toBeGreaterThanOrEqual((lastBeat?.closesAt ?? 0) + BEAT_FALL_MS);
    timeline.legs.forEach((leg) => {
      expect(leg.startsAt + leg.duration).toBeLessThanOrEqual(timeline.restsAt);
    });
  });
});

describe("what leaves each room", () => {
  const journeysFor = (kind: string) => {
    const beat = timeline.beats.find((entry) => entry.kind === kind);
    return [...new Set(beat?.legs.map((leg) => leg.journey.split("-").slice(-2, -1)[0]) ?? [])];
  };

  it("sends two envelopes from everything that produces an article (D11)", () => {
    expect(journeysFor("cu-edition").sort()).toEqual(["press", "social"]);
    expect(journeysFor("article-am").sort()).toEqual(["press", "social"]);
  });

  it("sends marketingShark's two text envelopes, both to the Design Lab and on (D11)", () => {
    const beat = timeline.beats.find((entry) => entry.kind === "ms-daily");
    const journeys = new Set(beat?.legs.map((leg) => leg.journey));
    expect(journeys.size).toBe(2);
    // Neither of them crosses the dock.
    expect(beat?.legs.some((leg) => leg.station === "bench" || leg.station === "bay")).toBe(false);
    expect(beat?.legs.filter((leg) => leg.station === "platforms")).toHaveLength(2);
  });

  it("sends the board a summary that fades along the corridor, and never ships", () => {
    for (const kind of ["venture-morning", "venture-afternoon", "venture-night"]) {
      const beat = timeline.beats.find((entry) => entry.kind === kind);
      expect(beat?.legs.map((leg) => leg.station)).toEqual(["door", "corridor"]);
      expect(beat?.legs.every((leg) => leg.room === "company")).toBe(true);
    }
  });

  it("keeps FightAIQ's slip off the corridor entirely", () => {
    for (const kind of ["mma-intake", "mma-analysis"]) {
      const beat = timeline.beats.find((entry) => entry.kind === kind);
      expect(beat?.legs.map((leg) => leg.station)).toEqual(["shared-wall"]);
      expect(beat?.legs.every((leg) => leg.kind === "slip")).toBe(true);
    }
  });

  it("delivers nothing to Titty Tuesdays, and never reaches its bay", () => {
    const beat = timeline.beats.find((entry) => entry.kind === "tt-marketing");
    expect(beat?.legs.map((leg) => leg.station)).toEqual(["collect-lane"]);
    expect(beat?.legs.every((leg) => leg.kind === "pulse")).toBe(true);
    // Nothing anywhere in the day travels to the storefront.
    expect(timeline.legs.some((leg) => leg.room === "titty-tuesdays" && leg.kind === "envelope")).toBe(false);
  });

  it("carries GoVIRAL's trend as a signal rather than a parcel", () => {
    const beat = timeline.beats.find((entry) => entry.kind === "gv-brief");
    expect(beat?.legs.map((leg) => leg.station)).toEqual(["green-line"]);
    expect(beat?.legs.every((leg) => leg.kind === "pulse")).toBe(true);
  });

  it("sends nothing from a room that met and decided", () => {
    // The product room, the story meeting and the evening desk review all light, tag and hang a
    // note. Giving them a package would be inventing a record.
    for (const kind of ["cu-product", "mag-editorial", "mag-desk"]) {
      expect(timeline.beats.find((entry) => entry.kind === kind)?.legs).toEqual([]);
    }
  });

  it("fills every envelope with its producing venture's own hue (D10)", () => {
    timeline.legs.forEach((leg) => {
      expect(leg.color).toBe(PROJECT_COLOR[leg.room]);
    });
  });
});

describe("every journey is walked in order (D10)", () => {
  it("starts each leg exactly where the one before it rested", () => {
    const byJourney = new Map<string, typeof timeline.legs>();
    timeline.legs.forEach((leg) => {
      byJourney.set(leg.journey, [...(byJourney.get(leg.journey) ?? []), leg]);
    });
    expect(byJourney.size).toBeGreaterThan(0);
    for (const [journey, legs] of byJourney) {
      const ordered = [...legs].sort((a, b) => a.index - b.index);
      ordered.forEach((leg, index) => {
        expect(leg.index, journey).toBe(index);
        const previous = ordered[index - 1];
        if (previous) {
          // No gap, and no overlap: an envelope cannot be in two places at once.
          expect(leg.startsAt, `${journey} leg ${index}`).toBe(previous.startsAt + previous.duration);
        }
      });
      expect(ordered.at(-1)?.last, journey).toBe(true);
      expect(ordered.slice(0, -1).every((leg) => !leg.last), journey).toBe(true);
    }
  });

  it("never starts a journey before its own beat has closed", () => {
    timeline.beats.forEach((beat) => {
      beat.legs.forEach((leg) => {
        expect(leg.startsAt, `${beat.kind} ${leg.station}`).toBeGreaterThan(beat.closesAt);
      });
    });
  });

  it("does not send a room's two journeys abreast", () => {
    const beat = timeline.beats.find((entry) => entry.kind === "cu-edition");
    const firsts = beat?.legs.filter((leg) => leg.index === 0).map((leg) => leg.startsAt) ?? [];
    expect(firsts).toHaveLength(2);
    expect(firsts[0]).not.toBe(firsts[1]);
  });

  it("gives every leg a stable id, so a keyframe is never restarted by a re-key", () => {
    const ids = timeline.legs.map((leg) => leg.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(buildTimeline(SLOTS).legs.map((leg) => leg.id)).toEqual(ids);
  });
});

describe("reading the timeline at a moment", () => {
  it("finds the beat that is live, and nothing before the first or after the last", () => {
    expect(beatAt(timeline, -1)).toBeNull();
    expect(beatAt(timeline, 0)?.hour).toBe(5);
    const third = timeline.beats[2];
    expect(beatAt(timeline, third!.readableAt)?.hour).toBe(third!.hour);
    const last = timeline.beats.at(-1);
    expect(beatAt(timeline, last!.closesAt)).toBeNull();
    expect(beatAt(timeline, timeline.duration)).toBeNull();
  });

  it("hangs a note as each beat closes and keeps it to the end", () => {
    expect(notesAt(timeline, SLOTS, 0).every((note) => note === "none")).toBe(true);
    const first = timeline.beats[0]!;
    const afterFirst = notesAt(timeline, SLOTS, first.closesAt);
    expect(afterFirst.filter((note) => note !== "none")).toHaveLength(1);
    // The finished picture is every note hung, which is what ambient shows at 22:00.
    const atEnd = notesAt(timeline, SLOTS, timeline.restsAt);
    expect(atEnd.every((note) => note !== "none")).toBe(true);
    expect(atEnd).toEqual(SLOTS.map((slot) => slot.note));
  });

  it("hangs today's real note, not an invented one", () => {
    const quiet = SLOTS.map((slot, index) => (index === 0 ? { ...slot, note: "quiet" as const } : slot));
    const built = buildTimeline(quiet);
    expect(notesAt(built, quiet, built.restsAt)[0]).toBe("quiet");
  });

  it("has nothing in flight before the first beat closes, or after the last leg rests", () => {
    expect(legsAt(timeline, 0)).toEqual([]);
    expect(legsAt(timeline, timeline.restsAt)).toEqual([]);
    expect(legsAt(timeline, timeline.duration)).toEqual([]);
    const mid = timeline.legs[0]!;
    expect(legsAt(timeline, mid.startsAt).map((leg) => leg.id)).toContain(mid.id);
  });

  it("puts a reduced-motion step in the middle of its beat's hold", () => {
    timeline.beats.forEach((beat, index) => {
      expect(beatAt(timeline, elapsedForBeat(timeline, index))?.hour).toBe(beat.hour);
    });
  });
});

describe("the day the registry actually holds", () => {
  it("lights GoVIRAL's beat even though it sits one day in seven (D2)", () => {
    // The performance shows how the day operates, so a gated slot still gets its beat. Ambient's
    // own rule, where a gated slot lights nothing, is untouched by this file.
    const gated = SLOTS.map((slot) => (slot.kind === "gv-brief" ? { ...slot, sits: false } : slot));
    const built = buildTimeline(gated);
    expect(built.beats.find((beat) => beat.kind === "gv-brief")).toBeDefined();
    expect(built.beats).toHaveLength(SLOTS.length);
  });

  it("survives a day with no slots at all", () => {
    const empty = buildTimeline([]);
    expect(empty.beats).toEqual([]);
    expect(empty.legs).toEqual([]);
    expect(empty.restsAt).toBe(0);
    expect(beatAt(empty, 0)).toBeNull();
  });

  it("handles a slot kind the journey table has never heard of", () => {
    const invented: WorkflowsSlot[] = [{ ...SLOTS[0]!, kind: "not-a-real-kind" }];
    const built = buildTimeline(invented);
    expect(built.beats).toHaveLength(1);
    expect(built.beats[0]?.legs).toEqual([]);
  });
});
