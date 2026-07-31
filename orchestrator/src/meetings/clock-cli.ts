import { resolveManualPhase, resolveScheduledPhase } from "./clock.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
if (args.includes("--scheduled")) {
  try {
    console.log(resolveScheduledPhase(new Date(valueAfter(args, "--at") ?? Date.now())));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No scheduled phase")) console.log("skip");
    else throw error;
  }
} else {
  console.log(resolveManualPhase(valueAfter(args, "--phase") ?? ""));
}
