"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  REPLAY_FIRST_HOUR,
  REPLAY_LAST_HOUR,
  litRoomForHour,
  notesThroughHour,
  type OfficeWorkflows
} from "@/lib/office-workflows-model";
import { WALKTHROUGH_PANEL_ZOOM } from "@/components/office/panel-zoom";
import { WorkflowsPlan, type PlanPlace } from "@/components/office/workflows-plan";
import {
  ExampleChip,
  PANEL_COPY,
  WorkflowsPanelBody,
  carriesExample
} from "@/components/office/workflows-panels";

/**
 * Workflows: the office from above, and how work leaves the building.
 *
 * Three depths, all inside one locked screen. Depth 1 is the plan at rest, lit by the current
 * Prague hour — the only depth most readers will see, so it carries the argument on its own.
 * Depth 2 walks the day from 05:00 to 22:00 once, on request, and stops on the finished picture.
 * Depth 3 opens one of four places in place, as a panel over the plan rather than as a second
 * screen.
 *
 * Nothing on the plan carries a `title`, so nothing on it raises a tooltip. Hover and focus change
 * the drawing and nothing else.
 *
 * Now and the replay speak two visual languages on purpose. At rest the light is a soft halo that
 * breathes and the plate keeps its Prague wash. Recording, the halo is replaced by a hard contour
 * offset outside the room, the strip appears, and a flat scrim switches the real sky off. That
 * difference survives with the copy unread and the strip out of frame.
 */

const MONO = "var(--font-ibm-plex-mono), monospace";

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

const clamp = (hour: number) => Math.max(REPLAY_FIRST_HOUR, Math.min(REPLAY_LAST_HOUR, hour));
const railFraction = (hour: number) => (hour - REPLAY_FIRST_HOUR) / (REPLAY_LAST_HOUR - REPLAY_FIRST_HOUR);

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
  /** The replay scrim lives beside the section's other decorative layers, so it is raised here. */
  onReplayChange: (replaying: boolean) => void;
}) {
  const [now, setNow] = useState<{ hour: number; minute: number } | null>(null);
  const [replayHour, setReplayHour] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState<PlanPlace | null>(null);
  const [expanded, setExpanded] = useState<PlanPlace | null>(null);
  const [compact, setCompact] = useState(false);
  const [surface, setSurface] = useState<"quiz" | "news" | "mma">("quiz");
  const [shuttered, setShuttered] = useState(false);

  const titleRef = useRef<HTMLParagraphElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  /** Which door the open panel came out of, so focus can go back to it. */
  const openerRef = useRef<PlanPlace | null>(null);

  const replaying = replayHour !== null;

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

  useEffect(() => onReplayChange(replaying), [replaying, onReplayChange]);

  /** One hour per 700ms, so a full day runs 11.9s. The walk runs once; it never starts itself. */
  useEffect(() => {
    if (!playing || replayHour === null || reduceMotion || replayHour >= REPLAY_LAST_HOUR) {
      return undefined;
    }
    const timer = setTimeout(() => {
      const next = replayHour + 1;
      setReplayHour(next);
      // The day is a walk, not a loop. It stops on 22:00 and holds the finished picture — every
      // room closed and every note hung, which is the same thing depth 1 shows at that hour. A
      // day that restarted itself would keep erasing the record it had just finished drawing.
      if (next >= REPLAY_LAST_HOUR) setPlaying(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [playing, replayHour, reduceMotion]);

  const startReplay = useCallback(() => {
    setReplayHour(REPLAY_FIRST_HOUR);
    setPlaying(!reduceMotion);
  }, [reduceMotion]);

  /** Play from where the walk stopped, or from the top of the day once it has finished. */
  const togglePlay = useCallback(() => {
    if (!playing && replayHour !== null && replayHour >= REPLAY_LAST_HOUR) {
      setReplayHour(REPLAY_FIRST_HOUR);
    }
    setPlaying((value) => !value);
  }, [playing, replayHour]);

  const stopReplay = useCallback(() => {
    setReplayHour(null);
    setPlaying(false);
  }, []);

  /** Stepping pauses playback: a reader who steps is reading, not watching. */
  const step = useCallback((delta: number) => {
    setPlaying(false);
    setReplayHour((hour) => (hour === null ? null : clamp(hour + delta)));
  }, []);

  const seek = useCallback((hour: number) => {
    setPlaying(false);
    setReplayHour(clamp(hour));
  }, []);

  /* ---- what the plan draws right now ------------------------------------- */

  const hour = replayHour ?? now?.hour ?? -1;
  const litRoom = useMemo(() => litRoomForHour(hour, data.slots), [hour, data.slots]);
  const notes = useMemo(
    () => (replaying ? notesThroughHour(hour, data.slots) : data.slots.map((slot) => slot.note)),
    [replaying, hour, data.slots]
  );
  // A pack reaches the workshop on the hours something actually left a room. Nothing else
  // brightens it, and it never goes dark: its floor is lit at rest and its light never goes out.
  const workshopWorking = useMemo(
    () => data.slots.some((slot, index) => slot.hour === hour && notes[index] === "sent"),
    [data.slots, hour, notes]
  );

  /* ---- panels ------------------------------------------------------------ */

  const openPanel = useCallback((place: PlanPlace) => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setExpanded((current) => (current === place ? null : place));
      return;
    }
    setOpen(place);
  }, []);

  const closePanel = useCallback(() => setOpen(null), []);

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
  /** The stepped strip stands in for the replay wherever a walk would be wrong or unwanted. */
  const strip = reduceMotion || compact;

  const panelProps = {
    animate,
    compact,
    data,
    onShuttered: setShuttered,
    onSurface: setSurface,
    shuttered,
    surface
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1180px",
        border: "1px solid #3f3f46",
        borderRadius: "14px",
        background: "rgba(11,11,13,.9)",
        boxShadow: "0 40px 120px rgba(0,0,0,.65)",
        backdropFilter: "blur(16px)",
        overflow: "hidden",
        ...WALKTHROUGH_PANEL_ZOOM
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
          borderBottom: "1px solid #26262b",
          padding: "14px 22px"
        }}
      >
        <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.5, color: "#94949c", maxWidth: "62ch" }}>
          Thirteen wake-ups a day, one room at a time. Open a door to see how the work leaves the
          building.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {!replaying ? (
            <button
              onClick={startReplay}
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
              Play the day
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <WorkflowsPlan
          animate={animate}
          compact={compact}
          litRoom={litRoom}
          mode={replaying ? "replay" : "ambient"}
          notes={notes}
          onOpen={openPanel}
          rooms={data.rooms}
          slots={data.slots}
          workshopWorking={workshopWorking}
        />

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
              {open === "dock" && data.example ? (
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

      {/* ---- depth 2, or the stepped strip that stands in for it -------------- */}

      {replaying || strip ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            flexWrap: "wrap",
            borderTop: "1px solid #26262b",
            padding: "12px 22px"
          }}
        >
          {strip ? (
            <>
              <div
                data-horizontal-scroll
                style={{ display: "flex", gap: "6px", overflowX: "auto", flex: "1 1 240px", minWidth: 0 }}
              >
                {data.slots.map((slot) => (
                  <button
                    key={`${slot.kind}-${slot.hour}`}
                    onClick={() => seek(slot.hour)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                      minWidth: "44px",
                      minHeight: "44px",
                      border: `1px solid ${replayHour === slot.hour ? "#a1a1aa" : "#3f3f46"}`,
                      borderRadius: "9px",
                      background: "#101013",
                      color: "#d4d4d8",
                      cursor: "pointer",
                      flex: "0 0 auto"
                    }}
                    // `aria-label` rather than `title`: the button prints only an hour and a
                    // coloured tick, so it needs a name — and a name is not a tooltip.
                    aria-label={`${String(slot.hour).padStart(2, "0")}:00 · ${slot.label}`}
                    type="button"
                  >
                    <span style={{ fontFamily: MONO, fontSize: "11px" }}>
                      {String(slot.hour).padStart(2, "0")}
                    </span>
                    <span style={{ width: "3px", height: "14px", background: slot.color }} />
                  </button>
                ))}
              </div>
              <span
                style={{
                  ...chip,
                  border: "1px solid #3f3f46",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  color: "#f4f4f5"
                }}
              >
                {replayHour === null ? "Now" : `Replay ${String(replayHour).padStart(2, "0")}:00`}
              </span>
              {replaying ? (
                <button onClick={stopReplay} style={{ ...chip, ...control, width: "auto", padding: "0 12px" }} type="button">
                  Now
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button
                aria-label={playing ? "Pause the replay" : "Play the replay"}
                onClick={togglePlay}
                style={control}
                type="button"
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <button aria-label="Step back an hour" onClick={() => step(-1)} style={{ ...control, fontFamily: MONO, fontSize: "13px" }} type="button">
                ‹
              </button>
              <button aria-label="Step forward an hour" onClick={() => step(1)} style={{ ...control, fontFamily: MONO, fontSize: "13px" }} type="button">
                ›
              </button>

              {/*
                The rail. Thirteen marks, one per wake-up, each in its venture hue — and every mark
                is a wake-up rather than a promise to spend, which is why nothing on this strip
                animates a cost.
              */}
              <div
                aria-label="Replay hour"
                aria-valuemax={REPLAY_LAST_HOUR}
                aria-valuemin={REPLAY_FIRST_HOUR}
                aria-valuenow={replayHour ?? REPLAY_FIRST_HOUR}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
                  else if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
                  else if (event.key === "Home") { event.preventDefault(); seek(REPLAY_FIRST_HOUR); }
                  else if (event.key === "End") { event.preventDefault(); seek(REPLAY_LAST_HOUR); }
                  else if (event.key === " ") { event.preventDefault(); togglePlay(); }
                }}
                onPointerDown={(event) => {
                  const bounds = railRef.current?.getBoundingClientRect();
                  if (!bounds || bounds.width === 0) return;
                  const fraction = (event.clientX - bounds.left) / bounds.width;
                  seek(REPLAY_FIRST_HOUR + Math.round(fraction * (REPLAY_LAST_HOUR - REPLAY_FIRST_HOUR)));
                }}
                ref={railRef}
                role="slider"
                style={{ position: "relative", flex: 1, minWidth: "160px", height: "28px", cursor: "pointer" }}
                tabIndex={0}
              >
                <span
                  aria-hidden="true"
                  style={{ position: "absolute", insetInline: 0, top: "50%", height: "1px", background: "#26262b" }}
                />
                {data.slots.map((slot) => (
                  <span
                    aria-hidden="true"
                    key={`${slot.kind}-${slot.hour}`}
                    style={{
                      position: "absolute",
                      top: "7px",
                      left: `calc(${(railFraction(slot.hour) * 100).toFixed(2)}% - 1.5px)`,
                      width: "3px",
                      height: "14px",
                      background: slot.color
                    }}
                  />
                ))}
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${(railFraction(replayHour ?? REPLAY_FIRST_HOUR) * 100).toFixed(2)}%`,
                    width: "2px",
                    background: "#f4f4f5",
                    transition: reduceMotion ? "none" : "left 700ms linear"
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      left: "-3px",
                      width: "8px",
                      height: "8px",
                      background: "#f4f4f5",
                      transform: "rotate(45deg)"
                    }}
                  />
                </span>
              </div>

              <span
                style={{
                  ...chip,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  border: "1px solid #3f3f46",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  color: "#f4f4f5"
                }}
              >
                <span aria-hidden="true" style={{ width: "7px", height: "7px", background: "#d4d4d8" }} />
                {`Replay ${String(replayHour ?? REPLAY_FIRST_HOUR).padStart(2, "0")}:00`}
              </span>
              <button
                onClick={stopReplay}
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
                Now
              </button>
            </>
          )}
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

          {(["caught-up", "carousel-studio", "dock", "titty-tuesdays"] as PlanPlace[]).map((place) => (
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
                    {place === "dock" && data.example ? (
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
