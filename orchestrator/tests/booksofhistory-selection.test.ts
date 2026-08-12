import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BhDossierSchema } from "../src/contracts/bh-dossier.js";
import { BhShortlistSchema } from "../src/contracts/bh-shortlist.js";
import { repoRoot } from "../src/paths.js";
import {
  bhStorySelectionPath,
  selectBhStory,
  writeBhStorySelection
} from "../src/ventures/booksofhistory/run.js";

describe("BOOKSOFHISTORY Day C story selection", () => {
  it("records the lower-seed Book B winning on story score and leaves both dossiers untouched", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-selection-"));
    try {
      const [shortlistFixture, dossierFixture] = await Promise.all([
        readFile(path.join(repoRoot, "contracts/fixtures/bh-shortlist.valid.json"), "utf8").then(JSON.parse),
        readFile(path.join(repoRoot, "contracts/fixtures/bh-dossier.valid.json"), "utf8").then(JSON.parse)
      ]);
      const baseDossier = BhDossierSchema.parse(dossierFixture);
      const bookA = BhDossierSchema.parse({
        ...baseDossier,
        bookId: "book-a",
        bookRef: "ventures/booksofhistory/seed/library.json#book-a",
        title: "Book A",
        storyCandidates: [{ ...baseDossier.storyCandidates[0]!, storyId: "story-a", score: 72 }]
      });
      const bookB = BhDossierSchema.parse({
        ...baseDossier,
        bookId: "book-b",
        bookRef: "ventures/booksofhistory/seed/library.json#book-b",
        title: "Book B",
        storyCandidates: [{ ...baseDossier.storyCandidates[0]!, storyId: "story-b", score: 94 }]
      });
      const factor = shortlistFixture.entries[0].factors;
      const shortlist = BhShortlistSchema.parse({
        ...shortlistFixture,
        entries: [
          { ...shortlistFixture.entries[0], bookId: "book-a", bookRef: bookA.bookRef, title: "Book A", rank: 1, totalScore: 98, factors: factor },
          { ...shortlistFixture.entries[0], bookId: "book-b", bookRef: bookB.bookRef, title: "Book B", rank: 2, totalScore: 71, factors: factor }
        ]
      });
      const before = [JSON.stringify(bookA), JSON.stringify(bookB)];

      const selection = selectBhStory({
        cycleId: "bh-20260812-001",
        shortlist,
        dossiers: [
          { dossierRef: "ventures/booksofhistory/dossiers/book-a/dossier.json", dossier: bookA },
          { dossierRef: "ventures/booksofhistory/dossiers/book-b/dossier.json", dossier: bookB }
        ],
        selectedAt: new Date("2026-08-14T10:00:00.000Z")
      });
      expect(selection).toMatchObject({
        selectedBy: "FOLIO",
        seedRankingReversed: true,
        chosen: { bookId: "book-b", seedRank: 2, seedScore: 71, storyScore: 94 }
      });
      expect(selection.candidates).toEqual([
        expect.objectContaining({ bookId: "book-b", storyScore: 94, seedScore: 71 }),
        expect.objectContaining({ bookId: "book-a", storyScore: 72, seedScore: 98 })
      ]);
      const relative = await writeBhStorySelection(root, selection);
      expect(relative).toBe(bhStorySelectionPath(selection.cycleId));
      expect(JSON.parse(await readFile(path.join(root, relative), "utf8"))).toEqual(selection);
      expect([JSON.stringify(bookA), JSON.stringify(bookB)]).toEqual(before);
      expect(bookA.storyCandidates[0]!.used).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
