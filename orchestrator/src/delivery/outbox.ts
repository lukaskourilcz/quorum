import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { EditionPackage } from "../contracts/edition-package.js";
import { MeetingRecordSchema } from "../contracts/meeting-record.js";
import { stateRoot } from "../paths.js";
import { atomicWriteJson, atomicWriteText, readJson, readText, resolveStatePath } from "../state.js";
import { DeliveryPackageError, validateEditionForDelivery } from "./validate.js";

export type DeliveryFailureCode =
  | "schema_invalid"
  | "content_invalid"
  | "push_rejected"
  | "build_failed"
  | "hash_conflict"
  | "unreachable";

export interface PendingDelivery {
  packagePath: string;
  package: EditionPackage;
}

/**
 * Failure codes a byte-identical retry can still clear.
 *
 * Everything else is a verdict on these exact bytes: the magazine refused them once and will
 * refuse them the same way again. `unreachable` and `push_rejected` are the two that describe
 * the road rather than the cargo.
 */
const RETRYABLE_FAILURE_CODES: ReadonlySet<string> = new Set<DeliveryFailureCode>([
  "unreachable",
  "push_rejected"
]);

function isRetryableFailure(code: unknown): boolean {
  return typeof code === "string" && RETRYABLE_FAILURE_CODES.has(code);
}

/** `<date>-<idempotencyKey>.json`, which is the only handle on a package too broken to parse. */
function identityFromFilename(file: string): { date: string; packageHash: string } | null {
  const match = path.basename(file).match(/^(\d{4}-\d{2}-\d{2})-([a-f0-9]{64})\.json$/u);
  return match ? { date: match[1]!, packageHash: match[2]! } : null;
}

/**
 * Read one queued package, or record why it cannot be read and return null.
 *
 * `validateEditionForDelivery` throws, and this walk used to let it: one unreadable package made
 * every later cycle throw while merely selecting, which wedges the queue behind it exactly as a
 * refused package used to. A malformed item has to cost one item and never the run — so the
 * package gets the same terminal receipt a refused one gets, the queue moves past it, and the
 * daily health check counts it as parked.
 */
async function parseQueuedPackage(file: string): Promise<EditionPackage | { error: unknown }> {
  try {
    return validateEditionForDelivery(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    return { error };
  }
}

async function readQueuedPackage(root: string, file: string, now: Date): Promise<EditionPackage | null> {
  const parsed = await parseQueuedPackage(file);
  if (!("error" in parsed)) return parsed;
  {
    const error = parsed.error;
    const identity = identityFromFilename(file);
    if (!identity) return null;
    const existing = await readJson<{ status?: unknown } | null>(
      root,
      `edition/deliveries/${identity.date}.json`,
      null
    );
    if (!existing) {
      await atomicWriteJson(root, `edition/deliveries/${identity.date}.json`, {
        schemaVersion: 1,
        date: identity.date,
        packageHash: identity.packageHash,
        status: "needs_reconciliation",
        targetRepository: "lukaskourilcz/aifirst",
        code: error instanceof DeliveryPackageError ? error.code : "schema_invalid",
        detail: (error instanceof Error ? error.message : "package could not be read")
          .replace(/\s+/g, " ").trim().slice(0, 500),
        recordedAt: now.toISOString(),
        tags: []
      });
    }
    return null;
  }
}

async function packageFiles(root: string): Promise<string[]> {
  const directory = resolveStatePath(root, "edition/outbox");
  try {
    return (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => path.join(directory, file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function oldestPendingDelivery(
  root = stateRoot,
  today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date())
): Promise<PendingDelivery | null> {
  // Oldest first, but skip any date that already has a delivered receipt.
  //
  // The outbox is only emptied on a successful delivery, so a package whose date was later
  // reconciled by hand stayed at the head of an oldest-first queue permanently and every
  // edition behind it queued forever. One failed release jammed the venture: the next run
  // would ship the stale package and report success while the new edition waited.
  for (const file of await packageFiles(root)) {
    const editionPackage = await readQueuedPackage(root, file, new Date());
    if (!editionPackage) continue;
    const receipt = await readJson<{ status?: unknown; packageHash?: unknown; code?: unknown } | null>(
      root,
      `edition/deliveries/${editionPackage.date}.json`,
      null
    );
    const sameBytes = receipt?.packageHash === editionPackage.idempotencyKey;
    const alreadyShipped = receipt?.status === "delivered" && sameBytes;
    if (alreadyShipped) continue;
    // A package the magazine has already refused for a reason that retrying cannot change is
    // parked rather than re-sent. Skipping only delivered dates was half the rule: a package
    // that kept failing had no receipt to skip on, so it stayed at the head of an oldest-first
    // queue and every edition behind it waited on a verdict that was never going to change.
    //
    // Parked is keyed to the exact bytes. A regenerated package for the same date is different
    // bytes and gets its own attempt, which is how a reconciled edition ships without anybody
    // having to clear a flag.
    // A "no edition today" notice is only true on its own day. Left in an oldest-first queue
    // that ships one package per run, a stale one holds every real edition behind it and
    // would publish yesterday's notice as though it were today's. Today's still ships.
    //
    // Skipping it silently is what orphaned 2 August: the package sat in the outbox with no
    // receipt, no INBOX item and no deletion, re-read and re-skipped by every run since, and the
    // magazine's 2 August has no board JSON at all. A stale notice now ends: it gets a terminal
    // receipt saying it was superseded, and its file is removed.
    //
    // This runs before the parked skip below, and that order is the whole point. A stale notice
    // that also failed a delivery matched the parked rule first and `continue`d past its own
    // ending, so the file stayed in the outbox and the venture read as stalled for as long as it
    // sat there — 27 August did exactly that, twelve days after the day it described. Staleness
    // does not depend on the verdict: a notice about a day that has passed is over either way,
    // and `supersedeStaleNoEdition` keeps any receipt already written, so the honest record of
    // the failed attempt survives.
    if (editionPackage.status === "no_edition" && editionPackage.date !== today) {
      await supersedeStaleNoEdition(root, file, editionPackage, today);
      continue;
    }
    if (receipt?.status === "needs_reconciliation" && sameBytes && !isRetryableFailure(receipt.code)) {
      continue;
    }
    return {
      packagePath: path.relative(root, file),
      package: editionPackage
    };
  }
  return null;
}

export interface EditionQueueEntry {
  date: string;
  packageHash: string;
  editionStatus: EditionPackage["status"];
  state: "pending" | "parked";
  code?: string;
}

/**
 * What is sitting in the outbox and why, without touching any of it.
 *
 * `oldestPendingDelivery` supersedes stale notices and records unreadable ones as it walks, which
 * is right for a queue about to ship and wrong for a health check: reading the queue must not
 * change it. So this parses without recording, and counts what it cannot read as parked.
 */
export async function editionQueue(root = stateRoot): Promise<EditionQueueEntry[]> {
  const entries: EditionQueueEntry[] = [];
  for (const file of await packageFiles(root)) {
    const parsed = await parseQueuedPackage(file);
    if ("error" in parsed) {
      const identity = identityFromFilename(file);
      if (identity) {
        entries.push({ ...identity, editionStatus: "edition", state: "parked", code: "schema_invalid" });
      }
      continue;
    }
    const editionPackage = parsed;
    const receipt = await readJson<{ status?: unknown; packageHash?: unknown; code?: unknown } | null>(
      root,
      `edition/deliveries/${editionPackage.date}.json`,
      null
    );
    const sameBytes = receipt?.packageHash === editionPackage.idempotencyKey;
    if (receipt?.status === "delivered" && sameBytes) continue;
    const parked = receipt?.status === "needs_reconciliation" && sameBytes && !isRetryableFailure(receipt.code);
    entries.push({
      date: editionPackage.date,
      packageHash: editionPackage.idempotencyKey,
      editionStatus: editionPackage.status,
      state: parked ? "parked" : "pending",
      ...(parked && typeof receipt?.code === "string" ? { code: receipt.code } : {})
    });
  }
  return entries;
}

/**
 * End a "no edition" notice that is no longer true, in the one place that used to drop it.
 *
 * The receipt is `superseded`, not `delivered`: nothing reached the magazine, and a reader of
 * `edition/deliveries/` must not be told otherwise. `tags: []` and `editionStatus: no_edition`
 * keep it out of every reader that counts published editions, and recentEditionTags already
 * skips receipts with no tags.
 */
async function supersedeStaleNoEdition(
  root: string,
  file: string,
  editionPackage: EditionPackage,
  today: string
): Promise<void> {
  const receiptPath = `edition/deliveries/${editionPackage.date}.json`;
  const existing = await readJson<{ status?: unknown } | null>(root, receiptPath, null);
  // A date that already has a real receipt keeps it. This only writes where nothing was written.
  if (!existing) {
    await atomicWriteJson(root, receiptPath, {
      schemaVersion: 1,
      date: editionPackage.date,
      packageHash: editionPackage.idempotencyKey,
      status: "superseded",
      editionStatus: editionPackage.status,
      targetRepository: "lukaskourilcz/aifirst",
      supersededAt: `${today}T00:00:00.000Z`,
      reason: "The notice for this day was never delivered and no longer describes today.",
      tags: []
    });
  }
  await rm(file, { force: true });
}

/**
 * What the public record says when a delivery does not complete.
 *
 * The failure code and the technical detail belong in the INBOX item, which is where the owner
 * reads it. Both used to be pasted straight into `decision.summary`, a public field: the record
 * for 5 August published a CI runner path, a 40-character hash and the command line that failed,
 * and the calendar cell for that day showed the first 180 characters of it.
 */
const DELIVERY_FAILURE_SENTENCE: Record<DeliveryFailureCode, string> = {
  schema_invalid: "The finished edition did not match the delivery format the magazine accepts, so it was not published.",
  content_invalid: "The finished edition failed its content checks on the way out, so it was not published.",
  push_rejected: "The magazine repository refused the delivery, so the edition is not published yet.",
  build_failed: "The magazine could not build the delivered edition, so it is not published yet.",
  hash_conflict: "A different edition already holds this date in the magazine, so this one was held back.",
  unreachable: "The magazine could not be reached, so the edition is waiting to be delivered."
};

function inboxItem(date: string, code: DeliveryFailureCode, detail: string): string {
  const oneLineDetail = detail.replace(/\s+/g, " ").trim();
  return [
    `- [ ] **CAUGHT-UP-DELIVERY-${date}** — ${code}: ${oneLineDetail.slice(0, 300)}.`,
    "  RELAY marked the delivery `needs_reconciliation`; same-date content must not be overwritten automatically.",
    "  [imp:5] [owner:me] [time:20m] [kind:deploy]"
  ].join("\n");
}

/**
 * Tick the delivery item for a date the moment that date actually delivers.
 *
 * CAUGHT-UP-DELIVERY-2026-08-05 was still open with the same package delivered two hours later:
 * the item is raised when a delivery needs reconciliation and nothing ever closed it, so the
 * owner's list grew an entry per failed attempt and none of them ever went away on their own.
 * Only the marker line is ticked; the report under it stays, because what went wrong that day is
 * still worth reading.
 */
async function closeInboxItem(root: string, date: string, now: Date): Promise<boolean> {
  const existing = await readText(root, "INBOX.md", "# INBOX\n");
  const marker = `CAUGHT-UP-DELIVERY-${date}`;
  const open = `- [ ] **${marker}**`;
  if (!existing.includes(open)) return false;
  await atomicWriteText(root, "INBOX.md", existing.replace(
    open,
    `- [x] **${marker}** — Resolved ${now.toISOString().slice(0, 10)}: the edition for this date delivered on a later run. Original report:`
  ));
  return true;
}

/**
 * Take the reconciliation flag off a day that went on to publish.
 *
 * The failure path marks the meeting NEEDS_RECONCILIATION, and nothing ever took it off: a date
 * that failed at 03:00 and delivered on a later run stayed flagged for good, so the calendar
 * showed an unresolved incident for a day the magazine actually published. That is the same
 * mismatch as a room reporting success over a delivery that never landed, pointing the other way,
 * and it is read by the same person looking at the same page.
 *
 * The original summary is gone — the failure path overwrote it — so this does not pretend to
 * restore it. It states what is true now and that the day was late, which is the part a reader of
 * the calendar needs.
 */
async function clearMeetingReconciliation(root: string, date: string, now: Date): Promise<boolean> {
  const meetingPath = `meetings/${date}-cu-edition.json`;
  const existing = await readJson<{ status?: unknown; decision?: { summary?: unknown } } | null>(
    root,
    meetingPath,
    null
  );
  if (!existing || existing.status !== "NEEDS_RECONCILIATION") return false;
  const meeting = MeetingRecordSchema.parse(existing);
  await atomicWriteJson(root, meetingPath, {
    ...meeting,
    status: "HELD",
    decision: {
      ...meeting.decision,
      summary: `This edition was delivered on a later run, on ${now.toISOString().slice(0, 10)}. It was held back at first; the delivery receipt for this date records what the magazine refused and when it accepted it.`
    }
  });
  return true;
}

async function raiseInboxOnce(root: string, date: string, code: DeliveryFailureCode, detail: string) {
  const existing = await readText(root, "INBOX.md", "# INBOX\n");
  const marker = `CAUGHT-UP-DELIVERY-${date}`;
  if (existing.includes(marker)) return;
  await atomicWriteText(root, "INBOX.md", `${existing.trimEnd()}\n\n${inboxItem(date, code, detail)}\n`);
}

/** Where DNESKAi serves the article a package delivered. Czech renders at the site root. */
const DNESKAI_SITE = "https://caughtup-ai.vercel.app";

export function editionArticleUrl(editionPackage: EditionPackage): string | null {
  return editionPackage.status === "edition"
    ? `${DNESKAI_SITE}/articles/${editionPackage.article.cs.frontmatter.slug}`
    : null;
}

export async function recordDelivery(input: {
  packagePath: string;
  status: "delivered" | "needs_reconciliation";
  code?: DeliveryFailureCode;
  detail?: string;
  targetCommit?: string;
  now?: Date;
  root?: string;
}): Promise<string[]> {
  const root = input.root ?? stateRoot;
  const absolute = resolveStatePath(root, input.packagePath);
  const editionPackage = validateEditionForDelivery(JSON.parse(await readFile(absolute, "utf8")));
  const now = input.now ?? new Date();
  const receiptPath = `edition/deliveries/${editionPackage.date}.json`;
  if (input.status === "delivered") {
    const existingReceipt = await readJson<{
      packageHash?: unknown;
      supersededPackageHashes?: unknown;
    } | null>(root, receiptPath, null);
    const supersededPackageHashes = [
      ...(Array.isArray(existingReceipt?.supersededPackageHashes)
        ? (existingReceipt.supersededPackageHashes as unknown[]).filter(
          (value): value is string => typeof value === "string"
        )
        : []),
      ...(typeof existingReceipt?.packageHash === "string" &&
        existingReceipt.packageHash !== editionPackage.idempotencyKey
        ? [existingReceipt.packageHash]
        : [])
    ];
    await atomicWriteJson(root, receiptPath, {
      schemaVersion: 1,
      date: editionPackage.date,
      packageHash: editionPackage.idempotencyKey,
      status: "delivered",
      editionStatus: editionPackage.status,
      targetRepository: "lukaskourilcz/aifirst",
      ...(input.targetCommit ? { targetCommit: input.targetCommit } : {}),
      deliveredAt: now.toISOString(),
      ...(editionArticleUrl(editionPackage) ? { articleUrl: editionArticleUrl(editionPackage) } : {}),
      tags: editionPackage.status === "edition" ? editionPackage.article.cs.frontmatter.tags : [],
      ...(supersededPackageHashes.length ? { supersededPackageHashes } : {})
    });
    // Keep what was sent. The package was deleted the moment it delivered, so the only copy of
    // the exact bytes the magazine received lived in the magazine's own history; the meeting
    // page that decided the edition could show nothing of what it produced.
    await atomicWriteJson(
      root,
      `edition/archive/${editionPackage.date}-${editionPackage.idempotencyKey}.json`,
      editionPackage
    );
    await rm(absolute);
    const closed = await closeInboxItem(root, editionPackage.date, now);
    const reconciled = await clearMeetingReconciliation(root, editionPackage.date, now);
    return [
      receiptPath,
      `edition/archive/${editionPackage.date}-${editionPackage.idempotencyKey}.json`,
      input.packagePath,
      ...(closed ? ["INBOX.md"] : []),
      ...(reconciled ? [`meetings/${editionPackage.date}-cu-edition.json`] : [])
    ];
  }
  const code = input.code ?? "push_rejected";
  const detail = input.detail ?? "Delivery stopped without a reconciled target commit";
  const meetingPath = `meetings/${editionPackage.date}-cu-edition.json`;
  const meeting = MeetingRecordSchema.parse(
    JSON.parse(await readFile(resolveStatePath(root, meetingPath), "utf8"))
  );
  await Promise.all([
    atomicWriteJson(root, meetingPath, {
      ...meeting,
      status: "NEEDS_RECONCILIATION",
      decision: {
        ...meeting.decision,
        summary: `${DELIVERY_FAILURE_SENTENCE[code]} The owner has the technical report.`
      }
    }),
    // The failure used to leave no receipt at all, so the queue could not tell a package the
    // magazine had already refused from one it had never seen. `tags: []` and the explicit
    // status keep it out of every reader that counts published editions — each of those asks
    // for `delivered` by name.
    atomicWriteJson(root, receiptPath, {
      schemaVersion: 1,
      date: editionPackage.date,
      packageHash: editionPackage.idempotencyKey,
      status: "needs_reconciliation",
      editionStatus: editionPackage.status,
      targetRepository: "lukaskourilcz/aifirst",
      code,
      detail: detail.replace(/\s+/g, " ").trim().slice(0, 500),
      recordedAt: now.toISOString(),
      tags: []
    }),
    raiseInboxOnce(root, editionPackage.date, code, detail)
  ]);
  return [meetingPath, receiptPath, "INBOX.md"];
}
