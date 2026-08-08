"use client";

import type { CSSProperties, ReactNode } from "react";
import type { WorkflowsRoom } from "@/lib/office-workflows-model";

/**
 * One room, opened.
 *
 * Pressing a room on the plan replaces the drawing with this: the room stretched to the whole
 * section, carrying who stands in it, when it sits, and what it is for. It is not an overlay —
 * the plan is gone while it is open — because a room at full width is the point, and a panel
 * floating over a drawing of itself would be two pictures of the same thing.
 *
 * Everything here was resolved on the server. The roles come from `ventures` in the agent
 * registry, so a room with no roles assigned to it says so rather than borrowing someone else's.
 */

const MONO = "var(--font-ibm-plex-mono), monospace";

const eyebrow: CSSProperties = {
  margin: 0,
  fontFamily: MONO,
  fontSize: "10.5px",
  textTransform: "uppercase",
  letterSpacing: ".14em",
  color: "#94949c"
};

const body: CSSProperties = { margin: 0, fontSize: "13.5px", lineHeight: 1.55, color: "#d4d4d8" };

export function WorkflowsRoomView({
  room,
  compact,
  panel,
  panelTitle,
  onBack
}: {
  room: WorkflowsRoom;
  /** Below 1024px the room is an ordinary block in the page's flow, not a filled box. */
  compact: boolean;
  /** The room's own depth-3 panel, where it has one — folded in rather than stacked on top. */
  panel?: ReactNode;
  panelTitle?: string;
  onBack: () => void;
}) {
  const hours = room.slots.map((slot) => slot);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        ...(compact ? {} : { height: "100%", minHeight: 0 }),
        border: `1px solid ${room.color}`,
        borderRadius: "14px",
        background: "rgba(11,11,13,.94)",
        overflow: "hidden"
      }}
      data-room-view
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          padding: "14px 20px",
          borderBottom: "1px solid #26262b"
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            border: "1px solid #3f3f46",
            borderRadius: "9px",
            background: "#101013",
            padding: "6px 11px",
            fontFamily: MONO,
            fontSize: "10.5px",
            textTransform: "uppercase",
            letterSpacing: ".1em",
            color: "#d4d4d8",
            cursor: "pointer"
          }}
          type="button"
        >
          ← The floor
        </button>
        <span style={{ display: "flex", alignItems: "baseline", gap: "12px", minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{ width: "10px", height: "10px", borderRadius: "2px", background: room.color, flex: "0 0 auto" }}
          />
          <span
            id="wf-room-title"
            style={{ fontSize: "21px", fontWeight: 600, letterSpacing: "-.02em", color: "#f4f4f5", outline: "none" }}
            tabIndex={-1}
          >
            {room.name}
          </span>
        </span>
        <span style={{ ...eyebrow, marginLeft: "auto", textAlign: "right" }}>
          {hours.length === 0
            ? "Always open · no session"
            : hours.map((slot) => `${String(slot.hour).padStart(2, "0")}:00`).join(" · ")}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 3fr) minmax(0, 2fr)",
          gap: "1px",
          background: "#1e1e22",
          alignContent: "start"
        }}
        data-wheel-exempt
      >
        <div style={{ background: "#0b0b0d", padding: "20px 22px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={eyebrow}>What it does</p>
            <p style={body}>{room.purpose}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={eyebrow}>What it connects to</p>
            <p style={body}>{room.connects}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={eyebrow}>How it operates</p>
            <p style={body}>{room.operates}</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={eyebrow}>{hours.length === 0 ? "Sessions" : `Sessions · ${hours.length}`}</p>
            {hours.length === 0 ? (
              <p style={body}>
                This room holds no session. Its machinery runs the moment something is handed to
                it, which is why the plan draws it lit at every hour.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "#1e1e22" }}>
                {hours.map((slot) => (
                  <div
                    key={`${slot.kind}-${slot.hour}`}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "14px",
                      background: "#0e0e12",
                      padding: "9px 12px"
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: "12px", color: "#f4f4f5", flex: "0 0 auto" }}>
                      {String(slot.hour).padStart(2, "0")}:00
                    </span>
                    <span style={{ fontSize: "12.5px", color: "#d4d4d8", minWidth: 0 }}>{slot.label}</span>
                    <span style={{ ...eyebrow, marginLeft: "auto", flex: "0 0 auto" }}>
                      {slot.reason ? "recorded" : "no record yet"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ background: "#0b0b0d", padding: "20px 22px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={eyebrow}>
            {room.roles.length === 0 ? "Roles" : `Roles · ${room.roles.length}`}
          </p>
          {room.roles.length === 0 ? (
            <p style={body}>
              No role is assigned to this room on the roster. The work here is done by roles that
              serve the whole company rather than this room alone.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "#1e1e22" }}>
              {room.roles.map((role) => (
                <div key={role.id} style={{ background: "#0e0e12", padding: "9px 12px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                    <span style={{ fontFamily: MONO, fontSize: "12px", fontWeight: 600, color: "#f4f4f5" }}>
                      {role.id}
                    </span>
                    <span style={{ ...eyebrow, marginLeft: "auto" }}>{role.department}</span>
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: "12px", lineHeight: 1.45, color: "#94949c" }}>
                    {role.title}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p style={{ ...eyebrow, marginTop: "auto" }}>They are software roles, not people.</p>
        </div>

        {/*
          The room's mechanism, folded in rather than floating over it. Four rooms have one; the
          rest end at the roster. Opening a panel on top of a room that is already the whole
          section would be a second picture of the same place.
        */}
        {panel ? (
          <div style={{ gridColumn: "1 / -1", background: "#0b0b0d", padding: "20px 22px 6px" }}>
            <p style={eyebrow}>{panelTitle}</p>
          </div>
        ) : null}
        {panel ? (
          <div style={{ gridColumn: "1 / -1", display: "grid", gap: "1px", background: "#1e1e22" }}>
            {panel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
