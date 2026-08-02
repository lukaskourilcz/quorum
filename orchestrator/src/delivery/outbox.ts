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

export async function oldestPendingDelivery(root = stateRoot): Promise<PendingDelivery | null> {
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
    return {
      packagePath: path.relative(root, file),
      package: editionPackage
    };
  }
  return null;
}

function inboxItem(date: string, code: DeliveryFailureCode, detail: string): string {
  const oneLineDetail = detail.replace(/\s+/g, " ").trim();
  return [
    `- [ ] **CAUGHT-UP-DELIVERY-${date}** — ${code}: ${oneLineDetail.slice(0, 300)}.`,
    "  RELAY marked the delivery `needs_reconciliation`; same-date content must not be overwritten automatically.",
    "  [imp:5] [owner:me] [time:20m] [kind:deploy]"
  ].join("\n");
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
      tags: editionPackage.status === "edition" ? editionPackage.article.en.frontmatter.tags : [],
      ...(supersededPackageHashes.length ? { supersededPackageHashes } : {})
    });
    await rm(absolute);
    return [receiptPath, input.packagePath];
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
