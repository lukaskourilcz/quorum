import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  BOARDROOM_TIME_ZONE,
  formatRoomClock,
  formatRoomDate,
  roomIdForStandup,
  sortBoardroomsNewestFirst
} from "@/components/room-timeline";
import { formatPhaseLabel } from "@/components/standup-countdown-model";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import type { PublicStandup } from "@/data/fixtures";

export function BoardroomArchive({
  records
}: {
  records: readonly PublicStandup[];
}) {
  const rooms = sortBoardroomsNewestFirst(records);

  return (
    <section
      aria-labelledby="room-archive-title"
      className="border-b border-[var(--border)] bg-[var(--surface)]"
      id="room-archive"
    >
      <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-24">
        <div className="grid gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <p className="mono-label text-[var(--accent)]">Meeting archive</p>
            <h2
              className="mt-5 text-[2.5rem] font-semibold leading-none tracking-[-0.055em]"
              id="room-archive-title"
            >
              Every meeting, newest first.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--fog)]">
              Meetings show their date, start time and place in the daily
              schedule. Open any saved discussion from the list.
            </p>
          </div>
          <p className="font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)] md:col-span-4 md:text-right">
            {rooms.length} {rooms.length === 1 ? "meeting" : "meetings"} ·{" "}
            {BOARDROOM_TIME_ZONE}
          </p>
        </div>

        <div className="mt-9 rounded-[1rem] border border-[var(--border)] bg-[var(--card)] px-5 md:px-7">
          <Table className="min-w-[43rem]">
            <caption className="sr-only">
              All BoardlessAI meetings, newest first
            </caption>
            <thead>
              <tr>
                <TableHead>Date and start</TableHead>
                <TableHead>Meeting and time</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Record</TableHead>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => {
                const participants = room.participants.filter(
                  (participant) => participant.participated
                ).length;
                const roomId = roomIdForStandup(room);
                const openedAt = room.roomTranscript.openedAt;

                return (
                  <tr key={roomId}>
                    <TableCell>
                      <time dateTime={openedAt}>
                        <span className="block font-semibold">
                          {formatRoomDate(openedAt)}
                        </span>
                        <span className="mt-1 block font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--fog)]">
                          {formatRoomClock(openedAt)} ·{" "}
                          {BOARDROOM_TIME_ZONE}
                        </span>
                      </time>
                    </TableCell>
                    <TableCell>
                      <span className="block font-mono text-xs font-semibold">
                        {roomId}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge>{formatPhaseLabel(room.phase)}</Badge>
                        {room.fixture ? <Badge>Test example</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge tone="warning">{room.status}</Badge>
                      <span className="mt-2 block text-xs leading-5 text-[var(--fog)]">
                        {participants} roles ·{" "}
                        {room.roomTranscript.turns.length} messages
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        aria-label={`Open ${roomId} from ${formatRoomDate(openedAt)}`}
                        className={buttonVariants({
                          size: "small",
                          variant: "secondary"
                        })}
                        href={`/standups/${room.id}/room`}
                      >
                        Watch meeting
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </div>
    </section>
  );
}
