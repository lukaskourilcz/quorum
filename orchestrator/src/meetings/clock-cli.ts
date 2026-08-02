import { resolveCronPhase, resolveManualPhase, resolveScheduledPhase } from "./clock.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
if (args.includes("--scheduled")) {
  const at = new Date(valueAfter(args, "--at") ?? Date.now());
  // The cron that fired names the meeting outright, so a queued run still holds the one it
  // was scheduled for. Its answer is final in both directions: null means the firing belongs
  // to the inactive daylight-saving variant of a slot and there is genuinely no meeting, and
  // falling back to the wall clock there would hand the run its neighbour instead — which is
  // the failure being removed, not a safety net. The clock is only for a caller with no cron,
  // such as a manual invocation.
  const cron = valueAfter(args, "--cron")?.trim();
  if (cron) {
    console.log(resolveCronPhase(cron, at) ?? "skip");
  } else {
    try {
      console.log(resolveScheduledPhase(at));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("No scheduled phase")) console.log("skip");
      else throw error;
    }
  }
} else {
  console.log(resolveManualPhase(valueAfter(args, "--phase") ?? ""));
}
