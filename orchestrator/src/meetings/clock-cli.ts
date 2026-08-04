import { resolveCronDelivery, resolveManualPhase, resolveScheduledPhase } from "./clock.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * What the caller should do about a firing, as one line of JSON.
 *
 * `phase` is the only field the plain-text form ever carried, and it still answers the same
 * question: which room to open, or "skip". What it could not carry is *why* it said skip, and
 * the two reasons need opposite handling. An inactive daylight-saving cron has no meeting behind
 * it and must leave nothing. A cron GitHub delivered past the window does have one, and leaving
 * nothing for it is a slot that goes red with no explanation — a live risk, not a theoretical
 * one: the worst delivery seen is 3h20m, on 3 August, against a six-hour window.
 */
interface ResolvedFiring {
  phase: string;
  outcome: "meeting" | "no-meeting" | "beyond-window";
  /** The slot the firing belongs to, named even where no room can be opened for it. */
  slot?: string;
  /** Present only when a slot is owed a stated reason. */
  reason?: string;
}

function resolveFiring(cron: string, at: Date): ResolvedFiring {
  const delivery = resolveCronDelivery(cron, at);
  if (delivery.outcome === "meeting") {
    return { phase: delivery.phase, outcome: "meeting", slot: delivery.phase };
  }
  if (delivery.outcome === "no-meeting") return { phase: "skip", outcome: "no-meeting" };
  const hours = Math.floor(delivery.latenessMinutes / 60);
  const minutes = delivery.latenessMinutes % 60;
  return {
    phase: "skip",
    outcome: "beyond-window",
    slot: delivery.phase,
    reason: `GitHub delivered this cron ${hours}h${String(minutes).padStart(2, "0")}m late, past the window in which a run can still open the room.`
  };
}

const args = process.argv.slice(2);
if (args.includes("--scheduled")) {
  const at = new Date(valueAfter(args, "--at") ?? Date.now());
  // The cron that fired names the meeting outright, so a queued run still holds the one it
  // was scheduled for. Its answer is final in both directions: no phase means either the firing
  // belongs to the inactive daylight-saving variant of a slot and there is genuinely no meeting,
  // or it arrived past the delivery window; falling back to the wall clock in either case would
  // hand the run its neighbour instead — which is the failure being removed, not a safety net.
  // The clock is only for a caller with no cron, such as a manual invocation.
  const cron = valueAfter(args, "--cron")?.trim();
  if (cron) {
    const firing = resolveFiring(cron, at);
    console.log(args.includes("--json") ? JSON.stringify(firing) : firing.phase);
  } else {
    let phase = "skip";
    try {
      phase = resolveScheduledPhase(at);
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith("No scheduled phase"))) throw error;
    }
    const firing: ResolvedFiring = phase === "skip"
      ? { phase, outcome: "no-meeting" }
      : { phase, outcome: "meeting", slot: phase };
    console.log(args.includes("--json") ? JSON.stringify(firing) : firing.phase);
  }
} else {
  console.log(resolveManualPhase(valueAfter(args, "--phase") ?? ""));
}
