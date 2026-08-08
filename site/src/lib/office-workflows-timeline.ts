import type { OfficeProjectKey } from "@/lib/office-walkthrough";
import type { WorkflowsSlot } from "@/lib/office-workflows-model";

/**
 * The day's performance, as a sequence of numbers.
 *
 * Given the standing day — every slot the registry holds, in hour order — this returns when each
 * beat rises, holds and closes, what leaves each room when it does, and how long the whole thing
 * takes. Nothing here knows about SVG, timers, or the browser: the component reads the sequence
 * and CSS does the moving, which is what keeps the choreography testable.
 *
 * It is deliberately not keyed to today. The performance plays the *standing* day, the same on
 * every visit (D2); today's truth shows through the note that hangs as each beat closes, which the
 * component takes from `slot.note` and this file never touches.
 */

/* ---- pacing ------------------------------------------------------------------ */

/** The floor step, before the tag. */
export const BEAT_RISE_MS = 260;
/** How long a beat is readable. The contract's range is 1.4–1.7s and its floor is 1.2s. */
export const BEAT_HOLD_MS = 1700;
/** The floor falling back to its accumulated-day state, which overlaps the next beat's rise. */
export const BEAT_FALL_MS = 420;
/** Beat to beat. The fall overlaps the beat that follows, the way the real day pipelines. */
export const BEAT_STRIDE_MS = BEAT_RISE_MS + BEAT_HOLD_MS;

/** Within a room, or a door to the spine. */
export const LEG_SHORT_MS = 1300;
/** The chase, a corridor run, a courier exit. */
export const LEG_LONG_MS = 2600;
/** Between a beat closing and its first leg leaving. */
export const LEG_GAP_MS = 200;
/** A room sending two journeys does not send them abreast. */
export const JOURNEY_STAGGER_MS = 600;

/** The finished picture holds, then dissolves (D6). */
export const END_HOLD_MS = 1000;
export const DISSOLVE_MS = 600;

/* ---- what travels ------------------------------------------------------------ */

/**
 * The stations a traveller passes through, named rather than numbered.
 *
 * The component maps each to a pair of plan coordinates; this file only decides the order and the
 * timing. A leg is *always* one station to the next, so a journey can never skip one or arrive
 * before the leg before it has rested (D10).
 */
export type TravelStation =
  | "door"
  | "corridor"
  | "chase"
  | "lab"
  | "bench"
  | "bay"
  | "exit"
  | "spine-west"
  | "goviral-arrival"
  | "goviral-prep"
  | "goviral-launch"
  | "platforms"
  | "shared-wall"
  | "collect-lane"
  | "green-line";

/** What a traveller *is*. Two of these are signals rather than parcels, and keep their own shape. */
export type TravelKind = "envelope" | "slip" | "pulse";

export interface TravelLeg {
  /** Stable across renders, so a keyframe is never restarted by a re-key. */
  id: string;
  journey: string;
  kind: TravelKind;
  /** The producing venture. The envelope's fill, and the only thing that says whose work it is. */
  room: OfficeProjectKey;
  color: string;
  station: TravelStation;
  /** Which leg of its journey this is, from 0. */
  index: number;
  /** True on the last leg, which fades at its far end rather than stopping. */
  last: boolean;
  startsAt: number;
  duration: number;
}

interface JourneyShape {
  kind: TravelKind;
  stations: ReadonlyArray<readonly [TravelStation, number]>;
}

/**
 * The six journeys, exactly as the design spec's §6.6 table draws them.
 *
 * `press` and `social` are the two halves of D11's pipeline: everything that produces an article
 * sends one envelope to an address and one through the Design Lab to GoVIRAL and out toward the
 * platforms.
 */
const JOURNEYS: Record<string, JourneyShape> = {
  /** The board commissions; it does not ship. Its envelope fades east along the corridor. */
  summary: {
    kind: "envelope",
    stations: [
      ["door", LEG_SHORT_MS],
      ["corridor", LEG_LONG_MS]
    ]
  },
  /** Through the Design Lab to the bench, a bay, and out the courier exit to its magazine. */
  press: {
    kind: "envelope",
    stations: [
      ["chase", LEG_LONG_MS],
      ["lab", LEG_SHORT_MS],
      ["bench", LEG_SHORT_MS],
      ["bay", LEG_SHORT_MS],
      ["exit", LEG_LONG_MS]
    ]
  },
  /** Through the Design Lab, west to GoVIRAL, through its three bands, out its edge. */
  social: {
    kind: "envelope",
    stations: [
      ["chase", LEG_LONG_MS],
      ["lab", LEG_SHORT_MS],
      ["spine-west", LEG_LONG_MS],
      ["goviral-arrival", LEG_SHORT_MS],
      ["goviral-prep", LEG_SHORT_MS],
      ["goviral-launch", LEG_SHORT_MS],
      ["platforms", LEG_LONG_MS]
    ]
  },
  /** FightAIQ's records, through the one door it has, into the desk that uses them. */
  slip: { kind: "slip", stations: [["shared-wall", LEG_SHORT_MS]] },
  /** Titty Tuesdays pulls. Nothing is delivered to it, and nothing reaches its bay. */
  collect: { kind: "pulse", stations: [["collect-lane", 900]] },
  /** A signal is not a parcel: GoVIRAL's Monday trend, along the green line. */
  pulse: { kind: "pulse", stations: [["green-line", 1600]] }
};

/**
 * Which journeys a slot sends, by the kind the registry gave it.
 *
 * Checked against `CALENDAR_SLOTS` and `projectForKind`, not against the contract's table alone:
 * the table names rooms, and a room's slots do not all produce the same thing. A slot that meets
 * and decides — the product room, the story meeting, the evening desk review — lights, tags and
 * hangs its note, and sends nothing. Inventing a package for it would be inventing a record.
 */
const SLOT_JOURNEYS: Record<string, readonly string[]> = {
  "venture-morning": ["summary"],
  "venture-afternoon": ["summary"],
  "venture-night": ["summary"],
  "cu-edition": ["press", "social"],
  "article-am": ["press", "social"],
  "article-pm": ["press", "social"],
  "ms-daily": ["social", "social"],
  "mma-intake": ["slip"],
  "mma-analysis": ["slip"],
  "tt-marketing": ["collect"],
  "gv-brief": ["pulse"]
};

/* ---- the sequence ------------------------------------------------------------ */

export interface Beat {
  index: number;
  hour: number;
  /** `publicKindLabel`, exactly as the calendar prints it. Never reformatted (D2, D3). */
  label: string;
  kind: string;
  room: OfficeProjectKey;
  color: string;
  /** The tag the room shows while this beat is live (D3). */
  tag: string;
  startsAt: number;
  /** When the floor has finished rising and the beat is readable. */
  readableAt: number;
  /** When the note hangs and the floor starts falling. */
  closesAt: number;
  legs: TravelLeg[];
}

export interface Timeline {
  beats: Beat[];
  /** Every leg of every journey, in start order. */
  legs: TravelLeg[];
  /** When the last leg comes to rest. */
  restsAt: number;
  /** The whole performance, including the end-of-day hold and the dissolve. */
  duration: number;
}

/** `HH:00 · label` — the calendar's own hour and the registry's own words. */
export function beatTag(hour: number, label: string): string {
  return `${String(hour).padStart(2, "0")}:00 · ${label}`;
}

/**
 * Build the performance from the standing day.
 *
 * Beats run in hour order at a fixed stride, and each beat's journeys leave as it closes and
 * overlap the beats that follow — the board commissions at 06:00 and what it commissioned is
 * still crossing the floor at 09:00.
 */
export function buildTimeline(slots: readonly WorkflowsSlot[]): Timeline {
  const ordered = [...slots].sort((a, b) => a.hour - b.hour);
  const legs: TravelLeg[] = [];

  const beats = ordered.map((slot, index) => {
    const startsAt = index * BEAT_STRIDE_MS;
    const closesAt = startsAt + BEAT_RISE_MS + BEAT_HOLD_MS;
    const beatLegs: TravelLeg[] = [];

    (SLOT_JOURNEYS[slot.kind] ?? []).forEach((name, journeyIndex) => {
      const shape = JOURNEYS[name];
      if (!shape) return;
      const journey = `${slot.kind}-${slot.hour}-${name}-${journeyIndex}`;
      let at = closesAt + LEG_GAP_MS + journeyIndex * JOURNEY_STAGGER_MS;
      shape.stations.forEach(([station, duration], stationIndex) => {
        beatLegs.push({
          id: `${journey}-${station}-${stationIndex}`,
          journey,
          kind: shape.kind,
          room: slot.room,
          color: slot.color,
          station,
          index: stationIndex,
          last: stationIndex === shape.stations.length - 1,
          startsAt: at,
          duration
        });
        // The next leg begins exactly where this one rests. No overlap inside a journey: an
        // envelope that started its next leg early would be in two places at once (D10).
        at += duration;
      });
    });

    legs.push(...beatLegs);
    return {
      index,
      hour: slot.hour,
      label: slot.label,
      kind: slot.kind,
      room: slot.room,
      color: slot.color,
      tag: beatTag(slot.hour, slot.label),
      startsAt,
      readableAt: startsAt + BEAT_RISE_MS,
      closesAt,
      legs: beatLegs
    };
  });

  legs.sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id));

  const lastBeatRests = beats.length === 0
    ? 0
    : Math.max(...beats.map((beat) => beat.closesAt + BEAT_FALL_MS));
  const lastLegRests = legs.reduce((latest, leg) => Math.max(latest, leg.startsAt + leg.duration), 0);
  const restsAt = Math.max(lastBeatRests, lastLegRests);

  return { beats, legs, restsAt, duration: restsAt + END_HOLD_MS + DISSOLVE_MS };
}

/** Which beat is live at `elapsed`, or `null` before the first and after the last has closed. */
export function beatAt(timeline: Timeline, elapsed: number): Beat | null {
  for (let index = timeline.beats.length - 1; index >= 0; index -= 1) {
    const beat = timeline.beats[index];
    if (beat && elapsed >= beat.startsAt && elapsed < beat.closesAt) return beat;
  }
  return null;
}

/**
 * The notes hanging at `elapsed`, index-aligned with the slots as they were given.
 *
 * A beat's note hangs when it closes and stays for the rest of the performance, so the last frame
 * is the finished day — which is the same picture ambient shows at 22:00.
 */
export function notesAt(
  timeline: Timeline,
  slots: readonly WorkflowsSlot[],
  elapsed: number
): WorkflowsSlot["note"][] {
  const closed = new Set(
    timeline.beats.filter((beat) => elapsed >= beat.closesAt).map((beat) => `${beat.kind}-${beat.hour}`)
  );
  return slots.map((slot) => (closed.has(`${slot.kind}-${slot.hour}`) ? slot.note : "none"));
}

/** Every leg in flight at `elapsed`. Empty before the first beat closes and after the last rests. */
export function legsAt(timeline: Timeline, elapsed: number): TravelLeg[] {
  return timeline.legs.filter(
    (leg) => elapsed >= leg.startsAt && elapsed < leg.startsAt + leg.duration
  );
}

/**
 * Reduced motion advances beat by beat rather than by the clock, so there is no interpolation to
 * suppress: this is the elapsed time that puts beat `index` in the middle of its hold.
 */
export function elapsedForBeat(timeline: Timeline, index: number): number {
  const beat = timeline.beats[index];
  return beat ? beat.readableAt + 1 : 0;
}
