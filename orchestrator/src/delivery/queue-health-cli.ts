import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, stateRoot } from "../paths.js";
import { pruneSocialAssets } from "../social/media/retention.js";
import { pruneSocialQueue } from "../social/queue-retention.js";
import { pruneWebDevSignalPanels } from "../ventures/webdev-signal/panel-retention.js";
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
  const today = valueAfter(args, "--today") ?? pragueToday();
  const { report, artifacts } = await runQueueHealthCheck({ today });
  // The same daily step ends social frames past their retention window (quorum#570). It sits here
  // because this step already runs on every non-dry cycle and commits what it writes. A failed
  // prune costs its own line and never the queue record above it.
  const retention = await pruneSocialAssets({ repoRoot, stateRoot, today }).catch((error: unknown) => {
    console.error(`social frame retention failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  // Closed queue items and their events leave on the same clock, so neither directory reaches the
  // 2,000 files the Queue reads. Receipts under state/social/posts stay.
  const queueRetention = await pruneSocialQueue({ stateRoot, today }).catch((error: unknown) => {
    console.error(`social queue retention failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  // WebDev Signal's rendered panels leave after four weeks; the render receipts keep their hashes.
  const panels = await pruneWebDevSignalPanels({ stateRoot, today }).catch((error: unknown) => {
    console.error(`WebDev Signal panel retention failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  for (const venture of report.ventures) {
    const line = `${venture.venture}: ${venture.waiting.length} waiting, ${venture.parked.length} parked`;
    console.log(venture.stalled ? `${line} — NOT DRAINING` : line);
  }
  for (const entry of report.deploys) {
    const state = entry.live === null ? "not checked" : entry.live ? "serving" : `NOT BUILT (${entry.status ?? "unreachable"})`;
    console.log(`${entry.venture}: ${state}${entry.expected ? ` — newest delivered ${entry.expected}` : ""}`);
  }
  if (retention) {
    console.log(`social frames: ${retention.record.removed.length} pruned before ${retention.record.keepFrom}, ${retention.record.keptCount} kept`);
  }
  if (queueRetention) {
    const { removedItems, removedEvents, keepFrom, keptItems, heldByLink } = queueRetention.record;
    console.log(`social queue: ${removedItems.length} closed items and ${removedEvents.length} events pruned before ${keepFrom}, ${keptItems} items kept, ${heldByLink} held by a link`);
  }
  if (panels) {
    console.log(`WebDev Signal panels: ${panels.removed.length} renders pruned before ${panels.keepFrom}, ${panels.kept} kept, ${panels.unmanaged} unmanaged`);
  }
  console.log(JSON.stringify({ needsOwner: report.needsOwner, artifacts: [...artifacts, ...(retention?.artifacts ?? []), ...(queueRetention?.artifacts ?? [])] }));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
