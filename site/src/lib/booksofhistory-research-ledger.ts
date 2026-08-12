export interface BhResearchLedgerBackfill {
  text: string;
  changed: number;
  matched: number;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Flip only the immutable research lines that supplied the owner-posted dossier. */
export function backfillBhResearchLedgerUsage(raw: string, dossierRef: string): BhResearchLedgerBackfill {
  const lines = raw.split(/\r?\n/u).filter((line) => line.trim());
  const entries = lines.map((line, index) => {
    let parsed: unknown;
    try { parsed = JSON.parse(line) as unknown; }
    catch { throw new Error(`BOOKSOFHISTORY research ledger line ${index + 1} is not JSON`); }
    const entry = object(parsed);
    if (!entry || entry.schemaVersion !== "bh-research-ledger/1" || typeof entry.dossierRef !== "string" || typeof entry.used !== "boolean") {
      throw new Error(`BOOKSOFHISTORY research ledger line ${index + 1} is malformed`);
    }
    return entry;
  });
  let changed = 0;
  let matched = 0;
  const updated = entries.map((entry) => {
    if (entry.dossierRef !== dossierRef) return entry;
    matched += 1;
    if (entry.used) return entry;
    changed += 1;
    return { ...entry, used: true };
  });
  return {
    text: updated.length ? `${updated.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "",
    changed,
    matched
  };
}
