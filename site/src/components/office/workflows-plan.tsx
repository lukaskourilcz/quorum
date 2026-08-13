"use client";

import type { CSSProperties, ReactNode } from "react";
import type { OfficeProjectKey } from "@/lib/office-walkthrough";
import type {
  WorkflowsNoteKind,
  WorkflowsRoom,
  WorkflowsSlot
} from "@/lib/office-workflows-model";
import type { TravelLeg, TravelStation } from "@/lib/office-workflows-timeline";

/**
 * The floor plan: one office from above, drawn as a single inline SVG.
 *
 * Every coordinate here is a plan unit inside a 2520 × 940 viewBox and is transcribed from the
 * design specification rather than derived. The drawing carries the argument on its own, because
 * there is no legend anywhere on the board to look a mark up in: every room has exactly one door,
 * every door opens onto the same spine, the spine runs east into the roller door and the dock,
 * and the two edges that behave differently show why by their geometry rather than by a caption.
 *
 * Three states, and a reader learns them by looking at the building. A dark room is the darkest
 * floor with one thin partition. A lit room is a floor three to five times brighter carrying a
 * heavy contour in its own hue. The workshop is a mid floor with the only disc on the plan, and
 * it is never dark, because its machinery is always available.
 */

export const PLAN_WIDTH = 2520;
export const PLAN_HEIGHT = 940;
export const PLAN_FLOOR_MARGIN = 80;

/**
 * How much empty plan sits either side of the drawing.
 *
 * The off-plan addresses run to within a few units of the drawing's own bounds, so at the board's
 * width they touched its border and read as clipped. This is margin in plan units rather than
 * padding on the card, which keeps the geometry below transcribable exactly as specified.
 */
const PLAN_LEFT = -680;
const PLAN_RIGHT = PLAN_LEFT + PLAN_WIDTH;

/**
 * How much of the frame the open room claims on whichever of its axes binds first.
 *
 * The remaining fifth is the breathing room, split evenly. A top-rank room framed this way carries
 * its own north wall, its door and the notes hanging at that door, instead of ending half a unit
 * past the wall with the notes cropped off the bottom edge — which is what 0.87, the fraction the
 * old stretch happened to produce, did. Lower than this and the room stops being the subject: at
 * 0.7 Board HQ's roster needed 220px of scroll on a laptop that had shown it whole.
 */


/** The four places that open. Everything else on the plan is drawn and not pressed. */
/** The dock is not a room; every other place on the plan is one. */
export type PlanPlace = OfficeProjectKey | "dock";

export interface RoomGeometry {
  key: OfficeProjectKey;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where the room's name sits, clear of its furniture. */
  labelY: number;
  /** The door's span on the spine, and which rank the room is in. */
  door: { from: number; to: number; rank: "top" | "bottom" } | { from: number; to: number; rank: "side"; x: number } | null;
  /** The numeral the sub-1024px key indexes this room by. */
  numeral: number;
}

/** Plan order: the top rank west to east, then the bottom rank west to east. */
export const ROOMS: readonly RoomGeometry[] = [
  { key: "booksofhistory", x: -520, y: 100, width: 640, height: 190, labelY: 146, door: { from: 165, to: 225, rank: "side", x: 120 }, numeral: 9 },
  { key: "door-money", x: -520, y: 290, width: 640, height: 190, labelY: 336, door: { from: 355, to: 415, rank: "side", x: 120 }, numeral: 10 },
  { key: "tehdejsi-svet", x: -520, y: 480, width: 640, height: 190, labelY: 526, door: { from: 545, to: 605, rank: "side", x: 120 }, numeral: 11 },
  { key: "kvorum", x: -520, y: 670, width: 640, height: 190, labelY: 716, door: { from: 735, to: 795, rank: "side", x: 120 }, numeral: 12 },
  { key: "company", x: 200, y: 100, width: 360, height: 354, labelY: 146, door: { from: 440, to: 500, rank: "top" }, numeral: 1 },
  { key: "caught-up", x: 560, y: 100, width: 270, height: 354, labelY: 146, door: { from: 665, to: 725, rank: "top" }, numeral: 2 },
  { key: "mma-files", x: 830, y: 100, width: 260, height: 354, labelY: 146, door: { from: 930, to: 990, rank: "top" }, numeral: 3 },
  // The records room fronts the corridor and cannot reach it: its only door is in the shared wall
  // and opens into the desk that uses its files. That asymmetry needs no caption.
  { key: "fightaiq", x: 1090, y: 100, width: 150, height: 354, labelY: 146, door: null, numeral: 4 },
  { key: "carousel-studio", x: 1240, y: 100, width: 320, height: 354, labelY: 146, door: null, numeral: 5 },
  { key: "marketingshark", x: 200, y: 524, width: 340, height: 336, labelY: 570, door: { from: 340, to: 400, rank: "bottom" }, numeral: 6 },
  // GoVIRAL is a station, not a room that meets once a week: envelopes arrive from the Design Lab,
  // are prepared, and leave toward the platforms. At 170 units an envelope entering it vanished.
  // The 120 it gained came from marketingShark's 20 and 100 off the dock apron's west end, which
  // held nothing but hatch — the bays, the courier exits and the roller door did not move.
  { key: "goviral", x: 540, y: 524, width: 290, height: 336, labelY: 570, door: { from: 655, to: 715, rank: "bottom" }, numeral: 7 },
  { key: "titty-tuesdays", x: 830, y: 524, width: 270, height: 336, labelY: 570, door: { from: 935, to: 995, rank: "bottom" }, numeral: 8 }
];

/**
 * Where each room's notes hang, in the corridor at its own door.
 *
 * A room with more than one sitting stacks east at 38-unit intervals, one anchor per slot, so the
 * day accumulates along the wall in the order it happened. FightAIQ's hang inside MMA Files
 * beside the shared door, because that is where its door is.
 */
const NOTE_ANCHORS: Record<string, { xs: number[]; y: number; stem: "down" | "up" | "side" }> = {
  company: { xs: [508, 546, 584], y: 458, stem: "down" },
  "caught-up": { xs: [733, 771], y: 458, stem: "down" },
  "mma-files": { xs: [998, 1036, 1074], y: 458, stem: "down" },
  fightaiq: { xs: [1017, 1055], y: 206, stem: "side" },
  marketingshark: { xs: [370], y: 500, stem: "up" },
  goviral: { xs: [685], y: 500, stem: "up" },
  "titty-tuesdays": { xs: [965], y: 500, stem: "up" },
  booksofhistory: { xs: [150], y: 185, stem: "side" },
  "door-money": { xs: [150, 190], y: 375, stem: "side" },
  "tehdejsi-svet": { xs: [150], y: 565, stem: "side" },
  kvorum: { xs: [150], y: 755, stem: "side" }
};

/** The venture hue at 14% over the room floor, given opaque so it can be measured. */
const LIT_FILL: Record<OfficeProjectKey, string> = {
  company: "#30190f",
  "caught-up": "#30162f",
  "mma-files": "#2f2430",
  fightaiq: "#30282c",
  goviral: "#262f2d",
  marketingshark: "#232a32",
  "titty-tuesdays": "#2f2c23",
  booksofhistory: "#292832",
  "door-money": "#292832",
  "tehdejsi-svet": "#2c211f",
  kvorum: "#302f20",
  "carousel-studio": "#2a2a2e"
};

/**
 * The same hue at 28% — the room whose beat is live (D4).
 *
 * Twice the lit ratio, so a room steps up visibly when its beat begins and falls back to the
 * accumulated-day state, not to dark, when it ends. Composited to opaque here for the same reason
 * `LIT_FILL` is: an alpha layer cannot be measured, and every one of these is measured against
 * `#f4f4f5` in the spec's §6.5 ledger, worst pair 7.88:1.
 *
 * The step is honestly weaker on the two darkest hues — Board HQ and DNESKAi move by 1.27 and 1.28
 * in luminance against 1.5–1.6 for the rest. That is why a beat never carries brightness alone:
 * the tag arrives with it, and the note hangs when it ends.
 */
const ACTIVE_FILL: Record<OfficeProjectKey, string> = {
  company: "#51230d",
  "caught-up": "#511d4c",
  "mma-files": "#4f394e",
  fightaiq: "#514346",
  goviral: "#3e4f47",
  marketingshark: "#384751",
  "titty-tuesdays": "#514a34",
  booksofhistory: "#464154",
  "door-money": "#464154",
  "tehdejsi-svet": "#4b3029",
  kvorum: "#504c24",
  "carousel-studio": "#454549"
};

const FLOOR_DARK = "#0e0e12";
const FLOOR_CORRIDOR = "#121216";
const FLOOR_WORKSHOP = "#1c1c20";
const WALL_OUTER = "#a1a1aa";
const WALL_INNER = "#94949c";
const FURNITURE = "#6c6c73";
const MACHINE = "#9d9da1";

const MONO = "var(--font-ibm-plex-mono), monospace";

const E1 = "cubic-bezier(.22,.61,.36,1)";
const E2 = "cubic-bezier(.2,.8,.3,1.2)";

/** An entrance animation, written so the element's resting value is also its end state. */
function entrance(name: string, duration: number, delay: number, easing: string): CSSProperties {
  return { animation: `${name} ${duration}ms ${easing} ${delay}ms backwards` };
}

function Label({
  children,
  x,
  y,
  size,
  weight = 500,
  tracking = ".12em",
  fill,
  anchor = "middle",
  style
}: {
  children: ReactNode;
  x: number;
  y: number;
  size: number;
  weight?: number;
  tracking?: string;
  fill: string;
  anchor?: "start" | "middle" | "end";
  style?: CSSProperties;
}) {
  return (
    <text
      fill={fill}
      fontFamily={MONO}
      fontSize={size}
      fontWeight={weight}
      letterSpacing={tracking}
      style={style}
      textAnchor={anchor}
      x={x}
      y={y}
    >
      {children}
    </text>
  );
}

/**
 * One door note.
 *
 * Both marks share one silhouette because both are the same kind of made thing — a record a
 * session wrote — and differ only by fill. A missed slot hangs no tag at all: an empty clip,
 * drawn at a weight that clears the graphics floor, because the difference between "missed" and
 * "not yet" has to be visible rather than merely present.
 */
function DoorNote({
  note,
  x,
  y,
  stem,
  color,
  animate,
  index
}: {
  note: WorkflowsNoteKind;
  x: number;
  y: number;
  stem: "down" | "up" | "side";
  color: string;
  animate: boolean;
  index: number;
}) {
  if (note === "none") return null;
  const left = x - 15;
  const style: CSSProperties = {
    transformBox: "fill-box",
    transformOrigin: "center",
    ...(animate ? entrance("wf-pop", 220, 900 + index * 60, E2) : {})
  };
  const stemPath = stem === "down"
    ? `M${x} 454 V${y}`
    : stem === "up"
      ? `M${x} 524 V${y + 20}`
      : `M${left + 30} ${y + 10} H${left + 42}`;
  return (
    <g data-wf-note style={style}>
      <path
        d={stemPath}
        stroke={note === "missed" || note === "waiting" ? WALL_INNER : color}
        strokeOpacity={note === "missed" || note === "waiting" ? 1 : 0.8}
        strokeWidth={1.4}
      />
      {note === "sent" ? (
        <rect fill={color} height={20} rx={3} width={30} x={left} y={y} />
      ) : note === "quiet" ? (
        <>
          <rect fill={FLOOR_DARK} height={20} rx={3} stroke={color} strokeWidth={1.75} width={30} x={left} y={y} />
          <path d={`M${left + 6} ${y + 10} H${left + 24}`} stroke={color} strokeWidth={1.5} />
        </>
      ) : (
        <>
          {/* The waiting band is the same grace glyph the replay draws, so a reader learns it once. */}
          {note === "waiting" ? (
            <path
              d={`M${left + 12} ${y - 4} A 12 12 0 0 1 ${left + 12} ${y + 24}`}
              fill="none"
              stroke={WALL_INNER}
              strokeWidth={1.5}
            />
          ) : null}
          <path
            d={`M${left + 12} ${y} H${left} V${y + 14} H${left + 12}`}
            fill="none"
            stroke={WALL_INNER}
            strokeWidth={1.6}
          />
        </>
      )}
    </g>
  );
}

/* ---- what travels, and where ------------------------------------------------- */

/** Where each room meets the spine, and where its own middle is. */
const ROOM_ANCHOR: Record<OfficeProjectKey, { door: [number, number]; centre: [number, number] }> = {
  company: { door: [470, 489], centre: [380, 277] },
  "caught-up": { door: [695, 489], centre: [695, 277] },
  "mma-files": { door: [960, 489], centre: [960, 277] },
  // The records room's only door is in the shared wall, and its slip is the only thing that uses it.
  fightaiq: { door: [1165, 270], centre: [1165, 270] },
  // The Design Lab has no corridor door. Its opening is the roller door, centred at 1420.
  "carousel-studio": { door: [1420, 489], centre: [1400, 300] },
  marketingshark: { door: [370, 489], centre: [370, 692] },
  goviral: { door: [685, 489], centre: [685, 692] },
  "titty-tuesdays": { door: [965, 489], centre: [965, 692] },
  booksofhistory: { door: [120, 195], centre: [-200, 195] },
  "door-money": { door: [120, 385], centre: [-200, 385] },
  "tehdejsi-svet": { door: [120, 575], centre: [-200, 575] },
  kvorum: { door: [120, 765], centre: [-200, 765] }
};

/** The bay and the courier arrow each magazine's package uses. Nothing else has one. */
const COURIER_LANE: Partial<Record<OfficeProjectKey, { bay: [number, number]; address: [number, number] }>> = {
  "caught-up": { bay: [1486, 660], address: [1656, 660] },
  "mma-files": { bay: [1486, 760], address: [1656, 760] }
};

/**
 * Where a leg ends, given the room that sent it.
 *
 * A leg is always one station to the next and the timeline guarantees it starts exactly when the
 * one before it rested; this map is the other half of that promise — it guarantees it starts
 * exactly *where* the one before it rested, so nothing teleports and nothing skips (D10).
 */
export function stationPoint(station: TravelStation, room: OfficeProjectKey): [number, number] {
  const anchor = ROOM_ANCHOR[room];
  const lane = COURIER_LANE[room];
  switch (station) {
    case "door": return anchor.door;
    // The board's summary fades along the corridor rather than reaching an edge.
    case "corridor": return [1000, 489];
    // The chase's east node, where it meets the Design Lab.
    case "chase": return [1420, 484];
    case "lab": return [1400, 300];
    case "bench": return [1199, 605];
    case "bay": return lane?.bay ?? [1486, 660];
    case "exit": return lane?.address ?? [1656, 660];
    // West along the spine to GoVIRAL's door, then straight down through its three bands.
    case "spine-west": return [685, 489];
    case "goviral-arrival": return [685, 580];
    case "goviral-prep": return [685, 692];
    case "goviral-launch": return [685, 804];
    case "platforms": return [685, 902];
    case "shared-wall": return [1020, 270];
    case "collect-lane": return [1114, 566];
    case "green-line": return [964, 494];
  }
}

/** Where a leg starts: the station before it, or the room itself for the first leg. */
export function legStart(leg: TravelLeg, room: OfficeProjectKey): [number, number] {
  if (leg.index > 0) return stationPoint(PREVIOUS_STATION[leg.station] ?? "door", room);
  switch (leg.station) {
    case "door": return ROOM_ANCHOR[room].centre;
    case "chase": return ROOM_ANCHOR[room].door;
    case "shared-wall": return ROOM_ANCHOR.fightaiq.door;
    case "collect-lane": return [1408, 566];
    case "green-line": return [685, 494];
    default: return ROOM_ANCHOR[room].centre;
  }
}

/** Each station's predecessor inside its journey. Journeys never branch, so one map covers all. */
const PREVIOUS_STATION: Partial<Record<TravelStation, TravelStation>> = {
  corridor: "door",
  lab: "chase",
  bench: "lab",
  bay: "bench",
  exit: "bay",
  "spine-west": "lab",
  "goviral-arrival": "spine-west",
  "goviral-prep": "goviral-arrival",
  "goviral-launch": "goviral-prep",
  platforms: "goviral-launch"
};

/**
 * One traveller, mid-leg.
 *
 * The glyph is drawn at the leg's start and translated to its end by a CSS keyframe — transforms
 * and opacity only, no per-frame JavaScript and no `will-change`. The keyframe is generated per
 * leg because its distance is per leg; that is one small `<style>` per traveller in flight, and
 * there are never more than a handful.
 *
 * One envelope silhouette for the whole plan, and the fill is what says whose work it is (D10).
 * Two exceptions keep their own vocabulary because neither is a parcel: FightAIQ's record slip
 * has no flap, and GoVIRAL's trend pulse has no glyph at all — the green line's own dashes carry
 * it, which is the difference between a signal and a package drawn rather than captioned.
 */
function Traveller({ leg }: { leg: TravelLeg }) {
  if (leg.kind === "pulse") return null;
  const [x0, y0] = legStart(leg, leg.room);
  const [x1, y1] = stationPoint(leg.station, leg.room);
  const name = `wf-travel-${leg.id.replace(/[^a-z0-9]/gi, "-")}`;
  const slip = leg.kind === "slip";
  return (
    <g style={{ pointerEvents: "none" }}>
      <style>{
        `@keyframes ${name}{from{transform:translate(0px,0px)}` +
        `to{transform:translate(${(x1 - x0).toFixed(1)}px,${(y1 - y0).toFixed(1)}px)}}`
      }</style>
      <g
        style={{
          animation: `${name} ${leg.duration}ms linear both`
            + (leg.last ? `, wf-fade-out 320ms linear ${leg.duration - 320}ms both` : "")
        }}
      >
        {slip ? (
          <rect fill="#fecaca" height={14} rx={1} width={20} x={x0 - 10} y={y0 - 7} />
        ) : (
          <>
            <rect fill={leg.color} height={18} rx={2} width={26} x={x0 - 13} y={y0 - 9} />
            <path
              d={`M${x0 - 13} ${y0 - 9} L${x0} ${y0} L${x0 + 13} ${y0 - 9}`}
              fill="none"
              stroke={FLOOR_DARK}
              strokeWidth={1.4}
            />
          </>
        )}
      </g>
    </g>
  );
}

/** The two-rect ring every SVG target carries, revealed by `:focus-visible` in the stylesheet. */
function FocusRing({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return (
    <g data-wf-ring style={{ transition: "opacity 140ms ease-out" }}>
      <rect fill="none" height={height + 10} stroke="#09090b" strokeWidth={2} width={width + 10} x={x - 5} y={y - 5} />
      <rect
        fill="none"
        height={height + 16}
        stroke="var(--bai-accent)"
        strokeWidth={3}
        width={width + 16}
        x={x - 8}
        y={y - 8}
      />
    </g>
  );
}

export function WorkflowsPlan({
  rooms,
  slots,
  notes,
  litRoom,
  beat,
  legs,
  workshopWorking,
  mode,
  compact,
  animate,
  fill,
  onOpen,
  viewBox,
  inert = false
}: {
  rooms: readonly WorkflowsRoom[];
  slots: readonly WorkflowsSlot[];
  /** One note kind per slot, index-aligned with `slots`. The replay hands a shorter day. */
  notes: readonly WorkflowsNoteKind[];
  litRoom: OfficeProjectKey | null;
  /** Crop the drawing to a rectangle of the plan's own coordinates. Whole floor when absent. */
  viewBox?: string;
  /** Draw it as a picture: no pressable places, no accessible name, out of the tab order. */
  inert?: boolean;
  /**
   * The beat that is live, while the day performs (D3, D4).
   *
   * `room` takes the active fill and `tag` is drawn beneath that room's name — `HH:00 · label`,
   * the registry's own hour and the registry's own words. Null at rest and between beats.
   */
  beat: { room: OfficeProjectKey; tag: string } | null;
  /** Every leg in flight right now (D5, D10). Empty at rest and between journeys. */
  legs: readonly TravelLeg[];
  workshopWorking: boolean;
  mode: "ambient" | "replay";
  /** Below 1024px the labels leave the drawing and each place carries a numeral instead. */
  compact: boolean;
  animate: boolean;
  /** Fit the drawing to its box rather than to its own height. Above 1024px only. */
  fill: boolean;
  /** The room the plan is framing, if any: the same walls, closer in. */
  onOpen: (place: PlanPlace) => void;
}) {
  const byKey = new Map(rooms.map((room) => [room.key, room]));
  const noteFor = (slot: WorkflowsSlot) => notes[slots.indexOf(slot)] ?? "none";

  /*
   * Occupancy, derived from what is actually inside a station rather than from the hour.
   *
   * The Design Lab brightens while envelopes are in it and its disc turns; GoVIRAL's bands light
   * the same way as one passes through; the chase's dashes march only while something rides them.
   * Ambient keeps its own `workshopWorking` rule, which is the hour check — the two never both
   * apply, because ambient has no legs.
   */
  const occupied = new Set(legs.map((leg) => leg.station));
  const labBusy = occupied.has("lab") || occupied.has("chase") || occupied.has("bench");
  const chaseBusy = occupied.has("chase");
  const signalBusy = legs.some((leg) => leg.station === "green-line");
  const collectBusy = legs.some((leg) => leg.station === "collect-lane");
  const bandBusy = (station: TravelStation) => occupied.has(station);

  /*
   * The attributes that make a place pressable, or nothing at all.
   *
   * `inert` draws the same plan as a picture. The room dialog shows a crop of this drawing, and a
   * crop with four operable places inside it would put buttons behind a modal's own controls,
   * duplicate every `data-wf-place` in the document, and fail axe on nested interactive content.
   */
  const press = (place: PlanPlace) => inert ? {} : ({
    "data-wf-target": true,
    // The panel returns focus to the door it came out of, and this is how it finds it again.
    "data-wf-place": place,
    onClick: () => onOpen(place),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(place);
      }
    },
    role: "button" as const,
    style: { cursor: "pointer" },
    tabIndex: 0
  });

  /*
   * `role="group"`, not `role="img"`.
   *
   * The specification asks for `role="img"`, and that is right for a plan nobody can press. This
   * one holds four real buttons, and an element declared as a single graphic may not contain
   * focusable descendants — axe fails the whole page on `nested-interactive`, and a screen reader
   * would announce a picture whose contents cannot be reached. A labelled group is the honest
   * description of an interactive drawing: one named region with four operable places inside it.
   */
  return (
    <svg
      aria-hidden={inert ? true : undefined}
      aria-label={inert ? undefined : "Floor plan of the BoardlessAI office"}
      role={inert ? "presentation" : "group"}
      preserveAspectRatio="xMidYMid meet"
      style={fill
        ? { display: "block", width: "100%", height: "100%" }
        : { display: "block", width: "100%", height: "auto" }}
      viewBox={viewBox ?? `${PLAN_LEFT} 0 ${PLAN_WIDTH} ${PLAN_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern height={14} id="wf-apron" patternTransform="rotate(45)" patternUnits="userSpaceOnUse" width={14}>
          <rect fill="#0c0c0f" height={14} width={14} />
          <path d="M0 0 V14" stroke="#1d1d23" strokeWidth={1.6} />
        </pattern>
        <pattern height={8} id="wf-shutter" patternTransform="rotate(45)" patternUnits="userSpaceOnUse" width={8}>
          <path d="M0 0 V8" stroke={WALL_INNER} strokeWidth={1.2} />
        </pattern>
        <radialGradient id="wf-halo">
          <stop offset="0" stopColor="currentColor" stopOpacity={0.55} />
          <stop offset="0.6" stopColor="currentColor" stopOpacity={0.16} />
          <stop offset="1" stopColor="currentColor" stopOpacity={0} />
        </radialGradient>
        {["#d4d4d8", WALL_INNER, "#fde68a", "#bbf7d0"].map((colour) => (
          <marker
            id={`wf-arrow-${colour.slice(1)}`}
            key={colour}
            markerHeight={8}
            markerWidth={9}
            orient="auto"
            refX={8}
            refY={4}
          >
            <path d="M0 0 L9 4 L0 8 Z" fill={colour} />
          </marker>
        ))}
      </defs>

      {/* ---- floors, and the halo behind the lit room ------------------------ */}

      <g style={animate ? entrance("wf-fade", 300, 420, "linear") : undefined}>
        {ROOMS.map((geometry) => {
          const lit = litRoom === geometry.key;
          const workshop = geometry.key === "carousel-studio";
          // The beat's own room outranks every other state: it is the one thing happening now.
          const fill = beat?.room === geometry.key
            ? ACTIVE_FILL[geometry.key]
            : workshop
              ? (labBusy || workshopWorking ? LIT_FILL["carousel-studio"] : FLOOR_WORKSHOP)
              : lit
                ? LIT_FILL[geometry.key]
                : FLOOR_DARK;
          return (
            <rect
              fill={fill}
              height={geometry.height}
              key={geometry.key}
              style={{
                // The ambient crossfade is a slow hour changing. A beat is not: it rises in 260ms
                // and falls in 420ms, which is what makes the step read as *now* inside a stride
                // of under two seconds.
                transition: `fill ${beat?.room === geometry.key ? 260 : mode === "replay" ? 420 : 900}ms ease`
              }}
              width={geometry.width}
              x={geometry.x}
              y={geometry.y}
            />
          );
        })}
        <path d="M200 454 H1560 V524 H200 Z" fill={FLOOR_CORRIDOR} />
        <rect fill={FLOOR_CORRIDOR} height={760} width={80} x={120} y={100} />
        <rect fill="url(#wf-apron)" height={336} width={460} x={1100} y={524} />
      </g>

      {/*
        The lit room's light. Ambient is a soft halo that breathes; a recording is a hard contour
        offset outside the room and nothing breathes at all. That difference survives with the
        copy unread and the strip out of frame, which is the whole point of drawing two of them.
      */}
      {litRoom
        ? (() => {
            const geometry = ROOMS.find((entry) => entry.key === litRoom);
            const room = byKey.get(litRoom);
            if (!geometry || !room) return null;
            const cx = geometry.x + geometry.width / 2;
            const cy = geometry.y + geometry.height / 2;
            return mode === "ambient" ? (
              <g
                color={room.color}
                style={{
                  opacity: 0.34,
                  ...(animate
                    ? {
                        animation: `wf-fade 700ms linear 1000ms backwards, wf-breathe 6s ease-in-out infinite`
                      }
                    : {})
                }}
              >
                <ellipse
                  cx={cx}
                  cy={cy}
                  fill="url(#wf-halo)"
                  rx={geometry.width * 0.72}
                  ry={geometry.height * 0.72}
                />
              </g>
            ) : (
              <rect
                fill="none"
                height={geometry.height + 20}
                stroke={room.color}
                strokeOpacity={0.85}
                strokeWidth={1.5}
                width={geometry.width + 20}
                x={geometry.x - 10}
                y={geometry.y - 10}
              />
            );
          })()
        : null}

      {/* The one place light crosses a threshold, and what makes "lit" read as a light. */}
      {litRoom
        ? (() => {
            const geometry = ROOMS.find((entry) => entry.key === litRoom);
            const room = byKey.get(litRoom);
            if (!geometry || !room) return null;
            if (geometry.key === "carousel-studio") {
              return (
                <path d="M1330 454 L1510 454 L1532 524 L1308 524 Z" fill={room.color} fillOpacity={0.12} />
              );
            }
            if (geometry.key === "fightaiq") {
              return <path d="M1090 240 L1090 300 L1020 322 L1020 218 Z" fill={room.color} fillOpacity={0.12} />;
            }
            if (!geometry.door) return null;
            const { from, to, rank } = geometry.door;
            if (rank === "side") {
              return <path d={`M${geometry.door.x} ${from} L${geometry.door.x} ${to} L200 ${to + 22} L200 ${from - 22} Z`} fill={room.color} fillOpacity={0.12} />;
            }
            const path = rank === "top"
              ? `M${from} 454 L${to} 454 L${to + 22} 524 L${from - 22} 524 Z`
              : `M${from} 524 L${to} 524 L${to + 22} 454 L${from - 22} 454 Z`;
            return <path d={path} fill={room.color} fillOpacity={0.12} />;
          })()
        : null}

      {/* ---- walls ----------------------------------------------------------- */}

      <g
        fill="none"
        stroke={WALL_OUTER}
        strokeLinecap="square"
        strokeWidth={5}
        style={animate ? { animation: `wf-draw 620ms ${E1} 0ms backwards` } : undefined}
      >
        {/*
          Openings are gaps in the path and never lighter strokes. The east wall's two gaps are
          the courier exits; the south gap is the pickup window; the west gap is the corridor the
          question bank came in through, which is the one opening that no longer carries anything.
        */}
        <path
          d="M-520 100 H120 M-520 100 V860 M-520 860 H120
             M120 100 V165 M120 225 V355 M120 415 V545 M120 605 V735 M120 795 V860
             M200 100 H1560 M200 100 V454 M200 524 V662 M200 722 V860
             M1560 100 V630 M1560 690 V730 M1560 790 V860 M200 860 H655 M715 860 H1560"
          pathLength={1}
          strokeDasharray={1}
        />
      </g>

      <g
        fill="none"
        stroke={WALL_INNER}
        strokeLinecap="square"
        strokeWidth={2.5}
        style={animate ? { animation: `wf-draw 380ms ${E1} 180ms backwards` } : undefined}
      >
        <path
          d="M560 100 V454 M830 100 V454 M1240 100 V454 M1090 100 V240 M1090 300 V454
             M-520 290 H120 M-520 480 H120 M-520 670 H120
             M200 454 H440 M500 454 H665 M725 454 H930 M990 454 H1330 M1510 454 H1560
             M540 524 V860 M830 524 V860 M1100 524 V860
             M200 524 H340 M400 524 H655 M715 524 H935 M995 524 H1100"
          pathLength={1}
          strokeDasharray={1}
        />
      </g>

      {/*
        GoVIRAL's three bands (D12). Thinner than a partition between rooms at 1.6 against 2.5,
        because these are not rooms — they are the stations one envelope passes through. Their
        openings are gaps at x 655–715, exactly under the room's door and exactly over the gap in
        the south wall, so an envelope crosses all three on one straight line at x 685 and never
        turns.
      */}
      <g
        fill="none"
        stroke={WALL_INNER}
        strokeLinecap="square"
        strokeWidth={1.6}
        style={animate ? entrance("wf-fade", 380, 240, E1) : undefined}
      >
        <path d="M540 636 H655 M715 636 H830 M540 748 H655 M715 748 H830" />
      </g>

      {/* Each band lights for as long as an envelope is inside it, the same rule as the lab's. */}
      {(["goviral-arrival", "goviral-prep", "goviral-launch"] as const).map((station, index) => (
        bandBusy(station) ? (
          <rect
            fill="#bbf7d0"
            fillOpacity={0.14}
            height={112}
            key={station}
            style={{ pointerEvents: "none", transition: "fill-opacity 260ms ease-out" }}
            width={290}
            x={540}
            y={524 + index * 112}
          />
        ) : null
      ))}

      <g fill="none" stroke={WALL_INNER} strokeLinecap="square" style={animate ? entrance("wf-fade", 380, 180, E1) : undefined}>
        {/* The dock kerb, dashed, so the apron reads as circulation rather than as a room. */}
        <path d="M1100 524 H1140 M1210 524 H1330 M1510 524 H1560" strokeDasharray="7 6" strokeWidth={1.5} />
        {/* A roller does not swing. Six ticks across the opening is how the workshop reads as
            machinery from the wall alone. */}
        {[1345, 1375, 1405, 1435, 1465, 1495].map((x) => (
          <path d={`M${x} 446 V462`} key={x} strokeWidth={1.8} />
        ))}
        {/* One window mark per sitting on Board HQ's north wall. */}
        {[[250, 310], [350, 410], [450, 510]].map(([from, to]) => (
          <g key={from}>
            <path d={`M${from} 96 H${to}`} strokeWidth={1.6} />
            <path d={`M${from} 104 H${to}`} strokeWidth={1.6} />
          </g>
        ))}
      </g>

      {/* ---- the two data lines in the spine --------------------------------- */}

      <g fill="none" style={animate ? entrance("wf-fade", 300, 480, "linear") : undefined}>
        {/* Nobody carries either, so neither gets an arrow with a package on it. */}
        <path
          d="M700 484 H1420 M700 484 V462 M1420 484 V462"
          stroke={WALL_INNER}
          strokeDasharray="9 7"
          strokeWidth={1.6}
          style={chaseBusy ? { animation: "wf-march 900ms linear infinite" } : undefined}
        />
        <rect fill={WALL_INNER} height={5} width={5} x={697.5} y={481.5} />
        <rect fill={WALL_INNER} height={5} width={5} x={1417.5} y={481.5} />
        {/* GoVIRAL's line ends inside the two magazine rooms and starts nowhere else. It owns no
            exit, no dock bay and no address, and the drawing says so by never reaching a wall.
            Its gap at the walk-through is deliberate: a trend signal does not cross the dock. */}
        <path
          d="M685 524 V494 H1100 M1140 494 H1180 M712 494 V454 M964 494 V454"
          stroke="#bbf7d0"
          strokeDasharray="2 7"
          strokeLinecap="round"
          strokeOpacity={signalBusy ? 1 : 0.8}
          strokeWidth={signalBusy ? 2.4 : 1.8}
          style={signalBusy ? { animation: "wf-march 1600ms linear infinite" } : undefined}
        />
      </g>

      {/* ---- furniture -------------------------------------------------------- */}

      <g
        fill="none"
        stroke={FURNITURE}
        strokeWidth={1.6}
        style={animate ? entrance("wf-fade", 300, 480, "linear") : undefined}
      >
        {/* Board HQ is the only room on the plan with a head of the table. */}
        <rect height={80} rx={14} width={240} x={260} y={280} />
        {[288, 368, 448].map((x) => (
          <g key={x}>
            <rect height={16} width={24} x={x} y={256} />
            <rect height={16} width={24} x={x} y={368} />
          </g>
        ))}
        <rect height={24} width={16} x={232} y={308} />
        <rect height={24} width={16} x={508} y={308} />

        <rect height={64} rx={10} width={170} x={610} y={288} />
        {[630, 736].map((x) => (
          <g key={x}>
            <rect height={16} width={24} x={x} y={264} />
            <rect height={16} width={24} x={x} y={360} />
          </g>
        ))}

        {/* MMA Files holds a sitting and a desk. A desk has one seat and no facing side, which is
            the whole distinction, and it is why the room needs no ninth room for its 10:00 slot. */}
        <rect height={60} rx={10} width={160} x={870} y={240} />
        {[890, 986].map((x) => (
          <g key={x}>
            <rect height={16} width={24} x={x} y={216} />
            <rect height={16} width={24} x={x} y={308} />
          </g>
        ))}
        <rect height={34} rx={4} width={110} x={905} y={372} />
        <rect height={16} width={24} x={948} y={414} />

        <rect height={48} rx={8} width={90} x={1120} y={220} />
        {[1132, 1176].map((x) => (
          <g key={x}>
            <rect height={16} width={24} x={x} y={196} />
            <rect height={16} width={24} x={x} y={276} />
          </g>
        ))}
        {[320, 344, 368].map((y) => (
          <rect height={10} key={y} width={114} x={1108} y={y} />
        ))}

        <rect height={64} rx={10} width={170} x={285} y={668} />
        {[305, 411].map((x) => (
          <g key={x}>
            <rect height={16} width={24} x={x} y={644} />
            <rect height={16} width={24} x={x} y={740} />
          </g>
        ))}

        {/*
          GoVIRAL has no table. It had one, and D12 took it: a room that work passes *through* is
          not a room that sits down. Its three bands carry station glyphs instead — the arrival
          tray, the preparation top and the launch sill.
        */}
        <rect height={34} rx={4} width={130} x={600} y={588} />
        {[599, 610].map((y) => (
          <path d={`M600 ${y} H730`} key={y} />
        ))}
        <rect height={40} rx={4} width={130} x={600} y={672} />
        <path d="M665 672 V712" />
        {[830, 838].map((y) => (
          <path d={`M600 ${y} H770`} key={y} />
        ))}

        {/* The four review-era rooms form the west annex. Each uses one bounded desk shape; the
            room's own roles and slots carry the operational differences in its dialog. */}
        {[195, 385, 575, 765].map((y) => (
          <g key={y}>
            <rect height={54} rx={9} width={250} x={-325} y={y - 27} />
            <rect height={14} width={26} x={-292} y={y - 49} />
            <rect height={14} width={26} x={-108} y={y - 49} />
            <rect height={14} width={26} x={-292} y={y + 35} />
            <rect height={14} width={26} x={-108} y={y + 35} />
          </g>
        ))}

        <rect height={62} rx={10} width={170} x={880} y={659} />
        {[900, 1006].map((x) => (
          <g key={x}>
            <rect height={16} width={24} x={x} y={635} />
            <rect height={16} width={24} x={x} y={729} />
          </g>
        ))}
      </g>

      {/* The machine room: no table, no chairs, nothing to sit at. */}
      <g
        fill="none"
        stroke={MACHINE}
        strokeWidth={1.6}
        style={animate ? entrance("wf-fade", 300, 480, "linear") : undefined}
      >
        {[180, 250].map((y) => (
          <g key={y}>
            <rect height={54} rx={8} width={140} x={1276} y={y} />
            {[1310, 1346, 1382].map((x) => (
              <path d={`M${x} ${y} V${y + 54}`} key={x} />
            ))}
          </g>
        ))}
        {[186, 206, 226].map((y) => (
          <rect height={12} key={y} width={90} x={1440} y={y} />
        ))}
        <rect height={40} width={200} x={1290} y={330} />
        <path d="M1360 324 V376" />
      </g>

      {/* The only disc on the plan, and the reason the workshop never reads as dark. */}
      <circle
        cx={1508}
        cy={350}
        fill={labBusy || workshopWorking ? "#c9c9cf" : "#818185"}
        r={13}
        style={{
          opacity: 0.62,
          transition: "fill 420ms ease",
          ...(animate ? { animation: "wf-worklight 4.2s ease-in-out infinite" } : {})
        }}
      />

      {/*
        ---- the dock ----------------------------------------------------------
        Drawn here, in painting order, and pressed further down: the dock's hit target lives
        inside the room sequence so that tabbing reaches the dock after the workshop rather than in
        the order their glyphs happen to be painted.
      */}

      <g
        fill="none"
        stroke={WALL_INNER}
        strokeWidth={1.6}
        style={animate ? entrance("wf-fade", 300, 480, "linear") : undefined}
      >
        <rect height={54} width={90} x={1160} y={540} />
        {[556, 568, 580].map((y) => (
          <path d={`M1172 ${y} H1238`} key={y} strokeWidth={1.4} />
        ))}
        {/* The bench ends at 1400 and the first bay begins at 1420: the clearance the drawing
            has always implied, now that the apron's west edge has moved. */}
        <rect height={40} width={240} x={1160} y={620} />
        {/*
          Three bays. The lower two sit opposite the two courier exits; the top one is Titty
          Tuesdays', and lines up with no exit at all — which is the one thing left on the drawing
          saying this edge is not a delivery.
        */}
        {[526, 620, 720].map((y) => (
          <rect height={80} key={y} strokeDasharray="8 7" strokeWidth={1.5} width={132} x={1420} y={y} />
        ))}
      </g>
      {/* One package on the bench, not two. It is the rule's cardinality, and the caption says so. */}
      <g style={animate ? entrance("wf-fade", 300, 480, "linear") : undefined}>
        <rect fill="#16161b" height={30} stroke={WALL_OUTER} strokeWidth={1.6} width={30} x={1184} y={590} />
        <path d="M1184 605 H1214" stroke={WALL_OUTER} strokeWidth={1.6} />
        <circle cx={1199} cy={605} fill={WALL_OUTER} r={3.2} />
      </g>
      {!compact ? (
        <g style={animate ? entrance("wf-rise", 260, 560, E1) : undefined}>
          <Label anchor="start" fill={WALL_OUTER} size={19} tracking=".1em" weight={600} x={1116} y={812}>
            LOADING DOCK
          </Label>
        </g>
      ) : null}

      {/* ---- off-plan edges ---------------------------------------------------- */}

      <g style={animate ? entrance("wf-fade", 420, 720, E1) : undefined}>
        {/* Two courier exits: one sealed package, one address, a key cut for that door only. */}
        <path d="M1560 660 H1656" markerEnd="url(#wf-arrow-d4d4d8)" stroke="#d4d4d8" strokeWidth={2.2} />
        <path d="M1560 760 H1656" markerEnd="url(#wf-arrow-d4d4d8)" stroke="#d4d4d8" strokeWidth={2.2} />
        {/*
          The corridor the question bank came in through.
          It is drawn at the plan's dormant weight and it never animates, because stillness on
          this edge is the honest state: the bank was handed over once, the app that sent it is
          standalone, and nothing has crossed here since. The lane points inward and there is no
          outbound leg, because there is no longer anything going the other way.
        */}
        <path d="M104 692 H198" markerEnd="url(#wf-arrow-94949c)" stroke={WALL_INNER} strokeWidth={2.2} />
        {/*
          Titty Tuesdays' bay, and the line from it back to the room.
          Dashed and in the venture's own hue rather than the couriers' solid grey: the arrow
          points at the room because the feed is collected, not delivered, and nothing on the two
          courier lanes should be mistaken for it.
        */}
        <path
          d="M1408 566 H1114"
          fill="none"
          markerEnd="url(#wf-arrow-fde68a)"
          stroke="#fde68a"
          strokeDasharray="6 5"
          strokeWidth={1.8}
          // Inward, and only ever a pulse. Nothing is delivered to this venture and nothing
          // travels to its bay, so the lane brightens toward the room and carries no glyph.
          style={collectBusy ? { animation: "wf-pull 900ms ease-in-out infinite" } : undefined}
        />

        <rect fill="none" height={60} stroke={WALL_INNER} strokeDasharray="7 6" strokeWidth={1.5} width={1} x={200} y={662} />
        {/*
          GoVIRAL's launch edge, out of the one gap in the south wall (D12).
          Dashed and in GoVIRAL's own hue, which extends a rule the drawing already had: the two
          courier lanes are solid grey because they carry a sealed package to a real address;
          Titty Tuesdays' lane is dashed in its hue because it pulls rather than receives; this
          one is dashed because the pipeline is built and the far end is not connected yet. When
          the platforms exist it becomes solid and gains an address block like the magazines'.
        */}
        <path
          d="M685 862 V902"
          fill="none"
          markerEnd="url(#wf-arrow-bbf7d0)"
          stroke="#bbf7d0"
          strokeDasharray="6 5"
          strokeWidth={1.8}
        />
      </g>

      {!compact ? (
        <g style={animate ? entrance("wf-fade", 420, 720, E1) : undefined}>
          <Label anchor="start" fill="#d4d4d8" size={15} weight={600} x={1666} y={650}>
            DNESKAI
          </Label>
          <Label anchor="start" fill={WALL_INNER} size={15} tracking=".1em" weight={400} x={1666} y={672}>
            MAGAZINE
          </Label>
          <Label anchor="start" fill="#d4d4d8" size={15} weight={600} x={1666} y={750}>
            MMA FILES
          </Label>
          <Label anchor="start" fill={WALL_INNER} size={15} tracking=".1em" weight={400} x={1666} y={772}>
            MAGAZINE
          </Label>
          <Label anchor="end" fill={WALL_INNER} size={15} weight={600} x={94} y={682}>
            QUESTION
          </Label>
          <Label anchor="end" fill={WALL_INNER} size={15} tracking=".1em" weight={400} x={94} y={704}>
            BANK
          </Label>
          {/* The one address the drawing names that does not exist yet. The dashed lane says so. */}
          <Label fill="#bbf7d0" size={15} tracking=".1em" weight={500} x={685} y={926}>
            SOCIAL PLATFORMS
          </Label>
        </g>
      ) : null}

      {/* ---- rooms: outlines, names, door notes -------------------------------- */}

      {ROOMS.map((geometry) => {
        const room = byKey.get(geometry.key);
        if (!room) return null;
        const lit = litRoom === geometry.key;
        const workshop = geometry.key === "carousel-studio";
        // Every room opens. Pressing one replaces the drawing with the room itself.
        const openable: PlanPlace = geometry.key;
        const labelFill = lit ? "#f4f4f5" : workshop ? "#d4d4d8" : WALL_OUTER;
        const body = (
          <>
            {/*
              The room's own rectangle, and while this room is the open one, the mark that says
              where it landed. The framing arithmetic is the thing that broke, and it is only
              observable as a rendered rect — so the guard reads this rather than recomputing
              the maths it is supposed to be checking.
            */}
            {/*
              The room's own hit area. Transparent, and the reason a click anywhere on the floor of
              a room opens it rather than only the strokes of its furniture. It carried a
              `data-open-room` marker for the reframe guard, which went with the reframe; the rect
              is not decoration and stays.
            */}
            <rect
              fill="transparent"
              height={geometry.height}
              width={geometry.width}
              x={geometry.x}
              y={geometry.y}
            />
            {lit ? (
              <rect
                fill="none"
                height={geometry.height}
                stroke={room.color}
                strokeWidth={2.5}
                style={animate ? entrance("wf-fade", 700, 1000, "linear") : undefined}
                width={geometry.width}
                x={geometry.x}
                y={geometry.y}
              />
            ) : null}
            {compact ? (
              <Label
                fill="#f4f4f5"
                size={44}
                tracking="0"
                weight={600}
                x={geometry.x + geometry.width / 2}
                y={geometry.y + geometry.height / 2 + 16}
              >
                {geometry.numeral}
              </Label>
            ) : (
              <Label
                fill={labelFill}
                size={19}
                style={animate ? entrance("wf-rise", 260, 560 + geometry.numeral * 40, E1) : undefined}
                tracking=".1em"
                weight={600}
                x={geometry.x + geometry.width / 2}
                y={geometry.labelY}
              >
                {room.name}
              </Label>
            )}
            {/*
              The beat's tag (D3): `HH:00 · label`, beneath the room's name, in the registry's own
              hour and the registry's own words. Drawn text — never a native `title`, because
              nothing on this plan has ever carried one and the performance does not bend that.
              19 units is the room-label size, which renders 10.1px at the 1024px wide-mode floor
              and so clears the 9.5px minimum; below 1024px the tag leaves the drawing entirely and
              the section prints it as an HTML line instead.

              `pointer-events: none`, like every performance layer: a press anywhere on this room
              is D9's teardown-and-open, and a tag must never swallow one.
            */}
            {beat?.room === geometry.key && !compact ? (() => {
              /*
               * The tag is a label on the room, and it needs a plate to stay one.
               *
               * `08:00 · Fight data check` is 24 characters, which at 19 units is about 300 units
               * wide — twice FightAIQ's own 150. Every long label on a narrow room lay across two
               * neighbours as bare text and read as belonging to none of them. The plate is the
               * fix: the tag still centres on its room and still says exactly what the registry
               * says, and where it overhangs it reads as a label sitting on top of the drawing
               * rather than as text tangled in it.
               *
               * Mono advances predictably, so the width is counted rather than measured — there
               * is no text metric at render time, and a measured one would need a layout pass
               * this drawing does not otherwise take.
               */
              const width = beat.tag.length * 11.6 + 22;
              const centre = Math.min(
                Math.max(geometry.x + geometry.width / 2, PLAN_LEFT + width / 2 + 8),
                PLAN_RIGHT - width / 2 - 8
              );
              const y = geometry.labelY + 16;
              return (
                <g style={{ pointerEvents: "none", ...(animate ? entrance("wf-fade", 180, 80, E1) : {}) }}>
                  <rect
                    fill="#09090b"
                    fillOpacity={0.88}
                    height={28}
                    rx={4}
                    stroke={room.color}
                    strokeOpacity={0.5}
                    strokeWidth={1}
                    width={width}
                    x={centre - width / 2}
                    y={y}
                  />
                  <Label fill="#f4f4f5" size={19} tracking=".06em" weight={500} x={centre} y={y + 20}>
                    {beat.tag}
                  </Label>
                </g>
              );
            })() : null}
            <FocusRing height={geometry.height} width={geometry.width} x={geometry.x} y={geometry.y} />
          </>
        );
        return (
          <g key={geometry.key}>
            <g aria-label={`Open ${room.name}`} {...press(openable)}>
              {body}
            </g>
            {/* The dock's hit target, in reading order: after the workshop, before the shop. */}
            {geometry.key === "carousel-studio" ? (
              <g aria-label="Open the loading dock" {...press("dock")}>
                <rect fill="transparent" height={336} width={460} x={1100} y={524} />
                <FocusRing height={336} width={460} x={1100} y={524} />
              </g>
            ) : null}
          </g>
        );
      })}

      {/*
        No in-plan captions. The furniture carries what they used to say: a desk with one seat and
        no facing side is a desk, three shelving runs are a records room, and a room with rollers,
        a plotter and no chair at all is machinery. A caption naming what the drawing already shows
        is the drawing admitting it did not work.
      */}

      {/* Carousel Studio hangs no note: it holds no session and has nothing to record. */}
      {rooms.map((room) => {
        const anchors = NOTE_ANCHORS[room.key];
        if (!anchors) return null;
        return room.slots.map((slot, index) => {
          const x = anchors.xs[index];
          if (x === undefined) return null;
          return (
            <DoorNote
              animate={animate}
              color={slot.color}
              index={index}
              key={`${room.key}-${slot.kind}`}
              note={noteFor(slot)}
              stem={anchors.stem}
              x={x}
              y={anchors.y}
            />
          );
        });
      })}

      {/*
        ---- everything that is not the open room, pushed back --------------------

        One element, painted last so it covers the notes and the off-plan addresses too, with the
        open room punched out of it by the even-odd rule. The rest of the floor keeps its drawing
        and loses its claim on the eye.

        A scrim rather than an opacity on each layer, because the plan is grouped by *kind* —
        floors together, walls together, furniture together — and no group is one room. Dimming
        "the non-room layers" any other way would mean regrouping the whole drawing by room first,
        for a result a reader could not tell apart.

        This is also why the framing above does not have to do the impossible. A room drawn 0.76
        as wide as it is tall cannot fill a stage twice as wide as it is tall, so its neighbours
        are in frame whatever the viewBox says; held back to a tenth of their contrast they read
        as the building around the room rather than as three more rooms competing with it.

        It takes no clicks, so every room underneath stays pressable, and it carries no
        `will-change` — the plates exhausted this page's compositor once already.
      */}
      {/*
        ---- the travellers -----------------------------------------------------

        Painted after the drawing so an envelope rides over the floor it crosses, and before the
        travellers are torn down before a room opens, and a room opening no longer reframes the
        drawing at all — it opens a dialog over it.
      */}
      {legs.map((leg) => <Traveller key={leg.id} leg={leg} />)}

    </svg>
  );
}
