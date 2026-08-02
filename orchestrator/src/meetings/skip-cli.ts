import path from "node:path";
import { pathToFileURL } from "node:url";
import { MeetingSkipSchema } from "../contracts/meeting-skip.js";
import { stateRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";
import { pragueClockParts } from "./clock.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * Record that a gate turned a meeting slot off, so the calendar can say why.
 *
 * Only a slot that resolved to a real phase is recorded. The inactive daylight-saving variant
 * of a cron is not a skipped meeting, it is a firing that never had one.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const phase = valueAfter(args, "--phase")?.trim();
  const reason = valueAfter(args, "--reason")?.trim();
  if (!phase || phase === "skip" || !reason) {
    console.log(JSON.stringify({ recorded: false }));
    return;
  }
  const now = new Date(valueAfter(args, "--at") ?? Date.now());
  const date = pragueClockParts(now).date;
  const skip = MeetingSkipSchema.parse({
    schemaVersion: "meeting-skip/1",
    date,
    phase,
    reason: reason.slice(0, 240),
    decidedAt: now.toISOString()
  });
  const relative = `meetings/skips/${date}-${phase}.json`;
  await atomicWriteJson(stateRoot, relative, skip);
  console.log(JSON.stringify({ recorded: true, path: `state/${relative}` }));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
