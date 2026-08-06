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
    const receipt = await readJson<{ status?: unknown; packageHash?: unknown } | null>(
      root,
      `edition/deliveries/${editionPackage.date}.json`,
      null
    );
    const alreadyShipped = receipt?.status === "delivered"
      && receipt.packageHash === editionPackage.idempotencyKey;
    if (alreadyShipped) continue;
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
      tags: editionPackage.status === "edition" ? editionPackage.article.cs.frontmatter.tags : [],
      ...(supersededPackageHashes.length ? { supersededPackageHashes } : {})
    });
    await rm(absolute);
    const closed = await closeInboxItem(root, editionPackage.date, now);
    return [receiptPath, input.packagePath, ...(closed ? ["INBOX.md"] : [])];
  }
  const code = input.code ?? "push_rejected";
  const detail = input.detail ?? "Delivery stopped without a reconciled target commit";
  const oneLineDetail = detail.replace(/\s+/g, " ").trim();
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
        summary: `NEEDS_RECONCILIATION. ${code}: ${oneLineDetail.slice(0, 220)}`
      }
    }),
    raiseInboxOnce(root, editionPackage.date, code, detail)
  ]);
  return [meetingPath, "INBOX.md"];
}
