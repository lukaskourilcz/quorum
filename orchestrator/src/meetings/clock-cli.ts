import { resolveCronPhase, resolveManualPhase, resolveScheduledPhase } from "./clock.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
if (args.includes("--scheduled")) {
  const at = new Date(valueAfter(args, "--at") ?? Date.now());
  // Prefer the cron that fired. It names the meeting outright, so a queued run still holds
  // the one it was scheduled for; the wall clock is the fallback for a caller that has no
  // cron to hand, and it is the reading that lost seven of fourteen meetings on 2 August.
  const cron = valueAfter(args, "--cron");
  const fromCron = cron ? resolveCronPhase(cron, at) : null;
  if (fromCron) {
    console.log(fromCron);
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
