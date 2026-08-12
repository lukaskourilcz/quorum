import path from "node:path";
import { pathToFileURL } from "node:url";
import { runQueueHealthCheck } from "./queue-health.js";

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function pragueToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
}

/**
 * Runs every day, whatever the council decided, because the queues jam on days nothing is written
 * as readily as on days something is. Exits 0 even when a queue is stalled: the owner item and the
 * day's record are the signal, and failing the run would only bury them under a red step.
 */
async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const args = raw[0] === "--" ? raw.slice(1) : raw;
  const { report, artifacts } = await runQueueHealthCheck({ today: valueAfter(args, "--today") ?? pragueToday() });
  for (const venture of report.ventures) {
    const line = `${venture.venture}: ${venture.waiting.length} waiting, ${venture.parked.length} parked`;
    console.log(venture.stalled ? `${line} — NOT DRAINING` : line);
  }
  console.log(JSON.stringify({ needsOwner: report.needsOwner, artifacts }));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
