"use client";

import { Dialog } from "@/components/ui/dialog";
import { ROOMS, WorkflowsPlan } from "@/components/office/workflows-plan";
import type { OfficeWorkflows, WorkflowsRoom } from "@/lib/office-workflows";
import type { WorkflowsOutput } from "@/lib/office-workflows-model";

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
 * The drawing at the top of the dialog is the plan itself, cropped to this room's walls — the same
 * component, the same furniture, the same lights, given a viewBox of the room's own rectangle and
 * told to render as a picture. A second illustration of a room is a second thing that can disagree
 * with the first; this one cannot, because it is the first.
 */

/** The room's rectangle, with a margin of wall, as a viewBox in the plan's own coordinates. */
function cropTo(roomKey: string): string | null {
  const room = ROOMS.find((entry) => entry.key === roomKey);
  if (!room) return null;
  // Enough to show the walls this room shares with its neighbours and the corridor at its door,
  // which is what makes a crop read as part of a floor rather than as a floating rectangle.
  const margin = 34;
  return [room.x - margin, room.y - margin, room.width + margin * 2, room.height + margin * 2].join(" ");
}

/**
 * The newest thing a room produced, drawn the way a link preview draws it.
 *
 * For the two magazine rooms that is the card a reader sees when the article is shared: the
 * article's own picture, its headline and where it went. The picture is the delivered package's
 * own thumbnail — the same bytes the magazine serves as its share image — so this is a preview of
 * the real card rather than an illustration of one.
 */
function LatestOutput({ latest }: { latest: WorkflowsOutput }) {
  const host = (() => {
    if (!latest.url) return null;
    try {
      return new URL(latest.url).host.replace(/^www\./u, "");
    } catch {
      return null;
    }
  })();
  const inner = (
    <>
      {latest.image ? (
        // 1200×630 is the ratio every platform crops a share card to, so the preview is framed
        // the way the post will be rather than the way the file happens to be.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="aspect-[1200/630] w-full border-b border-[#26262b] object-cover"
          data-latest-image
          src={latest.image}
        />
      ) : null}
      <span className="block px-3.5 py-3">
        {host ? (
          <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">{host}</span>
        ) : null}
        <span className="mt-1 block text-[13.5px] font-semibold leading-[1.4] text-[#f4f4f5]">{latest.title}</span>
        <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">
          {latest.kind === "article" ? "Article" : "Decision"} · {latest.date}
          {latest.url ? "" : " · no address recorded"}
        </span>
      </span>
    </>
  );
  // Bounded in width rather than cropped shorter: the card keeps the 1200×630 framing a platform
  // will give it, and a narrower card is simply a smaller true preview instead of a different one.
  const frame = "block max-w-[340px] overflow-hidden rounded-[10px] border border-[#26262b] bg-[#0c0c0f]";
  return latest.url ? (
    <a
      className={`${frame} transition-colors hover:border-[#3f3f46]`}
      data-latest-card
      href={latest.url}
      rel="noreferrer"
      target="_blank"
    >
      {inner}
    </a>
  ) : (
    <span className={frame} data-latest-card>{inner}</span>
  );
}

export function WorkflowsRoomDialog({
  room,
  data,
  onClose
}: {
  room: WorkflowsRoom | null;
  data: OfficeWorkflows;
  onClose: () => void;
}) {
  const crop = room ? cropTo(room.key) : null;
  return (
    <Dialog
      eyebrow="Facilities"
      onClose={onClose}
      open={room !== null}
      title={room?.name ?? ""}
    >
      {room ? (
        <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="min-w-0">
            {/*
              A fixed frame, letterboxed. The crops are different shapes — FightAIQ's room is tall
              and narrow, Board HQ's is wide — and letting each set its own height made the dialog
              scroll on the narrow ones. The plan keeps its aspect inside the frame; the frame keeps
              the dialog to one screen.
            */}
            <div
              className="h-[190px] overflow-hidden rounded-[10px] border border-[#26262b] bg-[#0b0b0d] md:h-[230px]"
              data-room-fragment
            >
              {crop ? (
                <WorkflowsPlan
                  animate={false}
                  beat={null}
                  compact={false}
                  fill
                  inert
                  legs={[]}
                  litRoom={room.key}
                  mode="ambient"
                  notes={data.slots.map(() => "none" as const)}
                  onOpen={() => undefined}
                  rooms={data.rooms}
                  slots={data.slots}
                  viewBox={crop}
                  workshopWorking={room.key === "carousel-studio"}
                />
              ) : null}
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">
              The room on the floor plan
            </p>
          </div>

          <div className={`grid min-w-0 ${room.key === "company" ? "gap-3" : "gap-4"}`}>
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
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">Latest output</p>
              {room.latest ? (
                <LatestOutput latest={room.latest} />
              ) : (
                // Said rather than left blank: a room that has produced nothing has produced
                // nothing, and an empty panel reads as a page that failed to load.
                <p className="text-[13.5px] leading-[1.5] text-[#94949c]">Nothing recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
