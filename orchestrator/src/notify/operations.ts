import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { DigestOperationSchema, type DigestOperation } from "../contracts/daily-digest.js";
import { SocialActivationSchema } from "../contracts/autonomy.js";
import { readJson } from "../state.js";

async function jsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function recordDate(record: Record<string, unknown>, file: string): string | null {
  for (const key of ["completedAt", "verifiedAt", "deliveredAt", "attemptedAt", "pausedAt", "failedAt", "date"]) {
    const value = record[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/u.test(value)) return value.slice(0, 10);
  }
  return file.match(/\d{4}-\d{2}-\d{2}/u)?.[0] ?? null;
}

function ventureFrom(file: string, record: Record<string, unknown>): DigestOperation["ventureId"] {
  const explicit = record.venture ?? record.ventureId;
  if (explicit === "caught-up" || explicit === "mma-files" || explicit === "titty-tuesdays" || explicit === "fightaiq" || explicit === "incubator") return explicit;
  if (file.includes("caught-up") || file.includes(`${path.sep}edition${path.sep}`)) return "caught-up";
  if (file.includes("mma-files")) return "mma-files";
  if (file.includes("fightaiq")) return "fightaiq";
  if (file.includes("titty-tuesdays")) return "titty-tuesdays";
  return "global";
}

function cleanStatus(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : "recorded";
}

async function recordsForDate(directory: string, date: string): Promise<Array<{ file: string; record: Record<string, unknown> }>> {
  const records: Array<{ file: string; record: Record<string, unknown> }> = [];
  for (const file of await jsonFiles(directory)) {
    try {
      const record = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
      if (recordDate(record, file) === date) records.push({ file, record });
    } catch {
      // Unreadable evidence is never reported as a success.
    }
  }
  return records;
}

export async function collectDigestOperations(stateRoot: string, date: string): Promise<DigestOperation[]> {
  const [releaseProofs, caughtUpDeliveries, mmaDeliveries, socialFailures, releaseFailures, activationRaw] = await Promise.all([
    recordsForDate(path.join(stateRoot, "release-proofs"), date),
    recordsForDate(path.join(stateRoot, "edition", "deliveries"), date),
    recordsForDate(path.join(stateRoot, "ventures", "mma-files", "deliveries"), date),
    recordsForDate(path.join(stateRoot, "notify", "social-failures"), date),
    recordsForDate(path.join(stateRoot, "notify", "release-failures"), date),
    readJson<unknown>(stateRoot, "social/activation.json", null)
  ]);
  const operations: DigestOperation[] = [];
  for (const { file, record } of releaseProofs.slice(-4)) {
    const venture = ventureFrom(file, record);
    const status = cleanStatus(record.status);
    operations.push(DigestOperationSchema.parse({
      ventureId: venture,
      type: "release-proof",
      status,
      text: `${venture} release proof ${status}; the public result was checked after delivery.`,
      ref: path.relative(stateRoot, file)
    }));
  }
  for (const { file, record } of [...caughtUpDeliveries, ...mmaDeliveries].slice(-4)) {
    const venture = ventureFrom(file, record);
    const status = cleanStatus(record.status);
    operations.push(DigestOperationSchema.parse({
      ventureId: venture,
      type: "delivery",
      status,
      text: `${venture} delivery ${status}; a saved receipt identifies the exact package.`,
      ref: path.relative(stateRoot, file)
    }));
  }
  // A release that was reverted off production is the loudest thing that can happen in a
  // day, and it was written to notify/release-failures and read by nothing. The flagship
  // article was reverted twice on 2 August and the digest never mentioned it.
  for (const { file, record } of releaseFailures.slice(-3)) {
    const venture = ventureFrom(file, record);
    const status = cleanStatus(record.status);
    operations.push(DigestOperationSchema.parse({
      ventureId: venture,
      type: "failure",
      status: "paused",
      text: `${venture} release ${status} after post-deploy verification failed; the delivery was taken off production.`,
      ref: path.relative(stateRoot, file)
    }));
  }
  for (const { file, record } of socialFailures.slice(-3)) {
    const venture = ventureFrom(file, record);
    operations.push(DigestOperationSchema.parse({
      ventureId: venture,
      type: "failure",
      status: "paused",
      text: `${venture} social publishing paused after two failed attempts; owner review is required.`,
      ref: path.relative(stateRoot, file)
    }));
  }
  if (releaseProofs.length === 0 && caughtUpDeliveries.length === 0 && mmaDeliveries.length === 0) {
    operations.push(DigestOperationSchema.parse({ ventureId: "global", type: "delivery", status: "none", text: "No delivery or release proof was recorded today.", ref: null }));
  }
  if (socialFailures.length === 0) {
    operations.push(DigestOperationSchema.parse({ ventureId: "global", type: "failure", status: "none", text: "No social publishing failure was recorded today.", ref: null }));
  }
  const activation = SocialActivationSchema.safeParse(activationRaw);
  if (activation.success) {
    for (const venture of ["caught-up", "mma-files", "titty-tuesdays"] as const) {
      const gate = activation.data.ventures[venture];
      operations.push(DigestOperationSchema.parse({
        ventureId: venture,
        type: "social-gate",
        status: gate.status,
        text: `${venture} social check ${gate.status}; ready count ${gate.counter}/${gate.required}.`,
        ref: "social/activation.json"
      }));
    }
  }
  return operations.slice(0, 16);
}
