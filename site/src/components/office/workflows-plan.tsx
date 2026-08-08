"use client";

import type { CSSProperties, ReactNode } from "react";
import type { OfficeProjectKey } from "@/lib/office-walkthrough";
import type {
  WorkflowsNoteKind,
  WorkflowsRoom,
  WorkflowsSlot
} from "@/lib/office-workflows-model";

/**
 * The floor plan: one office from above, drawn as a single inline SVG.
 *
 * Every coordinate here is a plan unit inside a 1760 × 940 viewBox and is transcribed from the
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

export const PLAN_WIDTH = 1760;
export const PLAN_HEIGHT = 940;
export const PLAN_FLOOR_MARGIN = 80;

/**
 * How much empty plan sits either side of the drawing.
 *
 * The off-plan addresses run to within a few units of the drawing's own bounds, so at the board's
 * width they touched its border and read as clipped. This is margin in plan units rather than
 * padding on the card, which keeps the geometry below transcribable exactly as specified.
 */
const PLAN_MARGIN = PLAN_FLOOR_MARGIN;

/**
 * How much of the frame the open room claims on whichever of its axes binds first.
 *
 * The remaining fifth is the breathing room, split evenly. A top-rank room framed this way carries
 * its own north wall, its door and the notes hanging at that door, instead of ending half a unit
 * past the wall with the notes cropped off the bottom edge — which is what 0.87, the fraction the
 * old stretch happened to produce, did. Lower than this and the room stops being the subject: at
 * 0.7 Board HQ's roster needed 220px of scroll on a laptop that had shown it whole.
 */
export const ROOM_FRAME_SPAN = 0.8;

/**
 * The viewBox that frames one room inside a box of the given aspect.
 *
 * The frame is *centred on the room and sized from it*. It still carries the container's aspect,
 * because the drawing fills its box and a mismatched frame would letterbox — but the size comes
 * from the room's own larger axis, so every room is framed to the same fraction of itself and
 * lands on an exactly known sub-rectangle the overlay can be placed against without measuring the
 * SVG.
 *
 * The earlier version grew the room's rect *to* the aspect: it padded by a flat 26 units and then
 * stretched whichever axis was short. On a wide container that stretch decided the horizontal
 * framing on its own — a room 270 units wide sat in a frame 766 wide, measured — so the opened
 * room claimed 87% of the stage's height and a third of its width, and the neighbours around it
 * filled the rest at four times their drawn scale. Sizing the frame from the room is the fix. The
 * neighbours that stay in frame are pushed back by the scrim below rather than by the framing,
 * because no framing can make a room 0.76 as wide as it is tall fill a stage twice as wide as it
 * is tall — that geometry is why the two halves of this repair are separate.
 */
export function roomViewBox(room: RoomGeometry, aspect: number): {
  viewBox: string;
  inset: { left: string; top: string; width: string; height: string };
} {
  // Whichever axis binds — the room's width, or its height once the container's aspect is applied
  // to it — is given exactly ROOM_FRAME_SPAN of the frame. The other axis then has more room than
  // it needs, which is correct: a tall room in a wide box cannot fill the width, and pretending
  // otherwise is what cropped it.
  const width = Math.max(room.width, room.height * aspect) / ROOM_FRAME_SPAN;
  const height = width / aspect;
  const cx = room.x + room.width / 2;
  const cy = room.y + room.height / 2;
  const minX = cx - width / 2;
  const minY = cy - height / 2;
  return {
    viewBox: `${minX} ${minY} ${width} ${height}`,
    inset: {
      left: `${((room.x - minX) / width) * 100}%`,
      top: `${((room.y - minY) / height) * 100}%`,
      width: `${(room.width / width) * 100}%`,
      height: `${(room.height / height) * 100}%`
    }
  };
}

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
  door: { from: number; to: number; rank: "top" | "bottom" } | null;
  /** The numeral the sub-1024px key indexes this room by. */
  numeral: number;
}

/** Plan order: the top rank west to east, then the bottom rank west to east. */
export const ROOMS: readonly RoomGeometry[] = [
  { key: "company", x: 200, y: 100, width: 360, height: 354, labelY: 146, door: { from: 440, to: 500, rank: "top" }, numeral: 1 },
  { key: "caught-up", x: 560, y: 100, width: 270, height: 354, labelY: 146, door: { from: 665, to: 725, rank: "top" }, numeral: 2 },
  { key: "mma-files", x: 830, y: 100, width: 260, height: 354, labelY: 146, door: { from: 930, to: 990, rank: "top" }, numeral: 3 },
  // The records room fronts the corridor and cannot reach it: its only door is in the shared wall
  // and opens into the desk that uses its files. That asymmetry needs no caption.
  { key: "fightaiq", x: 1090, y: 100, width: 150, height: 354, labelY: 146, door: null, numeral: 4 },
  { key: "carousel-studio", x: 1240, y: 100, width: 320, height: 354, labelY: 146, door: null, numeral: 5 },
  { key: "marketingshark", x: 200, y: 524, width: 360, height: 336, labelY: 570, door: { from: 410, to: 470, rank: "bottom" }, numeral: 6 },
  { key: "goviral", x: 560, y: 524, width: 170, height: 336, labelY: 570, door: { from: 625, to: 685, rank: "bottom" }, numeral: 7 },
  { key: "titty-tuesdays", x: 730, y: 524, width: 270, height: 336, labelY: 570, door: { from: 835, to: 895, rank: "bottom" }, numeral: 8 }
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
  marketingshark: { xs: [478], y: 500, stem: "up" },
  goviral: { xs: [693], y: 500, stem: "up" },
  "titty-tuesdays": { xs: [903], y: 500, stem: "up" }
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
  workshopWorking,
  mode,
  compact,
  animate,
  fill,
  focus,
  onOpen
}: {
  rooms: readonly WorkflowsRoom[];
  slots: readonly WorkflowsSlot[];
  /** One note kind per slot, index-aligned with `slots`. The replay hands a shorter day. */
  notes: readonly WorkflowsNoteKind[];
  litRoom: OfficeProjectKey | null;
  /**
   * The beat that is live, while the day performs (D3, D4).
   *
   * `room` takes the active fill and `tag` is drawn beneath that room's name — `HH:00 · label`,
   * the registry's own hour and the registry's own words. Null at rest and between beats.
   */
  beat: { room: OfficeProjectKey; tag: string } | null;
  workshopWorking: boolean;
  mode: "ambient" | "replay";
  /** Below 1024px the labels leave the drawing and each place carries a numeral instead. */
  compact: boolean;
  animate: boolean;
  /** Fit the drawing to its box rather than to its own height. Above 1024px only. */
  fill: boolean;
  /** The room the plan is framing, if any: the same walls, closer in. */
  focus: { room: RoomGeometry; viewBox: string } | null;
  onOpen: (place: PlanPlace) => void;
}) {
  const byKey = new Map(rooms.map((room) => [room.key, room]));
  const noteFor = (slot: WorkflowsSlot) => notes[slots.indexOf(slot)] ?? "none";

  const press = (place: PlanPlace) => ({
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
      aria-label="Floor plan of the BoardlessAI office"
      role="group"
      preserveAspectRatio="xMidYMid meet"
      style={fill
        ? { display: "block", width: "100%", height: "100%" }
        : { display: "block", width: "100%", height: "auto" }}
      viewBox={focus ? focus.viewBox : `${-PLAN_MARGIN} 0 ${PLAN_WIDTH + PLAN_MARGIN * 2} ${PLAN_HEIGHT}`}
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
        {["#d4d4d8", WALL_INNER, "#fde68a"].map((colour) => (
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
              ? (workshopWorking ? LIT_FILL["carousel-studio"] : FLOOR_WORKSHOP)
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
        <rect fill="url(#wf-apron)" height={336} width={560} x={1000} y={524} />
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
          d="M200 100 H1560 M200 100 V662 M200 722 V860 M1560 100 V630 M1560 690 V730 M1560 790 V860 M200 860 H1560"
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
             M200 454 H440 M500 454 H665 M725 454 H930 M990 454 H1330 M1510 454 H1560
             M560 524 V860 M730 524 V860 M1000 524 V860
             M200 524 H410 M470 524 H625 M685 524 H835 M895 524 H1000"
          pathLength={1}
          strokeDasharray={1}
        />
      </g>

      <g fill="none" stroke={WALL_INNER} strokeLinecap="square" style={animate ? entrance("wf-fade", 380, 180, E1) : undefined}>
        {/* The dock kerb, dashed, so the apron reads as circulation rather than as a room. */}
        <path d="M1000 524 H1040 M1110 524 H1330 M1510 524 H1560" strokeDasharray="7 6" strokeWidth={1.5} />
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
        />
        <rect fill={WALL_INNER} height={5} width={5} x={697.5} y={481.5} />
        <rect fill={WALL_INNER} height={5} width={5} x={1417.5} y={481.5} />
        {/* GoVIRAL's line ends inside the two magazine rooms and starts nowhere else. It owns no
            exit, no dock bay and no address, and the drawing says so by never reaching a wall.
            Its gap at the walk-through is deliberate: a trend signal does not cross the dock. */}
        <path
          d="M655 524 V494 H1000 M1040 494 H1180 M712 494 V454 M964 494 V454"
          stroke="#bbf7d0"
          strokeDasharray="2 7"
          strokeLinecap="round"
          strokeOpacity={0.8}
          strokeWidth={1.8}
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

        <rect height={64} rx={10} width={170} x={300} y={668} />
        {[320, 426].map((x) => (
          <g key={x}>
            <rect height={16} width={24} x={x} y={644} />
            <rect height={16} width={24} x={x} y={740} />
          </g>
        ))}

        <rect height={52} rx={8} width={96} x={597} y={674} />
        {[609, 657].map((x) => (
          <g key={x}>
            <rect height={16} width={24} x={x} y={650} />
            <rect height={16} width={24} x={x} y={734} />
          </g>
        ))}

        <rect height={62} rx={10} width={170} x={780} y={659} />
        {[800, 906].map((x) => (
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
        fill={workshopWorking ? "#c9c9cf" : "#818185"}
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
        inside the room sequence so that tabbing reaches the four openable places in the order
        the plan reads them — DNESKAi, the workshop, the dock, Titty Tuesdays — rather than in
        the order their glyphs happen to be painted.
      */}

      <g
        fill="none"
        stroke={WALL_INNER}
        strokeWidth={1.6}
        style={animate ? entrance("wf-fade", 300, 480, "linear") : undefined}
      >
        <rect height={54} width={90} x={1060} y={540} />
        {[556, 568, 580].map((y) => (
          <path d={`M1072 ${y} H1138`} key={y} strokeWidth={1.4} />
        ))}
        <rect height={40} width={240} x={1060} y={620} />
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
        <rect fill="#16161b" height={30} stroke={WALL_OUTER} strokeWidth={1.6} width={30} x={1084} y={590} />
        <path d="M1084 605 H1114" stroke={WALL_OUTER} strokeWidth={1.6} />
        <circle cx={1099} cy={605} fill={WALL_OUTER} r={3.2} />
      </g>
      {!compact ? (
        <g style={animate ? entrance("wf-rise", 260, 560, E1) : undefined}>
          <Label anchor="start" fill={WALL_OUTER} size={19} tracking=".1em" weight={600} x={1016} y={812}>
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
          d="M1408 566 H1014"
          fill="none"
          markerEnd="url(#wf-arrow-fde68a)"
          stroke="#fde68a"
          strokeDasharray="6 5"
          strokeWidth={1.8}
        />

        <rect fill="none" height={60} stroke={WALL_INNER} strokeDasharray="7 6" strokeWidth={1.5} width={1} x={200} y={662} />
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
            <rect
              data-open-room={focus?.room.key === geometry.key ? "" : undefined}
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
            {focus?.room.key === geometry.key ? null : compact ? (
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
            {beat?.room === geometry.key && !compact && focus?.room.key !== geometry.key ? (
              <Label
                fill="#f4f4f5"
                size={19}
                style={{ pointerEvents: "none", ...(animate ? entrance("wf-fade", 180, 80, E1) : {}) }}
                tracking=".06em"
                weight={500}
                x={geometry.x + geometry.width / 2}
                y={geometry.labelY + 30}
              >
                {beat.tag}
              </Label>
            ) : null}
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
                <rect fill="transparent" height={336} width={560} x={1000} y={524} />
                <FocusRing height={336} width={560} x={1000} y={524} />
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
      {focus ? (
        <path
          d={`M${-PLAN_MARGIN} 0 H${PLAN_WIDTH + PLAN_MARGIN} V${PLAN_HEIGHT} H${-PLAN_MARGIN} Z`
            + ` M${focus.room.x} ${focus.room.y} H${focus.room.x + focus.room.width}`
            + ` V${focus.room.y + focus.room.height} H${focus.room.x} Z`}
          data-wf-scrim
          fill="#09090b"
          fillOpacity={0.88}
          fillRule="evenodd"
          style={{
            pointerEvents: "none",
            ...(animate ? entrance("wf-fade", 240, 0, "linear") : {})
          }}
        />
      ) : null}
    </svg>
  );
}
