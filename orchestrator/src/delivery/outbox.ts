import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { EditionPackage } from "../contracts/edition-package.js";
import { MeetingRecordSchema } from "../contracts/meeting-record.js";
import { stateRoot } from "../paths.js";
import { atomicWriteJson, atomicWriteText, readJson, readText, resolveStatePath } from "../state.js";
import { validateEditionForDelivery } from "./validate.js";

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
    const editionPackage = validateEditionForDelivery(JSON.parse(await readFile(file, "utf8")));
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
    if (receipt?.status === "needs_reconciliation" && sameBytes && !isRetryableFailure(receipt.code)) {
      continue;
    }
    // A "no edition today" notice is only true on its own day. Left in an oldest-first queue
    // that ships one package per run, a stale one holds every real edition behind it and
    // would publish yesterday's notice as though it were today's. Today's still ships.
    //
    // Skipping it silently is what orphaned 2 August: the package sat in the outbox with no
    // receipt, no INBOX item and no deletion, re-read and re-skipped by every run since, and the
    // magazine's 2 August has no board JSON at all. A stale notice now ends: it gets a terminal
    // receipt saying it was superseded, and its file is removed.
    if (editionPackage.status === "no_edition" && editionPackage.date !== today) {
      await supersedeStaleNoEdition(root, file, editionPackage, today);
      continue;
    }
    return {
      packagePath: path.relative(root, file),
      package: editionPackage
    };
  }
  return null;
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
    return [
      receiptPath,
      `edition/archive/${editionPackage.date}-${editionPackage.idempotencyKey}.json`,
      input.packagePath,
      ...(closed ? ["INBOX.md"] : [])
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
