import { stateRoot } from "../paths.js";
import { articleQueue } from "../mma-files/publish.js";
import { surveyRetirableArticles } from "../mma-files/retire.js";
import { atomicWriteJson, atomicWriteText, readText } from "../state.js";
import { deployIsBehind, readDeployFreshness, type DeployFreshness, type DeployProbe } from "./deploy-freshness.js";
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

/**
 * What a parked package is actually waiting for.
 *
 * "Parked" answered one question — the magazine refused these bytes — and left the useful one
 * unasked: will anything ever clear it? A package the queue can still retry is never parked in
 * the first place, so parked has exactly two answers. `retire` is superseded by a sibling that
 * did reach readers, and a scheduled step ends it at $0 with a receipt. `owner` is the one that
 * will still be here tomorrow whatever anybody runs.
 *
 * Raising the owner item on both is what made a queue that was about to drain itself look
 * identical to a jammed one for the eight packages of #464.
 */
export type ParkedDisposition = "retire" | "owner";

export interface QueueHealthEntry {
  label: string;
  packageHash: string;
  /** The day the piece was written for, which is what makes a stalled queue legible. */
  date: string;
  code?: string;
  /** Set on parked entries only: what would have to happen for this one to leave the queue. */
  disposition?: ParkedDisposition;
  /** Present when the disposition is `retire`: the package that reached readers instead. */
  supersededBy?: string;
}

export interface VentureQueueHealth {
  venture: QueueVenture;
  waiting: QueueHealthEntry[];
  parked: QueueHealthEntry[];
  oldestWaitingDate: string | null;
  /** Whole days the oldest waiting package has been sitting there, or null when nothing waits. */
  stalledDays: number | null;
  stalled: boolean;
  /** Parked packages that no run will ever clear. These, and only these, are the owner's. */
  neverDrains: QueueHealthEntry[];
}

export interface QueueHealthReport {
  schemaVersion: "delivery-queue-health/1";
  checkedAt: string;
  date: string;
  ventures: VentureQueueHealth[];
  /**
   * Whether each magazine is serving what we last delivered to it.
   *
   * The queues above answer "did we send it". This answers "can a reader open it", which is a
   * different question and the one that went unasked on 12 August: the commit was on main, the
   * gate was green, the host reported no errors, and no build was ever triggered.
   */
  deploys: DeployFreshness[];
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
  const neverDrains = parked.filter((entry) => entry.disposition === "owner");
  return {
    venture,
    waiting,
    parked,
    oldestWaitingDate,
    stalledDays,
    // Only a package nothing will clear is a stall. A retryable park drains on the next run and a
    // superseded one ends at the next retirement step, and calling either a stall raised an owner
    // item for work already scheduled — which is how six packages the retirement step was about to
    // end read as a jam that needed a person.
    stalled: neverDrains.length > 0 || (stalledDays ?? 0) > STALLED_AFTER_DAYS,
    neverDrains
  };
}

async function mmaFilesHealth(root: string, today: string): Promise<VentureQueueHealth> {
  const [queue, survey] = await Promise.all([articleQueue(root), surveyRetirableArticles(root)]);
  // The retirement survey already answers "will this one ever be accepted", and it answers it the
  // expensive way — by finding the delivered sibling that took the slug. Asking it here rather
  // than re-deriving the same rule is what keeps the two from disagreeing about the same package.
  const retirable = new Map(survey.retirable.map((item) => [item.packageHash, item]));
  const entry = (item: (typeof queue)[number]): QueueHealthEntry => ({
    label: item.label,
    packageHash: item.packageHash,
    date: item.publishAt.slice(0, 10),
    ...(item.code ? { code: item.code } : {})
  });
  const parkedEntry = (item: (typeof queue)[number]): QueueHealthEntry => {
    const superseding = retirable.get(item.packageHash);
    return {
      ...entry(item),
      disposition: superseding ? "retire" : "owner",
      ...(superseding ? { supersededBy: superseding.supersededBy.packageHash } : {})
    };
  };
  return summarize(
    "mma-files",
    queue.filter((item) => item.state === "pending").map(entry),
    queue.filter((item) => item.state === "parked").map(parkedEntry),
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
  // A "no edition today" notice for a day that has passed ends on the next delivery run, whatever
  // verdict it carries: `supersedeStaleNoEdition` writes its terminal receipt and removes the
  // file. So it is already scheduled to leave, and counting it as a jam sends the owner to a
  // package that will be gone before they open it.
  const parkedEntry = (item: (typeof queue)[number]): QueueHealthEntry => ({
    ...entry(item),
    disposition: item.editionStatus === "no_edition" && item.date < today ? "retire" : "owner"
  });
  return summarize(
    "caught-up",
    queue.filter((item) => item.state === "pending").map(entry),
    queue.filter((item) => item.state === "parked").map(parkedEntry),
    today
  );
}

export async function buildQueueHealthReport(input: {
  root?: string;
  today: string;
  now?: Date;
  probe?: DeployProbe;
}): Promise<QueueHealthReport> {
  const root = input.root ?? stateRoot;
  const ventures = [
    await mmaFilesHealth(root, input.today),
    await caughtUpHealth(root, input.today)
  ];
  const deploys = await readDeployFreshness({ root, ...(input.probe ? { probe: input.probe } : {}) });
  return {
    schemaVersion: "delivery-queue-health/1",
    checkedAt: (input.now ?? new Date()).toISOString(),
    date: input.today,
    ventures,
    deploys,
    needsOwner: ventures.some((venture) => venture.stalled) || deploys.some(deployIsBehind)
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
  const oldest = venture.neverDrains[0] ?? venture.waiting[0];
  return [
    `- [ ] **DELIVERY-QUEUE-${venture.venture.toUpperCase()}** — the publish queue is not draining.`,
    `  Oldest held item: ${oldest?.label ?? "unknown"}${oldest?.code ? ` (${oldest.code})` : ""}.`,
    "  Live counts are in state/delivery/queue-health/, rewritten every day. Items listed under",
    "  neverDrains need new bytes rather than another run; their own receipts say what the magazine",
    "  refused and why. Anything parked and not listed there is already scheduled to end.",
    "  [imp:5] [owner:me] [time:30m] [kind:deploy]"
  ].join("\n");
}

/**
 * The owner item for a magazine whose site is not serving what we delivered.
 *
 * Deliberately separate from the queue item: a stalled queue means we have not sent something, and
 * this means we sent it and nobody built it. The same word for both would send the owner to the
 * receipts, which in this case all say the delivery worked — and they are right.
 */
function deployInboxItem(entry: DeployFreshness): string {
  return [
    `- [ ] **DELIVERY-NOT-BUILT-${entry.venture.toUpperCase()}** — delivered but not being served.`,
    `  ${entry.url} answers ${entry.status ?? "nothing"}, so the host has not rebuilt since ${entry.expected} landed on main.`,
    "  Nothing is wrong with the package: the commit is on main and its gate was green. This is the",
    "  build that never ran. An empty commit to the magazine's main triggers one; if that is what it",
    "  takes twice, the host's git integration is the thing to look at.",
    "  [imp:5] [owner:me] [time:15m] [kind:deploy]"
  ].join("\n");
}

async function reconcileDeployInbox(root: string, entry: DeployFreshness, today: string): Promise<boolean> {
  const existing = await readText(root, "INBOX.md", "# INBOX\n");
  const open = `- [ ] **DELIVERY-NOT-BUILT-${entry.venture.toUpperCase()}**`;
  if (deployIsBehind(entry)) {
    if (existing.includes(open)) return false;
    await atomicWriteText(root, "INBOX.md", `${existing.trimEnd()}\n\n${deployInboxItem(entry)}\n`);
    return true;
  }
  // Only a confirmed 200 clears it. An unreachable site leaves the item alone: not knowing is not
  // the same as being fine, and this is the one check whose whole point is that silence lies.
  if (entry.live !== true || !existing.includes(open)) return false;
  await atomicWriteText(root, "INBOX.md", existing.replace(
    open,
    `- [x] **DELIVERY-NOT-BUILT-${entry.venture.toUpperCase()}** — Resolved ${today}: the site is serving it again. Original report:`
  ));
  return true;
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
  probe?: DeployProbe;
}): Promise<{ report: QueueHealthReport; artifacts: string[] }> {
  const root = input.root ?? stateRoot;
  const report = await buildQueueHealthReport(input);
  const recordPath = `delivery/queue-health/${input.today}.json`;
  await atomicWriteJson(root, recordPath, report);
  const artifacts = [recordPath];
  for (const venture of report.ventures) {
    if (await reconcileInbox(root, venture, input.today)) artifacts.push("INBOX.md");
  }
  for (const entry of report.deploys) {
    if (await reconcileDeployInbox(root, entry, input.today)) artifacts.push("INBOX.md");
  }
  return { report, artifacts: [...new Set(artifacts)] };
}
