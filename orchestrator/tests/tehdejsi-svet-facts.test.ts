import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TehdejsiFactsFileSchema } from "../src/contracts/tehdejsi-facts.js";
import { repoRoot } from "../src/paths.js";
import {
  TEHDEJSI_FACTS_PATH,
  factsContentHash,
  loadTehdejsiFacts,
  resetTehdejsiFactsCache
} from "../src/ventures/tehdejsi-svet/facts.js";

const temporaryRoots: string[] = [];

async function temporaryFile(contents: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-facts-"));
  temporaryRoots.push(root);
  const file = path.join(root, "facts.json");
  await writeFile(file, JSON.stringify(contents, null, 2));
  return file;
}

afterEach(async () => {
  resetTehdejsiFactsCache();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function committed() {
  return JSON.parse(await readFile(path.join(repoRoot, TEHDEJSI_FACTS_PATH), "utf8")) as
    { facts: Array<Record<string, unknown>>; contentHash: string };
}

describe("Tehdejsi svet facts file", () => {
  it("loads the committed file and agrees with its own hash", async () => {
    const file = await loadTehdejsiFacts();
    expect(file.schemaVersion).toBe("tehdejsi-facts/1");
    expect(file.facts.length).toBeGreaterThan(0);
    expect(factsContentHash(file.facts)).toBe(file.contentHash);
  });

  it("aborts on a fact edited without rehashing rather than serving it", async () => {
    const file = await committed();
    file.facts[0]!.text = "A sentence nobody signed off, added by hand without touching the envelope.";
    await expect(loadTehdejsiFacts(await temporaryFile(file), "/"))
      .rejects.toThrow(/edited without rehashing/u);
  });

  it("refuses a record the product marks unsafe to share instead of filtering it later", async () => {
    const file = await committed();
    const unsafe = { ...file.facts[0], id: "leader-profile", shareSafe: false };
    expect(TehdejsiFactsFileSchema.safeParse({ ...file, facts: [unsafe] }).success).toBe(false);
  });

  it("refuses a media reference, because excluded imagery must have nowhere to live", async () => {
    const file = await committed();
    const withImage = { ...file.facts[0], imageUrl: "https://example.invalid/photo.jpg" };
    expect(TehdejsiFactsFileSchema.safeParse({ ...file, facts: [withImage] }).success).toBe(false);
  });

  it("refuses a single-sourced tier-2 fact and a duplicate id", async () => {
    const file = await committed();
    const tierTwo = file.facts.find((fact) => fact.sensitivityTier === 2);
    expect(tierTwo).toBeDefined();
    expect(TehdejsiFactsFileSchema.safeParse({
      ...file,
      facts: [{ ...tierTwo, sources: [(tierTwo!.sources as unknown[])[0]] }]
    }).success).toBe(false);
    expect(TehdejsiFactsFileSchema.safeParse({
      ...file,
      facts: [file.facts[0], { ...file.facts[1], id: file.facts[0]!.id }]
    }).success).toBe(false);
  });

  it("gives every committed fact a resolvable source and an honest verified field", async () => {
    const file = await loadTehdejsiFacts();
    for (const fact of file.facts) {
      expect(fact.sources.length).toBeGreaterThan(0);
      expect(fact.sources.every((source) => source.title.trim().length > 0)).toBe(true);
      // `null` is unknown. It must never be filled in with today's date to look verified.
      if (fact.verified !== null) expect(fact.verified <= "2026-08-12").toBe(true);
      if (fact.sensitivityTier === 2) expect(fact.sources.length).toBeGreaterThanOrEqual(2);
    }
  });
});
