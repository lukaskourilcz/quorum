import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEditionQualityConfig } from "../src/edition/config.js";
import { buildNoEditionPackage } from "../src/edition/package.js";
import { editionArticleUrl, oldestPendingDelivery, recordDelivery } from "../src/delivery/outbox.js";

async function outboxRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "outbox-terminal-"));
  await mkdir(path.join(root, "edition", "outbox"), { recursive: true });
  return root;
}

async function queueNoEdition(root: string, date: string): Promise<string> {
  const editionPackage = buildNoEditionPackage({
    date,
    meetingRef: `meetings/${date}-cu-edition`,
    roomUrl: `https://boardless.example/meetings/${date}-cu-edition`,
    reason: "budget_exhausted",
    config: await loadEditionQualityConfig()
  });
  const file = `${date}-${editionPackage.idempotencyKey}.json`;
  await writeFile(
    path.join(root, "edition", "outbox", file),
    JSON.stringify(editionPackage),
    "utf8"
  );
  return `edition/outbox/${file}`;
}

async function receipt(root: string, date: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(path.join(root, "edition", "deliveries", `${date}.json`), "utf8")
  ) as Record<string, unknown>;
}

/**
 * A "no edition today" notice is only true on its own day, and the queue was right to skip a
 * stale one. What it did after that was the fault: no receipt, no INBOX item, no deletion. The
 * 2 August package sat in the outbox being re-read and re-skipped by every run since, and
 * 2 August is the one date with no board JSON on the magazine at all.
 */
describe("a stale no-edition package ends instead of being skipped forever", () => {
  it("writes a terminal receipt and removes the file", async () => {
    const root = await outboxRoot();
    await queueNoEdition(root, "2026-08-02");

    expect(await oldestPendingDelivery(root, "2026-08-06")).toBeNull();

    const written = await receipt(root, "2026-08-02");
    expect(written.status).toBe("superseded");
    expect(written.editionStatus).toBe("no_edition");
    // Not "delivered": nothing reached the magazine, and every reader that counts published
    // editions keys on that word.
    expect(written.tags).toEqual([]);
    expect(await readdir(path.join(root, "edition", "outbox"))).toEqual([]);
  });

  it("leaves a receipt the date already has alone", async () => {
    const root = await outboxRoot();
    await queueNoEdition(root, "2026-08-02");
    await mkdir(path.join(root, "edition", "deliveries"), { recursive: true });
    await writeFile(
      path.join(root, "edition", "deliveries", "2026-08-02.json"),
      JSON.stringify({ schemaVersion: 1, date: "2026-08-02", status: "delivered", tags: ["ai"] }),
      "utf8"
    );

    await oldestPendingDelivery(root, "2026-08-06");

    expect((await receipt(root, "2026-08-02")).status).toBe("delivered");
    expect(await readdir(path.join(root, "edition", "outbox"))).toEqual([]);
  });

  it("still ships today's notice", async () => {
    const root = await outboxRoot();
    const queued = await queueNoEdition(root, "2026-08-06");

    expect((await oldestPendingDelivery(root, "2026-08-06"))?.packagePath).toBe(queued);
  });
});

/**
 * CAUGHT-UP-DELIVERY-2026-08-05 was still open with the same package delivered two hours later.
 * The item is raised when a delivery needs reconciliation and nothing ever closed it, so the
 * owner's list grew one entry per failed attempt and none of them ever went away on their own.
 */
describe("a delivery item closes when its date delivers", () => {
  it("ticks the marker and keeps the original report", async () => {
    const root = await outboxRoot();
    const queued = await queueNoEdition(root, "2026-08-05");
    await writeFile(
      path.join(root, "INBOX.md"),
      [
        "# INBOX",
        "",
        "- [ ] **CAUGHT-UP-DELIVERY-2026-08-05** — schema_invalid: the consumer refused the package.",
        "  RELAY marked the delivery `needs_reconciliation`.",
        "  [imp:5] [owner:me] [time:20m] [kind:deploy]",
        ""
      ].join("\n"),
      "utf8"
    );

    const artifacts = await recordDelivery({
      root,
      packagePath: queued,
      status: "delivered",
      now: new Date("2026-08-05T18:00:00.000Z")
    });

    expect(artifacts).toContain("INBOX.md");
    const inbox = await readFile(path.join(root, "INBOX.md"), "utf8");
    expect(inbox).toContain("- [x] **CAUGHT-UP-DELIVERY-2026-08-05**");
    expect(inbox).toContain("delivered on a later run");
    // What went wrong that day is still worth reading, so the report under it survives.
    expect(inbox).toContain("schema_invalid: the consumer refused the package.");
    expect(inbox).toContain("[imp:5] [owner:me]");
  });

  it("says nothing when the date has no open item", async () => {
    const root = await outboxRoot();
    const queued = await queueNoEdition(root, "2026-08-05");
    await writeFile(path.join(root, "INBOX.md"), "# INBOX\n", "utf8");

    const artifacts = await recordDelivery({
      root,
      packagePath: queued,
      status: "delivered",
      now: new Date("2026-08-05T18:00:00.000Z")
    });

    expect(artifacts).not.toContain("INBOX.md");
  });
});

/**
 * Delivery deleted the package the moment it landed, so the exact bytes the magazine received
 * survived only in the magazine's own history and the meeting page that decided the edition
 * could show nothing of what it produced.
 */
describe("a delivered package is kept and points at what it published", () => {
  it("archives the package under its date and hash", async () => {
    const root = await outboxRoot();
    const queued = await queueNoEdition(root, "2026-08-06");
    const hash = path.basename(queued).replace("2026-08-06-", "").replace(".json", "");

    const artifacts = await recordDelivery({
      root,
      packagePath: queued,
      status: "delivered",
      now: new Date("2026-08-06T06:00:00.000Z")
    });

    const archived = `edition/archive/2026-08-06-${hash}.json`;
    expect(artifacts).toContain(archived);
    expect(JSON.parse(await readFile(path.join(root, archived), "utf8"))).toMatchObject({
      date: "2026-08-06",
      status: "no_edition"
    });
    // The outbox is still emptied: the archive is a copy, not a second queue.
    expect(await readdir(path.join(root, "edition", "outbox"))).toEqual([]);
  });

  it("records where a delivered edition can be read, and nothing for a day with no article", async () => {
    const root = await outboxRoot();
    const queued = await queueNoEdition(root, "2026-08-06");

    await recordDelivery({ root, packagePath: queued, status: "delivered" });

    // A no-edition notice publishes no article, so there is no URL to promise.
    expect(await receipt(root, "2026-08-06")).not.toHaveProperty("articleUrl");
    expect(editionArticleUrl({
      status: "edition",
      article: { cs: { frontmatter: { slug: "tri-laboratore" } } }
    } as never)).toBe("https://caughtup-ai.vercel.app/articles/tri-laboratore");
  });
});
