"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { litRoomForHour, type OfficeWorkflows } from "@/lib/office-workflows-model";
import {
  BEAT_STRIDE_MS,
  DISSOLVE_MS,
  END_HOLD_MS,
  beatAt,
  buildTimeline,
  elapsedForBeat,
  legsAt,
  notesAt
} from "@/lib/office-workflows-timeline";
import { WorkflowsPlan, type PlanPlace } from "@/components/office/workflows-plan";
import {
  ExampleChip,
  PANEL_COPY,
  carriesExample,
  type PanelPlace
} from "@/components/office/workflows-panels";
import { WorkflowsDockDialog } from "@/components/office/workflows-dock-dialog";
import { WorkflowsRoomDialog } from "@/components/office/workflows-room-dialog";
import type { OfficeProjectKey } from "@/lib/office-walkthrough";

/**
 * Workflows: the office from above, and how work leaves the building.
 *
 * Three depths, all inside one locked screen. Depth 1 is the plan at rest, lit by the current
 * Prague hour — the only depth most readers will see, so it carries the argument on its own.
 * Depth 2 performs the standing day once, on request, and stops on the finished picture. Depth 3
 * opens a room in place, by reframing the plan onto that room's own rectangle; the dock is not a
 * room and keeps its panel.
 *
 * Nothing on the plan carries a `title`, so nothing on it raises a tooltip. Hover and focus change
 * the drawing and nothing else.
 *
 * Ambient and the performance speak two visual languages on purpose. At rest the light is a soft
 * halo that breathes and the plate keeps its Prague wash. Performing, the halo is replaced by a
 * hard contour offset outside the room and a flat scrim switches the real sky off. That difference
 * survives with the copy unread — which matters more now than it did, because since D1 there is no
 * chrome at all beyond one button.
 */

const MONO = "var(--font-ibm-plex-mono), monospace";

/**
 * The four panel bodies, fetched when a reader asks for one.
 *
 * They are the heaviest interaction-gated weight on the home page, and a visitor who never opens
 * the dock — most visitors — never needs a byte of them. `ssr: false` because a panel only ever
 * opens under a press, so there is nothing to render on the server and nothing to hydrate.
 *
 * The chrome around a body — the header, the footer, the worked-example chip — stays statically
 * imported above, because it is on screen the moment the section is. That separation is the whole
 * reason `workflows-panels.tsx` was split in two: importing the bodies lazily out of a module that
 * also held `PANEL_COPY` would have pulled them straight back into the first load through the
 * static edge.
 *
 * The warm-up is the bare `import()` rather than a `preload()` on the component. Next 16's
 * `dynamic()` is built on `React.lazy` and the returned component has no `preload` — calling one
 * is a silent no-op that measured as 17.2 kB still being fetched at press time. Webpack hands the
 * same promise to every caller of the same specifier, so calling the import early is exactly a
 * preload: the same measurement now reads 17.2 kB on reaching the section and 0 kB on the press.
 */
const importPanelBodies = () => import("@/components/office/workflows-panel-bodies");

const WorkflowsPanelBody = dynamic(
  () => importPanelBodies().then((module) => module.WorkflowsPanelBody),
  {
    ssr: false,
    /*
     * The plate, and nothing on it.
     *
     * With the preload working this never renders — the chunk is there before the press. It is for
     * the reader who presses faster than their connection: without it the panel's middle would be
     * see-through onto the floor plan, so it paints the cell colour across every column and the
     * content arrives into an opaque frame. Nothing spins and nothing says "loading", because at
     * this length a message would leave the screen before it could be read.
     */
    loading: () => <div style={{ gridColumn: "1 / -1", background: "#0b0b0d" }} />
  }
);

const control: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: "30px",
  height: "30px",
  border: "1px solid #3f3f46",
  borderRadius: "9px",
  background: "#101013",
  color: "#d4d4d8",
  cursor: "pointer"
};

const chip: CSSProperties = {
  fontFamily: MONO,
  fontSize: "10.5px",
  textTransform: "uppercase",
  letterSpacing: ".1em"
};

function pragueHourMinute(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Prague"
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { hour: value("hour"), minute: value("minute") };
}

export function SectionWorkflows({
  data,
  active,
  reduceMotion,
  onReplayChange
}: {
  data: OfficeWorkflows;
  /** True once the walk has reached this section, which is what starts the entrance. */
  active: boolean;
  reduceMotion: boolean;
  /** The performance scrim lives beside the section's other decorative layers, so it is raised here. */
  onReplayChange: (performing: boolean) => void;
}) {
  const [now, setNow] = useState<{ hour: number; minute: number } | null>(null);
  const [open, setOpen] = useState<PanelPlace | null>(null);
  const [expanded, setExpanded] = useState<PanelPlace | null>(null);
  /** The room standing open in place of the plan, if any. */
  const [openRoom, setOpenRoom] = useState<OfficeProjectKey | null>(null);
  const [dock, setDock] = useState(false);
  const [compact, setCompact] = useState(false);
  const [surface, setSurface] = useState<"quiz" | "news" | "mma">("quiz");
  const [shuttered, setShuttered] = useState(false);

  const titleRef = useRef<HTMLParagraphElement>(null);
  /** Which door the open panel came out of, so focus can go back to it. */
  const openerRef = useRef<PlanPlace | null>(null);
  const planRef = useRef<HTMLDivElement>(null);

  /* ---- the performance --------------------------------------------------- */

  const timeline = useMemo(() => buildTimeline(data.slots), [data.slots]);

  /**
   * How far into the performance we are, or `null` when the section is at rest.
   *
   * One number is the whole of the performance's state. Everything drawn — which room is live,
   * which notes hang, what is in flight — is a pure read of the timeline at this elapsed time, so
   * there is no second clock to keep in step and no way for the two to disagree.
   */
  const [elapsed, setElapsed] = useState<number | null>(null);
  const performing = elapsed !== null;

  /** The Prague clock, read the same way the page header reads it. */
  useEffect(() => {
    const apply = () => setNow(pragueHourMinute());
    apply();
    const timer = setInterval(apply, 30_000);
    return () => clearInterval(timer);
  }, []);

  /*
   * Below 1024px the page is an ordinary document: nothing is intercepted, the plan is a static
   * picture scaled to the viewport, and the four panels are stacked blocks rather than overlays.
   */
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => onReplayChange(performing), [performing, onReplayChange]);

  /*
   * The clock that drives it.
   *
   * With motion, one interval steps the elapsed time and the CSS in the plan interpolates between
   * those steps; the step is a quarter of a beat, which is fine-grained enough that a beat's rise
   * and its close land on the frame they should and coarse enough to cost nothing. With reduced
   * motion the same interval advances beat by beat instead — the story is identical, and nothing
   * moves between the steps because there is nothing to interpolate.
   */
  useEffect(() => {
    if (elapsed === null) return undefined;
    if (reduceMotion) {
      const index = timeline.beats.findIndex((beat) => elapsed <= beat.readableAt);
      const next = index === -1 ? timeline.beats.length : index + 1;
      if (next > timeline.beats.length) return undefined;
      const timer = setTimeout(() => {
        setElapsed(
          next === timeline.beats.length ? timeline.duration : elapsedForBeat(timeline, next)
        );
      }, BEAT_STRIDE_MS);
      return () => clearTimeout(timer);
    }
    if (elapsed >= timeline.duration) return undefined;
    const step = Math.round(BEAT_STRIDE_MS / 4);
    const timer = setTimeout(() => setElapsed(Math.min(elapsed + step, timeline.duration)), step);
    return () => clearTimeout(timer);
  }, [elapsed, reduceMotion, timeline]);

  /**
   * The day ends by itself (D6): the finished picture holds, then dissolves back to ambient.
   *
   * Written as a second effect rather than folded into the tick, because the last tick lands
   * exactly on `duration` and the hold has to be measured from there whether the clock arrived by
   * ticking or by the reduced-motion path skipping to it.
   */
  useEffect(() => {
    if (elapsed === null || elapsed < timeline.duration) return undefined;
    const timer = setTimeout(() => setElapsed(null), END_HOLD_MS + DISSOLVE_MS);
    return () => clearTimeout(timer);
  }, [elapsed, timeline.duration]);

  /**
   * The one teardown.
   *
   * D1's stop and D9's room press are the same thing and share this line, so the two can never
   * drift apart: no traveller survives into ambient, the scrim goes, the notes return to today's
   * full set, and the button reads `Play the day` again.
   */
  const stopPerformance = useCallback(() => setElapsed(null), []);

  const togglePerformance = useCallback(() => {
    setElapsed((current) => (current === null ? 0 : null));
  }, []);

  /* ---- what the plan draws right now ------------------------------------- */

  const beat = useMemo(
    () => (elapsed === null ? null : beatAt(timeline, elapsed)),
    [timeline, elapsed]
  );

  const hour = now?.hour ?? -1;
  const ambientLitRoom = useMemo(() => litRoomForHour(hour, data.slots), [hour, data.slots]);
  /**
   * Which room the plan lights.
   *
   * Performing, it is the live beat's room — every slot's room, including GoVIRAL on the six days
   * it does not sit, because the performance shows how the day *operates* (D2). Ambient keeps
   * `litRoomForHour` and its gated-slot rule exactly as it was.
   */
  const litRoom = performing ? beat?.room ?? null : ambientLitRoom;

  /** Everything in flight right now. Empty at rest — ambient has no travellers (D5). */
  const legs = useMemo(
    () => (elapsed === null ? [] : legsAt(timeline, elapsed)),
    [timeline, elapsed]
  );

  const notes = useMemo(
    () => (elapsed === null ? data.slots.map((slot) => slot.note) : notesAt(timeline, data.slots, elapsed)),
    [timeline, elapsed, data.slots]
  );

  // A pack reaches the workshop on the hours something actually left a room. Nothing else
  // brightens it, and it never goes dark: its floor is lit at rest and its light never goes out.
  const workshopWorking = useMemo(
    () => data.slots.some((slot, index) => slot.hour === hour && notes[index] === "sent"),
    [data.slots, hour, notes]
  );

  /* ---- panels ------------------------------------------------------------ */

  /**
   * What pressing a place on the plan does.
   *
   * A room opens as itself and the dock opens the courier panel — and either way the performance
   * is torn down first (D9). The teardown is a state update in the same event as the open, so
   * React commits both together and the plan never reframes with a traveller still on it.
   */
  const openPlace = useCallback((place: PlanPlace) => {
    stopPerformance();
    if (place === "dock") {
      // A dialog at every width. The compact path used to expand a strip below the plan instead,
      // which is a second thing to keep true for no reason once the dialog scrolls on its own.
      setDock(true);
      return;
    }
    setOpenRoom(place);
  }, [stopPerformance]);

  const closePanel = useCallback(() => setOpen(null), []);

  const room = useMemo(
    () => (openRoom ? data.rooms.find((entry) => entry.key === openRoom) ?? null : null),
    [openRoom, data.rooms]
  );

  /**
   * Focus follows the panel in both directions.
   *
   * Both moves happen in an effect rather than in the handler that caused them, because the
   * element being focused is the one React is about to render or has just removed. Focusing from
   * inside the click handler — even a frame later — races the commit and lands on the body.
   */
  useEffect(() => {
    if (open) {
      openerRef.current = open;
      titleRef.current?.focus();
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(null);
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    const opener = openerRef.current;
    if (opener) {
      openerRef.current = null;
      // Back to the door it came out of, not to the top of the page.
      document.querySelector<SVGGElement>(`[data-wf-place="${opener}"]`)?.focus();
    }
    return undefined;
  }, [open]);

  const animate = active && !reduceMotion;

  /**
   * Fetch the panel bodies the moment the reader arrives at this section.
   *
   * A panel takes at least one deliberate press after arrival, so the chunk has the whole
   * approach to land in. The split is then invisible: it costs the first load nothing and costs
   * the press nothing either. Without this the first panel of a session would open on an empty
   * frame while the chunk was still on the wire.
   */
  useEffect(() => {
    if (!active) return;
    void importPanelBodies();
  }, [active]);

  const panelProps = {
    animate,
    compact,
    data,
    onShuttered: setShuttered,
    onSurface: setSurface,
    shuttered,
    surface
  };

  /**
   * The toggle is not offered while a room or the dock stands open (D9).
   *
   * The performance starts only from the full floor plan. Rendering it over an open room invited
   * a press that would have had to close the room to mean anything.
   */
  const offerToggle = !room && !(open && !compact);

  /*
   * No card. Owner decision: the plan is the section, so it takes the whole width of it rather
   * than sitting on a 1180px plate in the middle. That also drops the panel zoom the other
   * sections carry — this one has room to be read at its designed size and then some.
   *
   * Above 1024px the board is a flex column filling the section: the header takes what it needs
   * and the plan takes the rest. The plan then fits itself to that box, so it is as large as the
   * room allows — width-bound on a tall monitor, height-bound on a laptop. Nothing sits under the
   * drawing at any width since D1 removed the strip.
   */
  return (
    <div
      style={{
        width: "100%",
        ...(compact ? {} : { height: "100%", display: "flex", flexDirection: "column", minHeight: 0 })
      }}
      data-workflows-board
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "18px",
          flexWrap: "wrap",
          padding: "0 2px 10px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
          {offerToggle ? (
            <button
              aria-pressed={performing}
              onClick={togglePerformance}
              style={{
                ...chip,
                border: "1px solid #3f3f46",
                borderRadius: "9px",
                background: "#101013",
                padding: "7px 12px",
                color: "#d4d4d8",
                cursor: "pointer"
              }}
              type="button"
            >
              {performing ? "Stop the day" : "Play the day"}
            </button>
          ) : null}
        </div>
      </div>

      {/*
        Centred. The plan used to fill its section corner to corner because the click-to-reframe
        needed every pixel it could take; without the zoom it is a drawing, and a drawing sits in
        the middle of the space it is given.
      */}
      <div
        ref={planRef}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...(compact ? {} : { flex: 1, minHeight: 0 })
        }}
      >
        <WorkflowsPlan
          animate={animate}
          beat={beat ? { room: beat.room, tag: beat.tag } : null}
          compact={compact}
          legs={reduceMotion ? [] : legs}
          fill={!compact}
          litRoom={litRoom}
          mode={performing ? "replay" : "ambient"}
          notes={notes}
          onOpen={openPlace}
          rooms={data.rooms}
          slots={data.slots}
          workshopWorking={workshopWorking}
        />
        <WorkflowsRoomDialog onClose={() => setOpenRoom(null)} room={room} />
        <WorkflowsDockDialog data={data} onClose={() => setDock(false)} open={dock} />

        {open && !compact ? (
          <div
            aria-labelledby="wf-panel-title"
            aria-modal={false}
            role="dialog"
            style={{
              position: "absolute",
              inset: "14px",
              display: "flex",
              flexDirection: "column",
              border: "1px solid #3f3f46",
              borderRadius: "12px",
              background: "rgba(11,11,13,.96)",
              backdropFilter: "blur(18px)",
              boxShadow: "0 40px 120px rgba(0,0,0,.7)",
              overflow: "hidden",
              ...(animate ? { animation: "wf-panel 420ms cubic-bezier(.22,.61,.36,1)" } : {})
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "16px",
                padding: "16px 22px",
                borderBottom: "1px solid #26262b"
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ ...chip, margin: 0, letterSpacing: ".14em", color: "#94949c" }}>
                  {PANEL_COPY[open].eyebrow}
                </p>
                <p
                  id="wf-panel-title"
                  ref={titleRef}
                  style={{
                    margin: "4px 0 0",
                    fontSize: "19px",
                    fontWeight: 600,
                    letterSpacing: "-.02em",
                    color: "#f4f4f5",
                    outline: "none"
                  }}
                  tabIndex={-1}
                >
                  {PANEL_COPY[open].title}
                </p>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
                {carriesExample(open) ? <ExampleChip example={data.example} /> : null}
                <button aria-label="Close panel" onClick={closePanel} style={control} type="button">
                  ×
                </button>
              </div>
            </div>

            <div
              data-wheel-exempt
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                display: "grid",
                gridTemplateColumns: PANEL_COPY[open].columns,
                gap: "1px",
                background: "#1e1e22",
                alignContent: "start"
              }}
            >
              <WorkflowsPanelBody place={open} {...panelProps} />
            </div>

            <div
              style={{
                ...chip,
                display: "flex",
                gap: "18px",
                padding: "12px 22px",
                borderTop: "1px solid #26262b",
                letterSpacing: ".12em",
                color: "#94949c"
              }}
            >
              <span>{PANEL_COPY[open].footer}</span>
              {carriesExample(open) && data.example ? (
                <a
                  href={data.example.articleUrl}
                  rel="noreferrer"
                  style={{ marginLeft: "auto", color: "#d4d4d8" }}
                  target="_blank"
                >
                  Read the published article ›
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/*
        ---- below 1024px, the beat leaves the drawing -------------------------

        In-plan text is numerals-only at this width, so a tag drawn at 19 plan units would land
        well under the 9.5px floor. The beat says the same thing as one HTML line instead.
      */}
      {compact && beat ? (
        <div
          style={{
            ...chip,
            display: "flex",
            gap: "10px",
            borderTop: "1px solid #26262b",
            padding: "12px 16px",
            color: "#f4f4f5"
          }}
        >
          <span aria-hidden="true" style={{ width: "3px", height: "14px", background: beat.color }} />
          {beat.tag}
        </div>
      ) : null}

      {/* ---- below 1024px: the key, then the panels as ordinary blocks -------- */}

      {compact ? (
        <>
          <div style={{ borderTop: "1px solid #26262b", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.rooms.map((room, index) => {
              const hours = room.slots.map((slot) => `${String(slot.hour).padStart(2, "0")}:00`).join(" · ");
              const note = room.slots.find((slot) => slot.note !== "none");
              return (
                <div key={room.key} style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <span style={{ ...chip, color: "#94949c", width: "18px", flex: "0 0 auto" }}>{index + 1}</span>
                  <span style={{ fontSize: "13px", color: "#f4f4f5" }}>{room.name}</span>
                  <span style={{ ...chip, color: "#94949c", marginLeft: "auto", textAlign: "right" }}>
                    {hours || "always open"}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      width: "12px",
                      height: "8px",
                      flex: "0 0 auto",
                      borderRadius: "2px",
                      ...(note?.note === "sent"
                        ? { background: room.color }
                        : note?.note === "quiet"
                          ? { background: "#0e0e12", border: `1px solid ${room.color}` }
                          : note
                            ? { border: "1px solid #94949c", borderRight: 0 }
                            : {})
                    }}
                  />
                </div>
              );
            })}
            {[
              ["9", "DNESKAi magazine", "courier exit"],
              ["10", "MMA Files magazine", "courier exit"],
              ["11", "The storefront", "dock bay · it collects its own feed"],
              ["12", "The question bank", "corridor · imported once, nothing goes back"]
            ].map(([numeral, name, edge]) => (
              <div key={numeral} style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <span style={{ ...chip, color: "#94949c", width: "18px", flex: "0 0 auto" }}>{numeral}</span>
                <span style={{ fontSize: "13px", color: "#f4f4f5" }}>{name}</span>
                <span style={{ ...chip, color: "#94949c", marginLeft: "auto", textAlign: "right" }}>{edge}</span>
              </div>
            ))}
          </div>

          {/* The dock left this list with its panel: it opens the plain-facts dialog at every
              width now, so a compact accordion for it would be a second thing to keep true. */}
          {(["caught-up", "carousel-studio", "titty-tuesdays"] as PanelPlace[]).map((place) => (
            <div key={place} style={{ borderTop: "1px solid #26262b" }}>
              <button
                aria-expanded={expanded === place}
                onClick={() => setExpanded((current) => (current === place ? null : place))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                  padding: "14px 16px",
                  border: 0,
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer"
                }}
                type="button"
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ ...chip, display: "block", letterSpacing: ".14em", color: "#94949c" }}>
                    {PANEL_COPY[place].eyebrow}
                  </span>
                  <span style={{ display: "block", marginTop: "3px", fontSize: "15px", fontWeight: 600, color: "#f4f4f5" }}>
                    {PANEL_COPY[place].title}
                  </span>
                </span>
                <span aria-hidden="true" style={{ marginLeft: "auto", color: "#94949c" }}>
                  {expanded === place ? "▴" : "▾"}
                </span>
              </button>
              {expanded === place ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1px", background: "#1e1e22" }}>
                  <WorkflowsPanelBody place={place} {...panelProps} compact />
                  <div style={{ ...chip, background: "#0b0b0d", padding: "12px 16px", letterSpacing: ".12em", color: "#94949c" }}>
                    {PANEL_COPY[place].footer}
                    {carriesExample(place) && data.example ? (
                      <>
                        {" "}
                        <a href={data.example.articleUrl} rel="noreferrer" style={{ color: "#d4d4d8" }} target="_blank">
                          Read the published article ›
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
