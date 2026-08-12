import { stateRoot } from "../paths.js";
import { articleQueue } from "../mma-files/publish.js";
import { atomicWriteJson, atomicWriteText, readText } from "../state.js";
import { editionQueue } from "./outbox.js";

/**
 * The daily answer to one question: is either magazine still publishing what it has written?
 *
 * Both queues jammed in the same week and neither said so. MMA Files re-sent a package the
 * magazine had already refused, every run, for a week — three finished articles waited behind it
 * and every room reported a success. DNESKAi's edition failed its target build at 03:00 and would
 * have held every edition after it. Each jam had a receipt explaining itself; what nothing had was
 * a reader that looked at the queue as a whole and noticed it was not moving.
 *
 * The parking rules stop one bad package holding the rest. This is the check that says so out
 * loud, because a queue that quietly drops its head is a worse failure than one that stalls: the
 * article is still not published and now nothing is stuck to prove it.
 */

export type QueueVenture = "mma-files" | "caught-up";

export interface QueueHealthEntry {
  label: string;
  packageHash: string;
  /** The day the piece was written for, which is what makes a stalled queue legible. */
  date: string;
  code?: string;
}

export interface VentureQueueHealth {
  venture: QueueVenture;
  waiting: QueueHealthEntry[];
  parked: QueueHealthEntry[];
  oldestWaitingDate: string | null;
  /** Whole days the oldest waiting package has been sitting there, or null when nothing waits. */
  stalledDays: number | null;
  stalled: boolean;
}

export interface QueueHealthReport {
  schemaVersion: "delivery-queue-health/1";
  checkedAt: string;
  date: string;
  ventures: VentureQueueHealth[];
  /** True when at least one venture needs a person, which is what the owner item is raised on. */
  needsOwner: boolean;
}

/**
 * A package written for today has not stalled — it is simply waiting for its delivery step.
 *
 * One whole day is the threshold because both queues ship at most one package per run and the
 * cycle runs several times a day: anything still waiting a day later has missed every run since.
 */
const STALLED_AFTER_DAYS = 1;

function wholeDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function summarize(
  venture: QueueVenture,
  waiting: QueueHealthEntry[],
  parked: QueueHealthEntry[],
  today: string
): VentureQueueHealth {
  const oldestWaitingDate = waiting.map((entry) => entry.date).sort()[0] ?? null;
  const stalledDays = oldestWaitingDate ? wholeDaysBetween(oldestWaitingDate, today) : null;
  return {
    venture,
    waiting,
    parked,
    oldestWaitingDate,
    stalledDays,
    // Parked always needs a person: those bytes are never going to be accepted on their own.
    stalled: parked.length > 0 || (stalledDays ?? 0) > STALLED_AFTER_DAYS
  };
}

async function mmaFilesHealth(root: string, today: string): Promise<VentureQueueHealth> {
  const queue = await articleQueue(root);
  const entry = (item: (typeof queue)[number]): QueueHealthEntry => ({
    label: item.label,
    packageHash: item.packageHash,
    date: item.publishAt.slice(0, 10),
    ...(item.code ? { code: item.code } : {})
  });
  return summarize(
    "mma-files",
    queue.filter((item) => item.state === "pending").map(entry),
    queue.filter((item) => item.state === "parked").map(entry),
    today
  );
}

async function caughtUpHealth(root: string, today: string): Promise<VentureQueueHealth> {
  const queue = await editionQueue(root);
  const entry = (item: (typeof queue)[number]): QueueHealthEntry => ({
    label: `${item.date} ${item.editionStatus}`,
    packageHash: item.packageHash,
    date: item.date,
    ...(item.code ? { code: item.code } : {})
  });
  return summarize(
    "caught-up",
    queue.filter((item) => item.state === "pending").map(entry),
    queue.filter((item) => item.state === "parked").map(entry),
    today
  );
}

export async function buildQueueHealthReport(input: {
  root?: string;
  today: string;
  now?: Date;
}): Promise<QueueHealthReport> {
  const root = input.root ?? stateRoot;
  const ventures = [
    await mmaFilesHealth(root, input.today),
    await caughtUpHealth(root, input.today)
  ];
  return {
    schemaVersion: "delivery-queue-health/1",
    checkedAt: (input.now ?? new Date()).toISOString(),
    date: input.today,
    ventures,
    needsOwner: ventures.some((venture) => venture.stalled)
  };
}

/**
 * The item is raised once and stays until the queue drains, so it must not carry a count.
 *
 * The first version embedded "1 refused and 4 waiting", which was true for about an hour and then
 * described a queue that no longer existed — an owner item that ages into a wrong number is worse
 * than one that sends you to the live figure.
 */
function inboxItem(venture: VentureQueueHealth): string {
  const oldest = venture.parked[0] ?? venture.waiting[0];
  return [
    `- [ ] **DELIVERY-QUEUE-${venture.venture.toUpperCase()}** — the publish queue is not draining.`,
    `  Oldest held item: ${oldest?.label ?? "unknown"}${oldest?.code ? ` (${oldest.code})` : ""}.`,
    "  Live counts are in state/delivery/queue-health/, rewritten every day. A parked package needs",
    "  new bytes rather than another run; its own receipt says what the magazine refused and why.",
    "  [imp:5] [owner:me] [time:30m] [kind:deploy]"
  ].join("\n");
}

/**
 * Raise one item per venture while its queue is stalled, and tick it when the queue drains.
 *
 * Keyed on the venture rather than the date: a stalled queue is one condition that persists, and
 * an item per day per stuck package is how a list stops being read.
 */
async function reconcileInbox(root: string, venture: VentureQueueHealth, today: string): Promise<boolean> {
  const existing = await readText(root, "INBOX.md", "# INBOX\n");
  const open = `- [ ] **DELIVERY-QUEUE-${venture.venture.toUpperCase()}**`;
  if (venture.stalled) {
    if (existing.includes(open)) return false;
    await atomicWriteText(root, "INBOX.md", `${existing.trimEnd()}\n\n${inboxItem(venture)}\n`);
    return true;
  }
  if (!existing.includes(open)) return false;
  await atomicWriteText(root, "INBOX.md", existing.replace(
    open,
    `- [x] **DELIVERY-QUEUE-${venture.venture.toUpperCase()}** — Resolved ${today}: the queue drained. Original report:`
  ));
  return true;
}

/**
 * The daily check. Writes the day's record whatever it finds — a draining queue is a result, and
 * a check that only leaves a trace when it fails cannot be told from one that never ran.
 */
export async function runQueueHealthCheck(input: {
  root?: string;
  today: string;
  now?: Date;
}): Promise<{ report: QueueHealthReport; artifacts: string[] }> {
  const root = input.root ?? stateRoot;
  const report = await buildQueueHealthReport(input);
  const recordPath = `delivery/queue-health/${input.today}.json`;
  await atomicWriteJson(root, recordPath, report);
  const artifacts = [recordPath];
  for (const venture of report.ventures) {
    if (await reconcileInbox(root, venture, input.today)) artifacts.push("INBOX.md");
  }
  return { report, artifacts: [...new Set(artifacts)] };
}
