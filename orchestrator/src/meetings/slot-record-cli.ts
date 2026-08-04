import path from "node:path";
import { pathToFileURL } from "node:url";
import { stateRoot } from "../paths.js";
import { ScheduledPhaseSchema } from "../types.js";
import { pragueClockParts } from "./clock.js";
import { findSlotRecord, slotRecordPath } from "./slot-record.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * Answer, as one line of JSON, whether this slot already ran today in Prague.
 *
 * The workflow asks before it spends anything, so a slot that both schedules fired for ends the
 * second run as a green no-op instead of paying for the same meeting twice. `runCycle` asks the
 * same question through the same function, so the two can never disagree; this exists so the
 * answer is available before the release gate rather than only after it.
 *
 * A phase this repository does not schedule — anything outside ScheduledPhase, including
 * "founding" and the literal "skip" the mode step uses — is reported as not recorded rather than
 * refused. It claims no slot, so there is no second firing of it to guard against.
 *
 * `path` is emitted either way: when `recorded` is true it is the record that was found, and when
 * it is false it is the path that was looked for. The caller needs the second form because this
 * only sees the checkout it runs in, and a queued run's checkout can predate the commit it is
 * looking for — so the workflow takes this path and asks the branch tip about it as well.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const phase = ScheduledPhaseSchema.safeParse(valueAfter(args, "--phase")?.trim());
  if (!phase.success) {
    console.log(JSON.stringify({ recorded: false }));
    return;
  }
  const now = new Date(valueAfter(args, "--at") ?? Date.now());
  const relative = await findSlotRecord(stateRoot, phase.data, now);
  console.log(
    JSON.stringify({
      recorded: relative !== null,
      phase: phase.data,
      path: `state/${relative ?? slotRecordPath(phase.data, pragueClockParts(now).date)}`
    })
  );
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
