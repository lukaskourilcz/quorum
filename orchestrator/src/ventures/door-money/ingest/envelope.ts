import type { BudgetLedgerEntry } from "../../../budget.js";

export const BOOK_INGEST_DAY_CAP_USD = 0.8;
export const BOOK_INGEST_PROGRAM_CAP_USD = 3;

export class BookIngestEnvelopeError extends Error {
  constructor(readonly code: "DAY_CAP" | "PROGRAM_CAP", message: string) {
    super(message);
    this.name = "BookIngestEnvelopeError";
  }
}

function bookIngestEntries(entries: readonly BudgetLedgerEntry[]): BudgetLedgerEntry[] {
  return entries.filter((entry) =>
    entry.phase === "book-ingest" && entry.ventureId === "door-money");
}

function sum(entries: readonly BudgetLedgerEntry[]): number {
  return Number(entries.reduce((total, entry) => total + entry.usd, 0).toFixed(8));
}

export function bookIngestEnvelopeStatus(
  entries: readonly BudgetLedgerEntry[],
  now: Date
): {
  dayUsd: number;
  programUsd: number;
  dayRemainingUsd: number;
  programRemainingUsd: number;
} {
  const relevant = bookIngestEntries(entries);
  const day = now.toISOString().slice(0, 10);
  const dayUsd = sum(relevant.filter((entry) => entry.ts.slice(0, 10) === day));
  const programUsd = sum(relevant);
  return {
    dayUsd,
    programUsd,
    dayRemainingUsd: Number(Math.max(0, BOOK_INGEST_DAY_CAP_USD - dayUsd).toFixed(8)),
    programRemainingUsd: Number(Math.max(0, BOOK_INGEST_PROGRAM_CAP_USD - programUsd).toFixed(8))
  };
}

export function assertBookIngestEnvelope(
  entries: readonly BudgetLedgerEntry[],
  now: Date,
  reservationUsd = 0
): void {
  if (!Number.isFinite(reservationUsd) || reservationUsd < 0) {
    throw new Error("Book ingestion reservation must be a nonnegative finite amount");
  }
  const status = bookIngestEnvelopeStatus(entries, now);
  if (status.dayUsd + reservationUsd > BOOK_INGEST_DAY_CAP_USD) {
    throw new BookIngestEnvelopeError(
      "DAY_CAP",
      `Book ingestion day cap is $${BOOK_INGEST_DAY_CAP_USD.toFixed(2)}; $${status.dayUsd.toFixed(6)} is recorded and $${reservationUsd.toFixed(6)} was requested`
    );
  }
  if (status.programUsd + reservationUsd > BOOK_INGEST_PROGRAM_CAP_USD) {
    throw new BookIngestEnvelopeError(
      "PROGRAM_CAP",
      `Book ingestion program cap is $${BOOK_INGEST_PROGRAM_CAP_USD.toFixed(2)}; $${status.programUsd.toFixed(6)} is recorded and $${reservationUsd.toFixed(6)} was requested`
    );
  }
}
