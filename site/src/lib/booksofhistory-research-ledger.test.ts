import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backfillBhResearchLedgerUsage } from "./booksofhistory-research-ledger";

async function ledgerEntry() {
  return JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/bh-research-ledger.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
}

describe("BOOKSOFHISTORY research-ledger publication backfill", () => {
  it("marks every contributing line used, preserves other dossiers and is idempotent", async () => {
    const target = await ledgerEntry();
    const synthesis = { ...target, step: "synth", searches: 0, costUsd: 0.02 };
    const other = { ...target, bookId: "another-book", dossierRef: "ventures/booksofhistory/dossiers/another-book/dossier.json" };
    const raw = `${JSON.stringify(target)}\n${JSON.stringify(synthesis)}\n${JSON.stringify(other)}\n`;

    const first = backfillBhResearchLedgerUsage(raw, String(target.dossierRef));
    const second = backfillBhResearchLedgerUsage(first.text, String(target.dossierRef));
    const entries = first.text.trim().split("\n").map((line) => JSON.parse(line));

    expect(first).toMatchObject({ changed: 2, matched: 2 });
    expect(entries.map(({ used }) => used)).toEqual([true, true, false]);
    expect(second).toEqual({ text: first.text, changed: 0, matched: 2 });
  });

  it("refuses to rewrite a malformed line", async () => {
    const entry = await ledgerEntry();
    expect(() => backfillBhResearchLedgerUsage(`${JSON.stringify(entry)}\nnot-json\n`, String(entry.dossierRef)))
      .toThrow("line 2 is not JSON");
    expect(() => backfillBhResearchLedgerUsage('{"schemaVersion":"bh-research-ledger/1"}\n', String(entry.dossierRef)))
      .toThrow("line 1 is malformed");
  });
});
