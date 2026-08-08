"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { WorkflowsRoom } from "@/lib/office-workflows-model";

/**
 * One room, opened inside the floor plan.
 *
 * The plan does not go away and it is not replaced by a card: it frames the room, so the same
 * walls the reader was looking at a moment ago are still the walls around what they are reading.
 * This is the content that stands inside them — laid over the room's own rectangle, which
 * `roomViewBox` puts at an exactly known place in the frame.
 *
 * It carries the least that answers "what is this room": what it is for, when it sits, and who
 * stands in it. The mechanisms each room hands its work to live behind the dock and the panels,
 * not here.
 */

const MONO = "var(--font-ibm-plex-mono), monospace";

const eyebrow: CSSProperties = {
  margin: 0,
  fontFamily: MONO,
  fontSize: "9.5px",
  textTransform: "uppercase",
  letterSpacing: ".14em",
  color: "#94949c"
};


/**
 * The last thing a room produced, drawn the way a link preview draws it.
 *
 * The thumbnail is the article's own published image, so this is the card a reader would get if
 * they pasted the link anywhere else. An article whose address was never recorded keeps the title
 * and the date and loses the frame around them — there is nothing to open, and a card that looks
 * clickable and is not would be worse than a line of text. If the image itself does not resolve,
 * it removes itself and the card stays a card.
 */
function LatestCard({ latest }: { latest: NonNullable<WorkflowsRoom["latest"]> }) {
  const [broken, setBroken] = useState(false);

  if (latest.kind === "decision") {
    return (
      <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.5, color: "#94949c" }}>{latest.title}</p>
    );
  }

  const inner = (
    <>
      {latest.image && !broken ? (
        // Not `next/image`: the thumbnail is served by another origin entirely, so optimising it
        // would mean declaring a remote pattern for each magazine and proxying their bytes
        // through this site to save nothing. The same reasoning the office plates already carry.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          onError={() => setBroken(true)}
          src={latest.image}
          style={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover" }}
        />
      ) : null}
      <span style={{ display: "block", padding: "8px 10px" }}>
        <span
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontSize: "12px",
            lineHeight: 1.35,
            color: "#f4f4f5"
          }}
        >
          {latest.title}
        </span>
        <span style={{ ...eyebrow, display: "block", marginTop: "4px" }}>
          {latest.url ? new URL(latest.url).host : latest.date}
        </span>
      </span>
    </>
  );

  const frame: CSSProperties = {
    display: "block",
    border: "1px solid #26262b",
    borderRadius: "8px",
    background: "#0e0e12",
    overflow: "hidden"
  };

  return latest.url ? (
    <a href={latest.url} rel="noreferrer" style={frame} target="_blank">
      {inner}
    </a>
  ) : (
    <span style={frame}>{inner}</span>
  );
}

export function WorkflowsRoomView({
  room,
  inset,
  compact,
  onBack
}: {
  room: WorkflowsRoom;
  /** Where the room's own rectangle sits inside the frame, as percentages. */
  inset: { left: string; top: string; width: string; height: string };
  compact: boolean;
  onBack: () => void;
}) {
  return (
    <div
      data-room-view
      style={{
        position: "absolute",
        left: inset.left,
        top: inset.top,
        width: inset.width,
        height: inset.height,
        // Inside the walls, not over them: the room's outline stays the frame of what it holds.
        padding: compact ? "10px" : "18px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: 0,
        ...(compact ? {} : { animation: "wf-fade 220ms ease-out" })
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: "0 0 auto" }}>
        <button
          aria-label="Back to the floor"
          onClick={onBack}
          style={{
            display: "grid",
            placeItems: "center",
            width: "26px",
            height: "26px",
            border: "1px solid #3f3f46",
            borderRadius: "8px",
            background: "#101013",
            color: "#d4d4d8",
            cursor: "pointer",
            flex: "0 0 auto"
          }}
          type="button"
        >
          ←
        </button>
        <span
          id="wf-room-title"
          style={{
            fontSize: compact ? "15px" : "19px",
            fontWeight: 600,
            letterSpacing: "-.02em",
            color: "#f4f4f5",
            outline: "none"
          }}
          tabIndex={-1}
        >
          {room.name}
        </span>
        <span style={{ ...eyebrow, marginLeft: "auto" }}>
          {room.slots.length === 0
            ? "Always open"
            : room.slots.map((slot) => `${String(slot.hour).padStart(2, "0")}:00`).join(" · ")}
        </span>
      </div>

      <div
        data-wheel-exempt
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "grid",
          gap: compact ? "14px" : "18px",
          gridTemplateColumns: compact ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)",
          alignContent: "start"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.5, color: "#d4d4d8" }}>
            {room.purpose}
          </p>
          <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.5, color: "#94949c" }}>
            {room.connects}
          </p>
          <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.5, color: "#94949c" }}>
            {room.operates}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
          {room.slots.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <p style={eyebrow}>Sessions</p>
              {room.slots.map((slot) => (
                <div
                  key={`${slot.kind}-${slot.hour}`}
                  style={{ display: "flex", gap: "10px", alignItems: "baseline" }}
                >
                  <span style={{ fontFamily: MONO, fontSize: "11px", color: "#f4f4f5", flex: "0 0 auto" }}>
                    {String(slot.hour).padStart(2, "0")}:00
                  </span>
                  <span style={{ fontSize: "12px", color: "#94949c", minWidth: 0 }}>{slot.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          {room.latest ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <p style={eyebrow}>Latest</p>
              <LatestCard latest={room.latest} />
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minHeight: 0 }}>
            <p style={eyebrow}>Roles</p>
            {room.roles.length === 0 ? (
              <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.5, color: "#94949c" }}>
                Served by roles that work across the whole company.
              </p>
            ) : (
              room.roles.map((role) => (
                <div key={role.id} style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#f4f4f5",
                      flex: "0 0 auto",
                      minWidth: "58px"
                    }}
                  >
                    {role.id}
                  </span>
                  <span style={{ fontSize: "12px", color: "#94949c", minWidth: 0 }}>{role.title}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
