import { describe, expect, it } from "vitest";
import {
  legStart,
  stationPoint
} from "@/components/office/workflows-plan";
import { CALENDAR_SLOTS } from "@/lib/calendar-feed-model";
import { PROJECT_COLOR, projectForKind } from "@/lib/office-walkthrough";
import type { WorkflowsSlot } from "@/lib/office-workflows-model";
import { buildTimeline } from "@/lib/office-workflows-timeline";

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
