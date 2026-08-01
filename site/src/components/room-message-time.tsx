import type { HTMLAttributes } from "react";
import {
  formatRoomDateTime,
  type RoomTurnTiming
} from "@/components/room-timeline";
import { cn } from "@/lib/utils";

export function RoomMessageTime({
  className,
  timing,
  ...props
}: HTMLAttributes<HTMLTimeElement> & {
  timing: RoomTurnTiming;
}) {
  return (
    <time
      className={cn(
        "font-mono text-[0.65625rem] uppercase tracking-[0.08em] text-[var(--fog)]",
        className
      )}
      dateTime={timing.iso}
      {...props}
    >
      Sent {formatRoomDateTime(timing.iso)} ·{" "}
      {timing.source === "recorded"
        ? "Recorded send time"
        : "Test timeline"}
    </time>
  );
}
