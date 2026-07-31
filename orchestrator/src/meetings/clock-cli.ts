import { resolveManualPhase, resolveScheduledPhase } from "./clock.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const phase = args.includes("--scheduled")
  ? resolveScheduledPhase(new Date(valueAfter(args, "--at") ?? Date.now()))
  : resolveManualPhase(valueAfter(args, "--phase") ?? "");
console.log(phase);
