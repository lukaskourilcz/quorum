"use client";

import { Dialog } from "@/components/ui/dialog";
import { PLAN_HEIGHT, PLAN_WIDTH, ROOMS } from "@/components/office/workflows-plan";
import type { WorkflowsRoom } from "@/lib/office-workflows";

/**
 * A room, opened as a dialog rather than by zooming the drawing into it.
 *
 * Clicking a room used to reframe the whole floor plan around it: the SVG's viewBox animated to
 * the room's rectangle and the content was laid out over the top, at whatever size that rectangle
 * happened to be. Two rooms are narrow enough that the text had to reach out past their walls to
 * find a readable measure, and the reader lost the floor they were standing on in the process. A
 * dialog is the thing that was being approximated: the plan stays whole behind it, the content
 * gets a shape of its own, and the reader keeps their place.
 *
 * The fragment at the top is the answer to what the zoom was actually for — *where is this room*.
 * The whole floor is drawn small and dim; this room is drawn in its own colour. That is one
 * glance, and it survives at any size the dialog takes.
 */

function PlanFragment({ roomKey, color }: { roomKey: string; color: string }) {
  return (
    <svg
      aria-hidden="true"
      className="h-auto w-full"
      data-room-fragment
      viewBox={`160 60 ${PLAN_WIDTH - 120} ${PLAN_HEIGHT - 40}`}
    >
      {ROOMS.map((room) => {
        const self = room.key === roomKey;
        return (
          <rect
            fill={self ? color : "#141418"}
            fillOpacity={self ? 0.22 : 1}
            height={room.height}
            key={room.key}
            rx={10}
            stroke={self ? color : "#2a2a30"}
            strokeWidth={self ? 8 : 3}
            width={room.width}
            x={room.x}
            y={room.y}
          />
        );
      })}
    </svg>
  );
}

export function WorkflowsRoomDialog({ room, onClose }: { room: WorkflowsRoom | null; onClose: () => void }) {
  return (
    <Dialog
      eyebrow="Facilities"
      onClose={onClose}
      open={room !== null}
      title={room?.name ?? ""}
    >
      {room ? (
        <div className="grid gap-5 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="rounded-[10px] border border-[#26262b] bg-[#0c0c0f] p-3">
              <PlanFragment color={room.color} roomKey={room.key} />
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">
              Where it sits on the floor
            </p>
          </div>

          <div className="grid min-w-0 gap-4">
            <p className="text-[14.5px] leading-[1.55] text-[#d4d4d8]">{room.purpose}</p>
            <p className="text-[13.5px] leading-[1.55] text-[#94949c]">{room.operates}</p>
            <p className="text-[13.5px] leading-[1.55] text-[#94949c]">{room.connects}</p>

            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">
                {room.roles.length === 0 ? "No role stands here" : `${room.roles.length} ${room.roles.length === 1 ? "role" : "roles"}`}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {room.roles.map((role) => (
                  <li
                    className="rounded-full border border-[#2e2e34] bg-[#0e0e11] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#a1a1aa]"
                    key={role.id}
                  >
                    {role.id}
                    <span className="ml-1.5 text-[#6d6d76]">{role.title}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">Latest output</p>
              {room.latest ? (
                <p className="mt-1.5 text-[13.5px] leading-[1.5] text-[#d4d4d8]">
                  {room.latest.url ? (
                    <a
                      className="underline decoration-[#3f3f46] underline-offset-4 hover:decoration-[#a1a1aa]"
                      href={room.latest.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {room.latest.title}
                    </a>
                  ) : (
                    room.latest.title
                  )}
                  <span className="text-[#94949c]"> — {room.latest.kind === "article" ? "article" : "decision"}, {room.latest.date}</span>
                </p>
              ) : (
                // Said rather than left blank: a room that has produced nothing has produced
                // nothing, and an empty panel reads as a page that failed to load.
                <p className="mt-1.5 text-[13.5px] leading-[1.5] text-[#94949c]">
                  Nothing recorded yet.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
