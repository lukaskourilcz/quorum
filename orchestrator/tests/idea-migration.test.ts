import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GLOBAL_IDEA_NAMESPACE,
  ideaIndexPath,
  ideaLedgerPath
} from "../src/ideas/ledger.js";
import { migrateLegacyIdeaLedger } from "../src/ideas/migration.js";
import { atomicWriteText } from "../src/state.js";

describe("idea ledger namespace migration", () => {
  it("moves the legacy pair byte-for-byte and is idempotent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-idea-migration-"));
    const ledger = `${JSON.stringify({ preserved: "history" })}\n`;
    const index = "# Existing index\n\nPreserve this exact history.\n";
    await Promise.all([
      atomicWriteText(root, "ideas/ledger.jsonl", ledger),
      atomicWriteText(root, "ideas/INDEX.md", index)
    ]);

    await expect(migrateLegacyIdeaLedger(root)).resolves.toEqual({
      status: "migrated",
      ledgerBytes: Buffer.byteLength(ledger),
      indexBytes: Buffer.byteLength(index)
    });
    await expect(readFile(path.join(root, ideaLedgerPath(GLOBAL_IDEA_NAMESPACE)), "utf8"))
      .resolves.toBe(ledger);
    await expect(readFile(path.join(root, ideaIndexPath(GLOBAL_IDEA_NAMESPACE)), "utf8"))
      .resolves.toBe(index);
    await expect(readFile(path.join(root, "ideas", "ledger.jsonl"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(migrateLegacyIdeaLedger(root)).resolves.toMatchObject({
      status: "already_migrated"
    });
  });

  it("refuses to overwrite a different global ledger", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-idea-conflict-"));
    await Promise.all([
      atomicWriteText(root, "ideas/ledger.jsonl", "legacy\n"),
      atomicWriteText(root, "ideas/INDEX.md", "legacy index\n"),
      atomicWriteText(root, ideaLedgerPath(GLOBAL_IDEA_NAMESPACE), "different\n")
    ]);
    await expect(migrateLegacyIdeaLedger(root)).rejects.toThrow(
      "Global idea ledger already exists with different bytes"
    );
  });
});
