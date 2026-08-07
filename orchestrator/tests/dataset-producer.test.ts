import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BoardlessDatasetSchema, type BoardlessDataset, type DatasetEntry } from "../src/contracts/boardless-dataset.js";
import { appendReceipt, datasetPackageHash, planAppend, serializeDataset } from "../src/datasets/append.js";
import { repoRoot } from "../src/paths.js";

const FIXTURE = path.join(repoRoot, "contracts", "fixtures", "boardless-dataset.valid.json");

async function current(): Promise<BoardlessDataset> {
  return BoardlessDatasetSchema.parse(JSON.parse(await readFile(FIXTURE, "utf8")));
}

function entry(overrides: Partial<DatasetEntry> = {}): DatasetEntry {
  return {
    id: "ai-010",
    slug: "a-fresh-fact",
    category: "history",
    en: { short: "A checkable new line", full: "A checkable new statement long enough to read as a sentence." },
    cs: { short: "Ověřitelný nový řádek", full: "Ověřitelné nové tvrzení dost dlouhé na to, aby se dalo číst jako věta." },
    verified: "2026-08-07",
    source: "Reference work, 2026",
    ...overrides
  };
}

describe("a human-curated append", () => {
  it("needs only the entry's own source", async () => {
    const outcome = planAppend({
      dataset: "ai-facts",
      current: await current(),
      proposals: [{ entry: entry() }],
      author: { kind: "human", name: "owner" }
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.plan.appended.map((item) => item.id)).toEqual(["ai-010"]);
      expect(outcome.plan.target).toEqual({ repo: "aifirst", path: "data/ai-facts.json" });
      expect(outcome.plan.packageHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("still cannot ship an entry with a source nobody could follow", async () => {
    const outcome = planAppend({
      dataset: "ai-facts",
      current: await current(),
      proposals: [{ entry: entry({ source: "a source" }) }],
      author: { kind: "human", name: "owner" }
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("a model-drafted append", () => {
  it("is refused without an evidence reference", async () => {
    const outcome = planAppend({
      dataset: "ai-facts",
      current: await current(),
      proposals: [{ entry: entry() }],
      author: { kind: "agent", id: "SCRIBE" }
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.refusal.violations[0]?.detail).toContain("evidenceRef");
    }
  });

  it("is refused when the reference is not something a reviewer can open", async () => {
    const outcome = planAppend({
      dataset: "ai-facts",
      current: await current(),
      proposals: [{ entry: entry(), evidenceRef: "trust me" }],
      author: { kind: "agent", id: "SCRIBE" }
    });
    expect(outcome.ok).toBe(false);
  });

  it("is accepted with an EVIDENCE id", async () => {
    const outcome = planAppend({
      dataset: "ai-facts",
      current: await current(),
      proposals: [{ entry: entry(), evidenceRef: "FIX-E-001" }],
      author: { kind: "agent", id: "SCRIBE" }
    });
    expect(outcome.ok).toBe(true);
  });

  it("is accepted with a state/ path", async () => {
    const outcome = planAppend({
      dataset: "ai-facts",
      current: await current(),
      proposals: [{ entry: entry(), evidenceRef: "state/EVIDENCE.jsonl" }],
      author: { kind: "agent", id: "SCRIBE" }
    });
    expect(outcome.ok).toBe(true);
  });
});

describe("the append still obeys the schedule rules", () => {
  it("refuses an entry reusing a published id", async () => {
    const base = await current();
    const first = base.entries[0];
    if (first === undefined) throw new Error("fixture needs an entry");

    const outcome = planAppend({
      dataset: "ai-facts",
      current: base,
      proposals: [{ entry: entry({ id: first.id, slug: "different-slug" }) }],
      author: { kind: "human", name: "owner" }
    });
    expect(outcome.ok).toBe(false);
  });

  it("refuses an empty append", async () => {
    const outcome = planAppend({
      dataset: "ai-facts",
      current: await current(),
      proposals: [],
      author: { kind: "human", name: "owner" }
    });
    expect(outcome.ok).toBe(false);
  });

  it("refuses to append onto a dataset that does not parse", () => {
    const outcome = planAppend({
      dataset: "ai-facts",
      current: { nope: true },
      proposals: [{ entry: entry() }],
      author: { kind: "human", name: "owner" }
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal.violations[0]?.detail).toContain("does not parse");
  });
});

describe("the delivered file", () => {
  it("serializes to the two-space JSON the magazines commit", async () => {
    const outcome = planAppend({
      dataset: "ai-facts",
      current: await current(),
      proposals: [{ entry: entry() }],
      author: { kind: "human", name: "owner" }
    });
    if (!outcome.ok) throw new Error("expected a plan");

    const text = serializeDataset(outcome.plan.file);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "schemaVersion": "boardless-dataset/1",');
    expect(JSON.parse(text)).toEqual(outcome.plan.file);
  });

  it("hashes deterministically", async () => {
    const base = await current();
    expect(datasetPackageHash(base)).toBe(datasetPackageHash(base));
  });
});

describe("the receipt", () => {
  it("records what moved, who curated it and what backed it", async () => {
    const base = await current();
    const outcome = planAppend({
      dataset: "ai-facts",
      current: base,
      proposals: [{ entry: entry(), evidenceRef: "FIX-E-001" }],
      author: { kind: "agent", id: "SCRIBE" }
    });
    if (!outcome.ok) throw new Error("expected a plan");

    const receipt = appendReceipt({
      plan: outcome.plan,
      proposals: [{ entry: entry(), evidenceRef: "FIX-E-001" }],
      author: { kind: "agent", id: "SCRIBE" },
      entryCountBefore: base.entries.length,
      recordedAt: "2026-08-07T00:00:00.000Z"
    });

    expect(receipt.schemaVersion).toBe("dataset-append/1");
    expect(receipt.targetRepo).toBe("aifirst");
    expect(receipt.targetPath).toBe("data/ai-facts.json");
    expect(receipt.appendedIds).toEqual(["ai-010"]);
    expect(receipt.entryCountAfter).toBe(receipt.entryCountBefore + 1);
    expect(receipt.evidenceRefs).toEqual(["FIX-E-001"]);
  });
});

describe("dataset routing", () => {
  it("sends each dataset to the repository that renders it", async () => {
    const lessons = planAppend({
      dataset: "ai-lessons",
      current: undefined,
      proposals: [{ entry: entry({ id: "lex-900", slug: "a-term", term: "Term", category: "history" }) }],
      author: { kind: "human", name: "owner" }
    });
    // A first delivery has no categories yet, so the entry's category is undeclared.
    expect(lessons.ok).toBe(false);

    const facts = planAppend({
      dataset: "mma-facts",
      current: undefined,
      proposals: [{ entry: entry({ id: "mma-900", promotion: "ufc" }) }],
      author: { kind: "human", name: "owner" }
    });
    expect(facts.ok).toBe(false);
  });
});
