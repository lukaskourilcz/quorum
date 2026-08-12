import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BhSeedLibrarySchema } from "../src/contracts/bh-seed.js";
import {
  BOOKSOFHISTORY_SEED_PATH,
  appendBhSeed,
  readBhSeedLibrary,
  rescoreBhSeed
} from "../src/ventures/booksofhistory/seed.js";
import { repoRoot } from "../src/paths.js";
import { main as seedMain } from "../src/ventures/booksofhistory/seed-cli.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; record: Record<string, unknown>; before: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "bh-seed-cli-"));
  roots.push(root);
  const valid = JSON.parse(await readFile(
    path.join(repoRoot, "contracts", "fixtures", "bh-seed.valid.json"),
    "utf8"
  )) as { books: Array<Record<string, unknown>> };
  const library = BhSeedLibrarySchema.parse({ schemaVersion: "bh-seed/1", books: [valid.books[0]] });
  const target = path.join(root, BOOKSOFHISTORY_SEED_PATH);
  await mkdir(path.dirname(target), { recursive: true });
  const before = `${JSON.stringify(library, null, 2)}\n`;
  await writeFile(target, before, "utf8");
  return { root, record: structuredClone(valid.books[0]!), before };
}

describe("bh:seed", () => {
  it("atomically appends one validated, provenance-stamped book", async () => {
    const { root, record } = await fixture();
    record.bookId = "a-second-book";
    record.title = "A Second Book";
    record.provenance = "authored:owner:2026-08-12";
    const input = path.join(root, "candidate.json");
    await writeFile(input, JSON.stringify(record), "utf8");
    expect(await seedMain(["--append", input, "--state-root", root])).toBe(0);
    const next = await readBhSeedLibrary(root);
    expect(next.books.map(({ bookId }) => bookId)).toEqual(["war-with-the-newts", "a-second-book"]);
    expect((await readBhSeedLibrary(root)).books).toHaveLength(2);
    expect((await readdir(path.join(root, path.dirname(BOOKSOFHISTORY_SEED_PATH))))
      .filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("refuses a duplicate id without changing a byte", async () => {
    const { root, record, before } = await fixture();
    await expect(appendBhSeed(root, record)).rejects.toThrow(/already exists; append refused/u);
    expect(await readFile(path.join(root, BOOKSOFHISTORY_SEED_PATH), "utf8")).toBe(before);
  });

  it("refuses an invalid append with no provenance without changing a byte", async () => {
    const { root, record, before } = await fixture();
    record.bookId = "missing-provenance";
    delete record.provenance;
    await expect(appendBhSeed(root, record)).rejects.toThrow(/Seed append is invalid/u);
    expect(await readFile(path.join(root, BOOKSOFHISTORY_SEED_PATH), "utf8")).toBe(before);
  });

  it("rescores only subjective fields and leaves the authored facts in place", async () => {
    const { root, record } = await fixture();
    record.title = "A title that must not overwrite the shelf";
    record.recognition = { kind: "prior", score: 12 };
    record.provenance = "authored:owner:2026-08-12";
    const next = await rescoreBhSeed(root, record);
    expect(next.books[0]).toMatchObject({
      title: "Válka s mloky",
      recognition: { kind: "prior", score: 12 },
      provenance: "authored:owner:2026-08-12"
    });
  });

  it("contains no provider or model-call path", async () => {
    const source = await Promise.all(["seed.ts", "seed-cli.ts"].map((file) =>
      readFile(path.join(repoRoot, "orchestrator", "src", "ventures", "booksofhistory", file), "utf8")
    ));
    expect(source.join("\n")).not.toMatch(/guardedJsonCall|@anthropic-ai|\bopenai\b|ResearchProvider/u);
  });
});
