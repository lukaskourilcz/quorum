import { describe, expect, it } from "vitest";
import {
  PLAN_HEIGHT,
  PLAN_WIDTH,
  ROOMS,
  ROOM_FRAME_SPAN,
  legStart,
  roomViewBox,
  stationPoint
} from "@/components/office/workflows-plan";
import { CALENDAR_SLOTS } from "@/lib/calendar-feed-model";
import { PROJECT_COLOR, projectForKind } from "@/lib/office-walkthrough";
import type { WorkflowsSlot } from "@/lib/office-workflows-model";
import { buildTimeline } from "@/lib/office-workflows-timeline";

/**
 * How the plan frames one opened room.
 *
 * This is the arithmetic that broke the room view: the frame used to be the room's rect *grown to*
 * the container's aspect, so on any wide container the stretch decided the framing on its own. A
 * room 270 units wide sat in a frame 766 wide, took a third of the stage and left the rest to its
 * neighbours drawn at four times their scale. The rule below — size the frame from the room, not
 * from the container — is what these cases pin.
 */

/** The aspects the plan's own box actually takes, measured in the production build. */
const ASPECTS = {
  "1280x800": 1248 / 646,
  "1440x900": 1408 / 746,
  "1920x1080": 1888 / 926,
  "2560x1440": 2528 / 1286,
  /** Taller than it is wide: the frame has to bind on width instead. */
  portrait: 0.75
};

/** `minX minY width height`, as four numbers rather than four possibly-missing ones. */
function parse(viewBox: string): { minX: number; minY: number; width: number; height: number } {
  const parts = viewBox.split(" ").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error(`not a viewBox: ${viewBox}`);
  }
  const [minX = 0, minY = 0, width = 0, height = 0] = parts;
  return { minX, minY, width, height };
}

describe("roomViewBox", () => {
  it("keeps the frame at the container's aspect, so the drawing never letterboxes", () => {
    for (const [name, aspect] of Object.entries(ASPECTS)) {
      for (const room of ROOMS) {
        const { width, height } = parse(roomViewBox(room, aspect).viewBox);
        expect(width / height, `${room.key} at ${name}`).toBeCloseTo(aspect, 6);
      }
    }
  });

  it("centres the frame on the room, on both axes", () => {
    for (const aspect of Object.values(ASPECTS)) {
      for (const room of ROOMS) {
        const { minX, minY, width, height } = parse(roomViewBox(room, aspect).viewBox);
        expect(minX + width / 2).toBeCloseTo(room.x + room.width / 2, 6);
        expect(minY + height / 2).toBeCloseTo(room.y + room.height / 2, 6);
      }
    }
  });

  it("gives the room ROOM_FRAME_SPAN of the frame on whichever axis binds", () => {
    for (const [name, aspect] of Object.entries(ASPECTS)) {
      for (const room of ROOMS) {
        const { width, height } = parse(roomViewBox(room, aspect).viewBox);
        const binding = Math.max(room.width / width, room.height / height);
        expect(binding, `${room.key} at ${name}`).toBeCloseTo(ROOM_FRAME_SPAN, 6);
      }
    }
  });

  it("never lets a room fall under the 60% the repair set as its floor", () => {
    // The regression this file exists for is the opposite failure — a room framed so loosely that
    // its neighbours own the stage. 0.6 is the contract's floor; the span above sits over it.
    expect(ROOM_FRAME_SPAN).toBeGreaterThanOrEqual(0.6);
  });

  it("reports the room's own rect as an inset that agrees with the frame", () => {
    for (const aspect of Object.values(ASPECTS)) {
      for (const room of ROOMS) {
        const { viewBox, inset } = roomViewBox(room, aspect);
        const { minX, minY, width, height } = parse(viewBox);
        expect(Number.parseFloat(inset.left)).toBeCloseTo(((room.x - minX) / width) * 100, 6);
        expect(Number.parseFloat(inset.top)).toBeCloseTo(((room.y - minY) / height) * 100, 6);
        expect(Number.parseFloat(inset.width)).toBeCloseTo((room.width / width) * 100, 6);
        expect(Number.parseFloat(inset.height)).toBeCloseTo((room.height / height) * 100, 6);
      }
    }
  });

  it("frames a tall room without cropping it, which the stretch-to-aspect version did not", () => {
    // DNESKAi is 270 x 354 — the room the report was written against. At the laptop aspect the
    // old arithmetic gave it 87% of the frame's height and 35% of its width; the frame is now
    // sized from the room, so the room's share of its binding axis is the same at every aspect.
    const room = ROOMS.find((entry) => entry.key === "caught-up");
    if (!room) throw new Error("DNESKAi is not on the plan");
    const laptop = parse(roomViewBox(room, ASPECTS["1440x900"]).viewBox);
    const wide = parse(roomViewBox(room, ASPECTS["2560x1440"]).viewBox);
    expect(room.height / laptop.height).toBeCloseTo(ROOM_FRAME_SPAN, 6);
    expect(room.height / wide.height).toBeCloseTo(ROOM_FRAME_SPAN, 6);
    // And the room's own walls sit inside the frame with room to spare on both sides.
    expect(laptop.minY).toBeLessThan(room.y);
    expect(laptop.minY + laptop.height).toBeGreaterThan(room.y + room.height);
  });

  it("brings a top-rank room's door notes into frame", () => {
    // The notes hang in the corridor at y 458, just below the top rank's south wall at 454. The
    // old framing cut them in half; nothing about an opened room should be half-drawn.
    for (const key of ["company", "caught-up", "mma-files"] as const) {
      const room = ROOMS.find((entry) => entry.key === key);
      if (!room) throw new Error(`${key} is not on the plan`);
      const { minY, height } = parse(roomViewBox(room, ASPECTS["1280x800"]).viewBox);
      expect(minY + height, `${key} bottom edge`).toBeGreaterThan(478);
    }
  });

  it("stays inside the drawing for a room against the plan's own edge", () => {
    // Board HQ starts at x 200 and the plan is drawn from -80. A frame centred on it reaches west
    // of the drawing; that is empty plan, not a clipped room, and the room itself stays whole.
    const room = ROOMS.find((entry) => entry.key === "company");
    if (!room) throw new Error("Board HQ is not on the plan");
    const { minX, minY, width, height } = parse(roomViewBox(room, ASPECTS["2560x1440"]).viewBox);
    expect(minX).toBeLessThan(room.x);
    expect(minX + width).toBeGreaterThan(room.x + room.width);
    expect(minY).toBeLessThan(room.y);
    expect(minY + height).toBeGreaterThan(room.y + room.height);
  });

  it("binds on width when the container is taller than the room", () => {
    // Not a shape the section renders today, but the arithmetic has two branches and only one of
    // them is exercised by the desktop aspects above.
    const room = ROOMS.find((entry) => entry.key === "marketingshark");
    if (!room) throw new Error("marketingShark is not on the plan");
    const { width, height } = parse(roomViewBox(room, ASPECTS.portrait).viewBox);
    expect(room.width / width).toBeCloseTo(ROOM_FRAME_SPAN, 6);
    expect(room.height / height).toBeLessThanOrEqual(ROOM_FRAME_SPAN + 1e-9);
  });

  it("draws every room inside the plan it is framed from", () => {
    // A guard on the geometry itself rather than on the framing: a room outside these bounds
    // would frame correctly and still be undrawable.
    for (const room of ROOMS) {
      expect(room.x).toBeGreaterThanOrEqual(0);
      expect(room.y).toBeGreaterThanOrEqual(0);
      expect(room.x + room.width).toBeLessThanOrEqual(PLAN_WIDTH);
      expect(room.y + room.height).toBeLessThanOrEqual(PLAN_HEIGHT);
    }
  });
});

/**
 * The other half of "an envelope never teleports".
 *
 * The timeline guarantees a leg starts exactly when the one before it rested. These cases
 * guarantee it starts exactly *where* it rested — the two together are what make a journey a
 * journey rather than a sequence of unrelated animations (D10).
 */
describe("every journey joins up in space", () => {
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

  it("starts each leg exactly where the leg before it ended", () => {
    const byJourney = new Map<string, typeof timeline.legs>();
    timeline.legs.forEach((leg) => {
      byJourney.set(leg.journey, [...(byJourney.get(leg.journey) ?? []), leg]);
    });
    expect(byJourney.size).toBeGreaterThan(0);
    for (const [journey, journeyLegs] of byJourney) {
      const ordered = [...journeyLegs].sort((a, b) => a.index - b.index);
      ordered.forEach((leg, index) => {
        const from = legStart(leg, leg.room);
        const previous = ordered[index - 1];
        if (previous) {
          expect(from, `${journey} leg ${index}`).toEqual(stationPoint(previous.station, previous.room));
        }
      });
    }
  });

  it("gives every station a point, for every room that can reach it", () => {
    for (const leg of timeline.legs) {
      const from = legStart(leg, leg.room);
      const to = stationPoint(leg.station, leg.room);
      expect(Number.isFinite(from[0]) && Number.isFinite(from[1]), `${leg.id} start`).toBe(true);
      expect(Number.isFinite(to[0]) && Number.isFinite(to[1]), `${leg.id} end`).toBe(true);
      // A leg that goes nowhere would render as a still envelope for its whole duration.
      expect(from[0] !== to[0] || from[1] !== to[1], `${leg.id} moves`).toBe(true);
    }
  });

  it("sends each magazine's package to its own bay and its own address", () => {
    const dneskai = timeline.legs.filter((leg) => leg.room === "caught-up" && leg.station === "exit");
    const mma = timeline.legs.filter((leg) => leg.room === "mma-files" && leg.station === "exit");
    expect(dneskai.length).toBeGreaterThan(0);
    expect(mma.length).toBeGreaterThan(0);
    // The lower two bays sit opposite the two courier exits, and that is the dock's argument.
    expect(stationPoint("bay", "caught-up")).toEqual([1486, 660]);
    expect(stationPoint("bay", "mma-files")).toEqual([1486, 760]);
    expect(stationPoint("exit", "caught-up")).toEqual([1656, 660]);
    expect(stationPoint("exit", "mma-files")).toEqual([1656, 760]);
  });

  it("runs GoVIRAL's three bands down one straight line at x 685", () => {
    for (const station of ["spine-west", "goviral-arrival", "goviral-prep", "goviral-launch", "platforms"] as const) {
      expect(stationPoint(station, "caught-up")[0], station).toBe(685);
    }
  });
});
