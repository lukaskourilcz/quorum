import {
  BhSeedLibrarySchema,
  BhSeedRecordSchema,
  type BhSeedLibrary,
  type BhSeedRecord
} from "../../contracts/bh-seed.js";
import { atomicWriteJson, readJson } from "../../state.js";

export const BOOKSOFHISTORY_SEED_PATH = "ventures/booksofhistory/seed/library.json";

export class BhSeedUpdateError extends Error {}

export async function readBhSeedLibrary(root: string): Promise<BhSeedLibrary> {
  const stored = await readJson<unknown>(root, BOOKSOFHISTORY_SEED_PATH, null);
  const parsed = BhSeedLibrarySchema.safeParse(stored);
  if (!parsed.success) {
    throw new BhSeedUpdateError(`BOOKSOFHISTORY seed library is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Validate and plan an append without touching the current value. */
export function planBhSeedAppend(library: BhSeedLibrary, candidate: unknown): BhSeedLibrary {
  const book = BhSeedRecordSchema.safeParse(candidate);
  if (!book.success) {
    throw new BhSeedUpdateError(`Seed append is invalid: ${book.error.message}`);
  }
  if (library.books.some(({ bookId }) => bookId === book.data.bookId)) {
    throw new BhSeedUpdateError(`Seed book id ${book.data.bookId} already exists; append refused`);
  }
  return BhSeedLibrarySchema.parse({ ...library, books: [...library.books, book.data] });
}

/**
 * Replace only the explicitly subjective surface of an existing book.
 *
 * A rescore cannot quietly revise a title, author, year or classification. Those are seed edits,
 * not scoring, and require a reviewed source change. Provenance moves with the new assessment so
 * an owner can see who supplied the current priors.
 */
export function planBhSeedRescore(library: BhSeedLibrary, candidate: unknown): BhSeedLibrary {
  const book = BhSeedRecordSchema.safeParse(candidate);
  if (!book.success) {
    throw new BhSeedUpdateError(`Seed rescore is invalid: ${book.error.message}`);
  }
  const index = library.books.findIndex(({ bookId }) => bookId === book.data.bookId);
  if (index < 0) {
    throw new BhSeedUpdateError(`Seed book id ${book.data.bookId} does not exist; rescore refused`);
  }
  const current = library.books[index]!;
  const rescored: BhSeedRecord = {
    ...current,
    czechRelevance: book.data.czechRelevance,
    internationalRelevance: book.data.internationalRelevance,
    recognition: book.data.recognition,
    significance: book.data.significance,
    storytellingPotential: book.data.storytellingPotential,
    audienceFamiliarity: book.data.audienceFamiliarity,
    provenance: book.data.provenance,
    scoringMetadata: book.data.scoringMetadata
  };
  const books = [...library.books];
  books[index] = rescored;
  return BhSeedLibrarySchema.parse({ ...library, books });
}

export async function appendBhSeed(root: string, candidate: unknown): Promise<BhSeedLibrary> {
  const next = planBhSeedAppend(await readBhSeedLibrary(root), candidate);
  await atomicWriteJson(root, BOOKSOFHISTORY_SEED_PATH, next);
  return next;
}

export async function rescoreBhSeed(root: string, candidate: unknown): Promise<BhSeedLibrary> {
  const next = planBhSeedRescore(await readBhSeedLibrary(root), candidate);
  await atomicWriteJson(root, BOOKSOFHISTORY_SEED_PATH, next);
  return next;
}
