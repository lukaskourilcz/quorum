import { describe, expect, it } from "vitest";
import { editionRecordForDay, hasDeliveredPublishedEdition, manualEditionOverride } from "../src/cycle.js";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "../src/paths.js";

/**
 * The once-a-day edition guard, and the one thing that is allowed to step past it.
 *
 * Eighteen crons resolve to a phase, so without the guard a re-run publishes the same day twice.
 * With it, a manual dispatch — the owner at the keyboard asking for a new article — was refused
 * with NO_ACTION and no way to say otherwise.
 */

async function receiptRoot(receipt: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "edition-guard-"));
  await mkdir(path.join(root, "edition", "deliveries"), { recursive: true });
  await writeFile(path.join(root, "edition", "deliveries", "2026-08-03.json"), JSON.stringify(receipt));
  return root;
}

const DELIVERED = { status: "delivered", editionStatus: "edition", tags: ["ai"] };

describe("publishing a second edition on the same day", () => {
  it("is refused for a scheduled run that already delivered one", async () => {
    const root = await receiptRoot(DELIVERED);
    expect(await hasDeliveredPublishedEdition("2026-08-03", root)).toBe(true);
  });

  it("is allowed once the manual dispatch says so", async () => {
    const root = await receiptRoot(DELIVERED);
    const saved = process.env.CYCLE_FORCE_NEW_EDITION;
    process.env.CYCLE_FORCE_NEW_EDITION = "true";
    try {
      expect(await hasDeliveredPublishedEdition("2026-08-03", root)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.CYCLE_FORCE_NEW_EDITION;
      else process.env.CYCLE_FORCE_NEW_EDITION = saved;
    }
  });

  it("reads only an explicit true, so an unset or empty value keeps the guard", () => {
    expect(manualEditionOverride({})).toBe(false);
    expect(manualEditionOverride({ CYCLE_FORCE_NEW_EDITION: "" })).toBe(false);
    // GitHub renders a false boolean input as the string "false".
    expect(manualEditionOverride({ CYCLE_FORCE_NEW_EDITION: "false" })).toBe(false);
    expect(manualEditionOverride({ CYCLE_FORCE_NEW_EDITION: "true" })).toBe(true);
    expect(manualEditionOverride({ CYCLE_FORCE_NEW_EDITION: "TRUE" })).toBe(true);
  });

  it("still returns false when nothing was delivered at all", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "edition-guard-empty-"));
    expect(await hasDeliveredPublishedEdition("2026-08-03", root)).toBe(false);
  });
});

/**
 * What settles a day is the edition on file, not only the receipt. The delivery queue ships one
 * package per run, oldest first, so a morning's edition can still be waiting at 09:00; reading
 * the receipt alone is how 10 and 11 September each got a second edition and a hash conflict.
 */
describe("the record that settles a day's edition", () => {
  async function goldenPackage(): Promise<{ date: string; idempotencyKey: string; raw: string }> {
    const raw = await readFile(
      path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition", "golden-package.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw) as { date: string; idempotencyKey: string };
    return { ...parsed, raw };
  }

  async function outboxRoot(receipt?: unknown): Promise<{ root: string; file: string; date: string }> {
    const golden = await goldenPackage();
    const root = await mkdtemp(path.join(os.tmpdir(), "edition-settled-"));
    await mkdir(path.join(root, "edition", "outbox"), { recursive: true });
    await mkdir(path.join(root, "edition", "deliveries"), { recursive: true });
    const file = `edition/outbox/${golden.date}-${golden.idempotencyKey}.json`;
    await writeFile(path.join(root, file), golden.raw);
    if (receipt !== undefined) {
      await writeFile(path.join(root, "edition", "deliveries", `${golden.date}.json`), JSON.stringify({
        packageHash: golden.idempotencyKey,
        ...(receipt as object)
      }));
    }
    return { root, file, date: golden.date };
  }

  it("is the delivered receipt once the edition reached the magazine", async () => {
    const root = await receiptRoot(DELIVERED);
    expect(await editionRecordForDay("2026-08-03", root)).toBe("edition/deliveries/2026-08-03.json");
  });

  it("is the queued edition while it is still waiting to ship", async () => {
    const { root, file, date } = await outboxRoot();
    expect(await editionRecordForDay(date, root)).toBe(file);
  });

  it("is still the queued edition after a failure a byte-identical retry can clear", async () => {
    const { root, file, date } = await outboxRoot({ status: "needs_reconciliation", code: "unreachable" });
    expect(await editionRecordForDay(date, root)).toBe(file);
  });

  it("is nothing once the magazine has refused those bytes for good", async () => {
    // A parked package waits for new bytes, and the retry is where they come from.
    const { root, date } = await outboxRoot({ status: "needs_reconciliation", code: "hash_conflict" });
    expect(await editionRecordForDay(date, root)).toBeNull();
  });

  it("is nothing when the day has no edition on file at all", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "edition-settled-empty-"));
    expect(await editionRecordForDay("2026-08-04", root)).toBeNull();
  });

  it("steps aside for the manual dispatch like the receipt does", async () => {
    const { root, date } = await outboxRoot();
    const saved = process.env.CYCLE_FORCE_NEW_EDITION;
    process.env.CYCLE_FORCE_NEW_EDITION = "true";
    try {
      expect(await editionRecordForDay(date, root)).toBeNull();
    } finally {
      if (saved === undefined) delete process.env.CYCLE_FORCE_NEW_EDITION;
      else process.env.CYCLE_FORCE_NEW_EDITION = saved;
    }
  });
});
