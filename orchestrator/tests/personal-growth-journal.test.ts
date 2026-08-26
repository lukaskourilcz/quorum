import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditPersonalGrowthOutput,
  PersonalGrowthPrivateJournalStore,
  personalGrowthThreadsStyleGuidance
} from "../src/ventures/personal-growth/journal.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function store() {
  const root = await mkdtemp(path.join(tmpdir(), "pg-journal-test-"));
  roots.push(root);
  return {
    root,
    privateRoot: path.join(root, "private"),
    publicRoot: path.join(root, "public"),
    value: new PersonalGrowthPrivateJournalStore(path.join(root, "private"), path.join(root, "public"))
  };
}

const czech = "Krátká věta. Druhá věta je o něco delší a drží vlastní rytmus.\n\nTřetí odstavec stojí sám.";
const english = "A short sentence. The second sentence deliberately carries a different rhythm.\n\nOne final paragraph stands alone.";

describe("private Personal Growth journal lane", () => {
  it("stores source and chunks only in the private root while Git receives bounded metadata", async () => {
    const target = await store();
    const result = await target.value.write({ language: "cs", title: "Soukromý zápis", source: czech, now: new Date("2026-08-26T12:00:00.000Z") });
    expect(result.status).toBe("complete");
    expect(result.actualUsd).toBe(0);
    const metadataRaw = await readFile(path.join(target.publicRoot, "ventures/personal-growth/journal/cs.json"), "utf8");
    expect(metadataRaw).not.toContain("Soukromý zápis");
    expect(metadataRaw).not.toContain("Krátká věta");
    expect(metadataRaw).not.toMatch(/chunkText|embedding|rawPrompt|rawResponse/iu);
    const chunks = await target.value.privateChunks("cs", result.metadata!.sourceHash);
    expect(chunks.some(({ text }) => text.includes("Krátká věta"))).toBe(true);
  });

  it("keeps Czech and English as separate, non-translating lanes", async () => {
    const target = await store();
    const cs = await target.value.write({ language: "cs", title: "CS", source: czech, now: new Date("2026-08-26T12:00:00.000Z") });
    expect(await target.value.current("en")).toBeNull();
    const en = await target.value.write({ language: "en", title: "EN", source: english, now: new Date("2026-08-26T12:01:00.000Z") });
    expect(cs.metadata?.versionId).toMatch(/^pg-journal-cs-/u);
    expect(en.metadata?.versionId).toMatch(/^pg-journal-en-/u);
    expect((await target.value.privateChunks("cs", cs.metadata!.sourceHash))[0]!.text).not.toContain("A short sentence");
    expect((await target.value.privateChunks("en", en.metadata!.sourceHash))[0]!.text).not.toContain("Krátká věta");
  });

  it("is idempotent for the same document version and degrades closed at the project cap", async () => {
    const target = await store();
    const first = await target.value.write({ language: "cs", title: "CS", source: czech, now: new Date("2026-08-26T12:00:00.000Z") });
    const replay = await target.value.write({ language: "cs", title: "changed but same source", source: czech, now: new Date("2026-08-27T12:00:00.000Z") });
    expect(replay.status).toBe("reused");
    expect(replay.metadata).toEqual(first.metadata);
    expect(await target.value.write({ language: "en", title: "EN", source: english, now: new Date(), degradation: "exhausted" }))
      .toMatchObject({ status: "refused", reason: "budget-exhausted", actualUsd: 0 });
  });

  it("refuses invalid language and title input without touching either store", async () => {
    const target = await store();
    await expect(target.value.write({ language: "de" as never, title: "DE", source: english, now: new Date() }))
      .resolves.toMatchObject({ status: "refused", reason: "invalid-language", actualUsd: 0 });
    await expect(target.value.write({ language: "en", title: "line one\nline two", source: english, now: new Date() }))
      .resolves.toMatchObject({ status: "refused", reason: "invalid-title", actualUsd: 0 });
    expect(await target.value.current("en")).toBeNull();
  });

  it("blocks long exact overlap, high similarity, oversized quotes and private serialization fields", () => {
    const source = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
    expect(auditPersonalGrowthOutput({ candidate: source, privateSources: [source] })).toMatchObject({
      status: "blocked",
      exactLongNgram: true,
      safeToPersistPublicly: false
    });
    expect(auditPersonalGrowthOutput({
      candidate: "A completely independent operational suggestion with no borrowed event or wording.",
      privateSources: [source]
    }).status).toBe("pass");
    expect(auditPersonalGrowthOutput({
      candidate: "independent",
      privateSources: [source],
      serializedValue: { rawPrompt: "must never persist" }
    })).toMatchObject({ status: "blocked", serializedPrivateField: true });
  });

  it("emits only structural, original-writing guidance and never fabricates source events", async () => {
    const target = await store();
    const result = await target.value.write({ language: "cs", title: "CS", source: czech, now: new Date("2026-08-26T12:00:00.000Z") });
    expect(personalGrowthThreadsStyleGuidance(result.metadata!)).toMatchObject({
      language: "cs",
      originalityRequired: true,
      quotationAllowed: false,
      eventClaims: "owner-evidence-only",
      automaticTranslation: false
    });
  });

  it("fails closed when private and public roots overlap", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pg-journal-overlap-"));
    roots.push(root);
    expect(() => new PersonalGrowthPrivateJournalStore(root, path.join(root, "state"))).toThrow("must not overlap");
  });
});
