import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BoardlessDatasetSchema, type BoardlessDataset } from "../src/contracts/boardless-dataset.js";
import { describeVerdict, verifyDatasetAppend } from "../src/datasets/verify.js";
import { repoRoot } from "../src/paths.js";

const FIXTURE = path.join(repoRoot, "contracts", "fixtures", "boardless-dataset.valid.json");

async function base(): Promise<BoardlessDataset> {
  return BoardlessDatasetSchema.parse(JSON.parse(await readFile(FIXTURE, "utf8")));
}

function clone(dataset: BoardlessDataset): BoardlessDataset {
  return JSON.parse(JSON.stringify(dataset)) as BoardlessDataset;
}

function entry(id: string, slug: string): BoardlessDataset["entries"][number] {
  return {
    id,
    slug,
    category: "history",
    en: { short: "A new checkable line", full: "A new checkable statement with enough substance to read as prose." },
    cs: { short: "Nový ověřitelný řádek", full: "Nové ověřitelné tvrzení, které má dost obsahu na to, aby se dalo číst." },
    verified: "2026-08-07",
    source: "Reference work, 2026"
  };
}

describe("the fixture", () => {
  it("is a valid dataset", async () => {
    await expect(base()).resolves.toBeDefined();
  });
});

describe("a first delivery", () => {
  it("treats every entry as an append when nothing exists downstream", async () => {
    const proposed = await base();
    const verdict = verifyDatasetAppend({ current: undefined, proposed });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.appended).toHaveLength(proposed.entries.length);
  });
});

describe("an append", () => {
  it("accepts new entries added at the tail", async () => {
    const current = await base();
    const proposed = clone(current);
    proposed.entries.push(entry("ai-900", "a-new-fact"));

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.appended.map((item) => item.id)).toEqual(["ai-900"]);
      expect(verdict.corrected).toHaveLength(0);
      expect(describeVerdict(verdict)).toBe("1 appended");
    }
  });

  it("accepts an unchanged replay as a no-op", async () => {
    const current = await base();
    const verdict = verifyDatasetAppend({ current, proposed: clone(current) });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.appended).toHaveLength(0);
  });
});

describe("the reveal schedule is immutable", () => {
  it("refuses an entry inserted in the middle", async () => {
    const current = await base();
    const proposed = clone(current);
    proposed.entries.splice(1, 0, entry("ai-901", "inserted"));

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations.some((v) => v.code === "entry_reordered")).toBe(true);
  });

  it("refuses reordered entries", async () => {
    const current = await base();
    const proposed = clone(current);
    const [first, second] = [proposed.entries[0], proposed.entries[1]];
    if (first === undefined || second === undefined) throw new Error("fixture needs two entries");
    proposed.entries[0] = second;
    proposed.entries[1] = first;

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations.some((v) => v.code === "entry_reordered")).toBe(true);
  });

  it("refuses a removed entry", async () => {
    const current = await base();
    const proposed = clone(current);
    proposed.entries.pop();

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations[0]?.code).toBe("entries_removed");
  });

  it("refuses a moved anchor, which would re-date everything already revealed", async () => {
    const current = await base();
    const proposed = clone(current);
    proposed.anchor = "2026-07-02";

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations.some((v) => v.code === "anchor_moved")).toBe(true);
  });

  it("refuses removing a category existing entries point at", async () => {
    const current = await base();
    const proposed = clone(current);
    proposed.categories = { models: proposed.categories.models ?? { en: "Models", cs: "Modely" } };

    // The schema catches this one first, because entries still name `history`.
    // Either refusal is correct; what matters is that it cannot ship.
    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.violations.some((v) => v.code === "schema" || v.code === "category_removed")).toBe(true);
    }
  });

  it("refuses removing even an unreferenced category — the file is append-only", async () => {
    const current = await base();
    current.categories.unused = { en: "Unused", cs: "Nepoužité" };
    const proposed = clone(current);
    delete proposed.categories.unused;

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations.some((v) => v.code === "category_removed")).toBe(true);
  });
});

describe("corrections", () => {
  it("accepts changed text when verified moves forward", async () => {
    const current = await base();
    const proposed = clone(current);
    const first = proposed.entries[0];
    if (first === undefined) throw new Error("fixture needs an entry");
    first.cs.full = "Opravené tvrzení, které je nyní správné a dostatečně dlouhé.";
    first.verified = "2026-09-01";

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.corrected.map((item) => item.id)).toEqual([first.id]);
  });

  it("refuses changed text that does not record a re-check", async () => {
    const current = await base();
    const proposed = clone(current);
    const first = proposed.entries[0];
    if (first === undefined) throw new Error("fixture needs an entry");
    first.cs.full = "Tiše přepsané tvrzení bez nového ověření.";

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations.some((v) => v.code === "correction_without_receipt")).toBe(true);
  });

  it("refuses moving verified without changing anything it attests to", async () => {
    const current = await base();
    const proposed = clone(current);
    const first = proposed.entries[0];
    if (first === undefined) throw new Error("fixture needs an entry");
    first.verified = "2026-09-01";

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations.some((v) => v.code === "entry_mutated")).toBe(true);
  });
});

describe("identifiers are never reused", () => {
  it("refuses an appended entry reusing a published id", async () => {
    const current = await base();
    const proposed = clone(current);
    const first = proposed.entries[0];
    if (first === undefined) throw new Error("fixture needs an entry");
    proposed.entries.push({ ...entry("ai-902", "fresh-slug"), id: first.id });

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations.some((v) => v.code === "schema" || v.code === "id_reused")).toBe(true);
  });

  it("refuses an appended entry reusing a published slug", async () => {
    const current = await base();
    const proposed = clone(current);
    const first = proposed.entries[0];
    if (first === undefined) throw new Error("fixture needs an entry");
    proposed.entries.push({ ...entry("ai-903", "x"), slug: first.slug });

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations.some((v) => v.code === "schema" || v.code === "slug_reused")).toBe(true);
  });
});

describe("malformed packages", () => {
  it("refuses a package that is not a dataset at all", () => {
    const verdict = verifyDatasetAppend({ current: undefined, proposed: { hello: "world" } });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations[0]?.code).toBe("schema");
  });

  it("refuses an entry whose source nobody could follow", async () => {
    const current = await base();
    const proposed = clone(current);
    proposed.entries.push({ ...entry("ai-904", "vague"), source: "a source" });

    const verdict = verifyDatasetAppend({ current, proposed });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.violations[0]?.code).toBe("schema");
  });
});

describe("the shipped datasets", () => {
  it("each replay against themselves as a clean no-op", async () => {
    const shipped = [
      path.join(repoRoot, "contracts", "fixtures", "boardless-dataset.valid.json")
    ];
    for (const file of shipped) {
      const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
      const verdict = verifyDatasetAppend({ current: parsed, proposed: parsed });
      expect(verdict.ok, file).toBe(true);
    }
  });
});
