import { describe, expect, it } from "vitest";
import { repairToolOutput, WRITE_SYSTEM, WRITE_TOOL_INPUT_SCHEMA, type ContractRepair } from "../src/edition/write.js";
import {
  ARTICLE_CATEGORIES,
  ArticleFrontmatterV2Schema,
} from "../src/contracts/article-frontmatter.js";

// The smallest frontmatter the v2 contract accepts, so these cases assert the
// category rule and nothing else.
const base = {
  schema_version: 2,
  title: "Titulek",
  slug: "2026-08-09-titulek",
  date: "2026-08-09",
  lang: "cs",
  dek: "Dek.",
  tags: ["umela-inteligence"],
  sources: [],
  illustration: { alt: "Alt" },
  why_it_matters: ["Proc na tom zalezi."],
  what_changed: ["Co se zmenilo."],
  uncertainty: ["Co zustava nejiste."],
  generation: { generated_at: "2026-08-09T06:00:00Z", human_reviewed: false, models: {} },
  translation_of: "2026-08-09-titulek",
} as const;

describe("the category contract", () => {
  it("accepts a known category", () => {
    const parsed = ArticleFrontmatterV2Schema.parse({ ...base, categories: ["ai-models"] });
    expect(parsed.categories).toEqual(["ai-models"]);
  });

  it("accepts the absent field, which is the normal state", () => {
    expect(ArticleFrontmatterV2Schema.parse(base).categories).toBeUndefined();
  });

  it("rejects an unknown category at the contract boundary", () => {
    expect(() => ArticleFrontmatterV2Schema.parse({ ...base, categories: ["chips"] })).toThrow();
  });

  it("caps the array at two", () => {
    expect(() =>
      ArticleFrontmatterV2Schema.parse({ ...base, categories: ["ai-models", "ai-models", "ai-models"] }),
    ).toThrow();
  });
});

describe("the writer repair path", () => {
  const repair = (categories: unknown) => {
    const repairs: ContractRepair[] = [];
    const out = repairToolOutput({ slug: "s", tags: ["umela-inteligence"], categories }, repairs) as
      | Record<string, unknown>
      | undefined;
    return { out, repairs };
  };

  it("keeps a category the reader can route", () => {
    const { out, repairs } = repair(["ai-models"]);
    expect(out?.categories).toEqual(["ai-models"]);
    expect(repairs).toEqual([]);
  });

  it("drops an unknown category rather than failing the paid call", () => {
    const { out, repairs } = repair(["ai-models", "chips"]);
    expect(out?.categories).toEqual(["ai-models"]);
    expect(repairs.map((r) => r.reason)).toContain("category_unknown_dropped");
  });

  it("removes the field entirely when nothing survives", () => {
    const { out } = repair(["chips", "funding"]);
    expect(out && "categories" in out).toBe(false);
  });

  it("dedupes and caps at two", () => {
    const { out } = repair(["ai-models", "ai-models"]);
    expect(out?.categories).toEqual(["ai-models"]);
  });

  it("survives a non-array without throwing", () => {
    for (const junk of ["ai-models", 42, {}, null]) {
      const { out } = repair(junk);
      expect(out && "categories" in out).toBe(false);
    }
  });

  it("leaves an absent field absent", () => {
    const repairs: ContractRepair[] = [];
    const out = repairToolOutput({ slug: "s", tags: ["x"] }, repairs) as Record<string, unknown>;
    expect("categories" in out).toBe(false);
    expect(repairs).toEqual([]);
  });
});

describe("what the desk is told", () => {
  it("asks the provider for the field rather than only checking it afterwards", () => {
    const props = WRITE_TOOL_INPUT_SCHEMA.properties as Record<string, { type?: string; maxItems?: number; items?: { enum?: readonly string[] } }>;
    expect(props.categories?.type).toBe("array");
    expect(props.categories?.maxItems).toBe(2);
    expect(props.categories?.items?.enum).toEqual([...ARTICLE_CATEGORIES]);
  });

  it("states the strict rule and the bias toward omitting", () => {
    expect(WRITE_SYSTEM).toContain("ONLY when the edition's primary subject is a");
    expect(WRITE_SYSTEM).toContain("an uncategorized article is correct more often");
    expect(WRITE_SYSTEM).toContain("they are separate from");
  });

  it("bans the em-dash and states Czech typography", () => {
    expect(WRITE_SYSTEM).toContain("Never use an em-dash");
    expect(WRITE_SYSTEM).toContain("non-breaking space after one-letter prepositions");
    expect(WRITE_SYSTEM).toContain("Czech quotation marks");
  });
});
