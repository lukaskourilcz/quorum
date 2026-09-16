import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PracticalBlockSchema,
  isFridayEdition,
  practicalBlockErrors,
  practicalVariantForDate,
  type PracticalBlockShape
} from "../src/contracts/practical.js";
import { EditionPackageSchema, type EditionPackage } from "../src/contracts/edition-package.js";
import { validateEditionForDelivery, DeliveryPackageError } from "../src/delivery/validate.js";
import { loadEditionQualityConfig, type EditionQualityConfig } from "../src/edition/config.js";
import {
  FixtureEditionModelGateway,
  type FixtureModelResponse
} from "../src/edition/fixture.js";
import { editionPackageHash } from "../src/edition/package.js";
import { PRACTICAL_NOT_FILED, checkPractical } from "../src/edition/practical.js";
import { produceEdition, type EditionProductionInput } from "../src/edition/production.js";
import { writeToolInputSchema } from "../src/edition/write.js";
import { repoRoot } from "../src/paths.js";
import { loadSourceRegistry } from "../src/sources/registry.js";
import { SourceItemSchema, type SourceItem } from "../src/sources/types.js";

const fixtureRoot = path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition");

/** 2026-08-07 is a Friday; 2026-08-04, the fixture's own date, is a Tuesday. */
const FRIDAY = "2026-08-07";
const TUESDAY = "2026-08-04";

/** Four URLs the fixture edition cites, so a practical item built on them is grounded. */
const CITED = [
  "https://www.anthropic.com/news/example-price-update",
  "https://openai.com/index/example-api-pricing",
  "https://deepmind.google/blog/example-inference-tier/",
  "https://research.google/blog/example-serving-costs/"
] as const;

async function fixtureJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), "utf8")) as T;
}

function item(kind: "prompt" | "tool" | "howto", title: string, url: string) {
  return {
    kind,
    title,
    body: "Otevři ceník poskytovatele, vlož do modelu svůj měsíční objem tokenů a nech si spočítat rozdíl proti minulé faktuře.",
    source_url: url
  };
}

/** Three tools and one prompt, each on its own cited source: the Friday shape. */
function fridayItems() {
  return [
    item("tool", "Kalkulačka nákladů na inferenci", CITED[0]!),
    item("tool", "Porovnání sazeb mezi poskytovateli", CITED[1]!),
    item("tool", "Sledování limitů propustnosti", CITED[2]!),
    item("prompt", "Prompt na přepočet měsíčního účtu", CITED[3]!)
  ];
}

async function productionInput(
  responses: FixtureModelResponse[],
  date: string,
  practicalItem: boolean
): Promise<EditionProductionInput> {
  const [rawItems, base, registry] = await Promise.all([
    fixtureJson<unknown[]>("source-items.json"),
    loadEditionQualityConfig(),
    loadSourceRegistry()
  ]);
  const config: EditionQualityConfig = {
    ...base,
    article: { ...base.article, practicalItem }
  };
  const items: SourceItem[] = rawItems.map((value) => SourceItemSchema.parse(value));
  return {
    date,
    now: new Date(`${date}T03:55:00.000Z`),
    items,
    sources: registry.sources,
    sourceResults: registry.sources.slice(0, 10).map((source) => ({
      sourceId: source.id,
      status: "success" as const,
      candidateItems: 1,
      durationMs: 0,
      errorCode: null,
      errorMessage: null
    })),
    recentEditionTags: [["policy"], ["hardware"], ["research"], ["media"]],
    readBody: async () => null,
    meetingRef: `meetings/${date}-cu-edition`,
    roomUrl: `https://boardless.example/meetings/${date}-cu-edition`,
    whyThisStory: "Four independent sources document a price cut that changes production budgets.",
    mode: "dry_run",
    config,
    gateway: new FixtureEditionModelGateway(responses)
  };
}

/** The fixture write payload, dated `date`, carrying whatever practical block a test wants. */
async function writerResponses(
  date: string,
  practical?: ReturnType<typeof fridayItems>
): Promise<FixtureModelResponse[]> {
  const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
  const curate = structuredClone(base[0]!);
  const writer = structuredClone(base[1]!);
  const value = writer.value as Record<string, unknown>;
  value.slug = `${date}-production-inference-price-cut`;
  if (practical) value.practical = practical;
  return [curate, writer];
}

function edition(result: { package: EditionPackage }): Extract<EditionPackage, { status: "edition" }> {
  if (result.package.status !== "edition") throw new Error("the fixture run produced no edition");
  return result.package;
}

/** Re-hash a package after a test has edited its Czech frontmatter, the way the builder does. */
function resealed(
  value: Extract<EditionPackage, { status: "edition" }>,
  edit: (frontmatter: Record<string, unknown>) => void
): unknown {
  const clone = structuredClone(value) as unknown as {
    idempotencyKey: string;
    date: string;
    article: { cs: { frontmatter: Record<string, unknown> } };
  };
  edit(clone.article.cs.frontmatter);
  const key = editionPackageHash(clone);
  clone.idempotencyKey = key;
  (clone.article.cs.frontmatter.generation as { package_hash: string }).package_hash = key;
  return clone;
}

describe("which day carries which practical shape", () => {
  it("reads the weekday off the publishing date and never off a clock", () => {
    expect(isFridayEdition(FRIDAY)).toBe(true);
    expect(isFridayEdition(TUESDAY)).toBe(false);
    expect(practicalVariantForDate(FRIDAY)).toBe("friday-tools");
    expect(practicalVariantForDate(TUESDAY)).toBe("daily");
    expect(() => isFridayEdition("not-a-date")).toThrow(/invalid edition date/);
  });
});

describe("the package schema", () => {
  it("accepts one item on an ordinary day and four on the tools issue", () => {
    expect(PracticalBlockSchema.safeParse({
      variant: "daily",
      items: [item("prompt", "Prompt na přepočet účtu", CITED[0]!)]
    }).success).toBe(true);
    expect(PracticalBlockSchema.safeParse({
      variant: "friday-tools",
      items: fridayItems()
    }).success).toBe(true);
  });

  it("refuses a daily block that carries more than the one item", () => {
    const parsed = PracticalBlockSchema.safeParse({
      variant: "daily",
      items: [
        item("prompt", "Prompt na přepočet účtu", CITED[0]!),
        item("tool", "Kalkulačka nákladů", CITED[1]!)
      ]
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.message).toContain("a daily practical block carries one item");
  });

  it("refuses a tools issue that is not three tools and one prompt", () => {
    const wrong = fridayItems();
    wrong[0] = item("prompt", "Druhý prompt navíc", CITED[0]!);
    const parsed = PracticalBlockSchema.safeParse({ variant: "friday-tools", items: wrong });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.message).toContain("3 tools and 1 prompt");
  });

  it("refuses a body too short to be an instruction and a title without a body", () => {
    expect(PracticalBlockSchema.safeParse({
      variant: "daily",
      items: [{ ...item("tool", "Kalkulačka", CITED[0]!), body: "Zkus to." }]
    }).success).toBe(false);
  });

  it("refuses two items filed under one title", () => {
    const repeated = fridayItems();
    repeated[1] = item("tool", repeated[0]!.title, CITED[1]!);
    const parsed = PracticalBlockSchema.safeParse({ variant: "friday-tools", items: repeated });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.message).toContain("share a title");
  });
});

describe("what a block has to prove about itself", () => {
  const grounded = new Set<string>(CITED);

  it("names a source the edition does not carry", () => {
    const block: PracticalBlockShape = {
      variant: "daily",
      items: [item("tool", "Nástroj odjinud", "https://example.com/not-in-the-packet")]
    };
    expect(practicalBlockErrors({ block, date: TUESDAY, groundedUrls: grounded })).toEqual([
      expect.stringContaining("carries neither as a source nor on the Watchlist")
    ]);
  });

  it("refuses a tools issue on a day that is not a Friday", () => {
    const block: PracticalBlockShape = { variant: "friday-tools", items: fridayItems() };
    expect(practicalBlockErrors({ block, date: TUESDAY, groundedUrls: grounded })).toEqual([
      `the Friday tools issue is dated ${TUESDAY}, which is not a Friday`
    ]);
    expect(practicalBlockErrors({ block, date: FRIDAY, groundedUrls: grounded })).toEqual([]);
  });

  // A Friday whose sources documented one usable thing is a Friday with one practical item,
  // not a Friday that has to invent two more tools to keep a shape.
  it("lets a Friday fall back to the ordinary single item", () => {
    const block: PracticalBlockShape = {
      variant: "daily",
      items: [item("prompt", "Prompt na přepočet účtu", CITED[0]!)]
    };
    expect(practicalBlockErrors({ block, date: FRIDAY, groundedUrls: grounded })).toEqual([]);
  });

  it("refuses a link written into the reader-facing text", () => {
    const block: PracticalBlockShape = {
      variant: "daily",
      items: [{
        ...item("howto", "Jak přepočítat účet", CITED[0]!),
        body: "Postupuj podle návodu na https://example.com/guide a porovnej výsledek s fakturou za minulý měsíc."
      }]
    };
    expect(practicalBlockErrors({ block, date: TUESDAY, groundedUrls: grounded })).toEqual([
      expect.stringContaining("source_url is the only URL")
    ]);
  });
});

describe("the desk's filed block", () => {
  // What the delivered frontmatter will carry: the cited sources and one Watchlist URL.
  const carried = new Set<string>([...CITED, "https://feeds.arstechnica.com/example-price-comparison"]);

  it("keeps a grounded Friday block whole", () => {
    const checked = checkPractical({ items: fridayItems(), date: FRIDAY, groundedUrls: carried });
    expect(checked.problems).toEqual([]);
    expect(checked.block?.variant).toBe("friday-tools");
    expect(checked.block?.items).toHaveLength(4);
  });

  // All or nothing, like the visual brief: a desk that invented one URL wrote the other three
  // under the same misunderstanding, and none of them is evidence of anything.
  it("drops the whole block when one item cites an unsupplied URL", () => {
    const items = fridayItems();
    items[2] = item("tool", "Nástroj odjinud", "https://example.com/invented");
    const checked = checkPractical({ items, date: FRIDAY, groundedUrls: carried });
    expect(checked.block).toBeNull();
    expect(checked.problems).toEqual([
      expect.stringContaining("carries neither as a source nor on the Watchlist")
    ]);
  });

  it("drops a block whose copy breaks the Czech register", () => {
    const checked = checkPractical({
      items: [{
        ...item("tool", "Revoluční kalkulačka", CITED[0]!),
        body: "Tenhle průlomový nástroj jednoduše spočítá, o kolik se účet mění po nové sazbě."
      }],
      date: TUESDAY,
      groundedUrls: carried
    });
    expect(checked.block).toBeNull();
    expect(checked.problems).toEqual(
      expect.arrayContaining(["copy:hype", "copy:empty_adverb"])
    );
  });

  it("records the day the desk was asked and filed nothing", () => {
    const checked = checkPractical({ items: undefined, date: TUESDAY, groundedUrls: carried });
    expect(checked).toEqual({ block: null, problems: [PRACTICAL_NOT_FILED] });
  });
});

describe("what the provider is asked for", () => {
  it("withholds the field entirely while the switch is off", () => {
    const off = writeToolInputSchema(false).properties as Record<string, unknown>;
    const on = writeToolInputSchema(true).properties as Record<string, unknown>;
    expect(off).not.toHaveProperty("practical");
    expect(on).toHaveProperty("practical");
    // Withholding one field changes nothing else about the contract.
    expect(Object.keys(on).filter((key) => key !== "practical")).toEqual(Object.keys(off));
  });
});

describe("an edition produced with the switch on", () => {
  it("publishes the Friday tools issue in the Czech frontmatter", async () => {
    const result = await produceEdition(
      await productionInput(await writerResponses(FRIDAY, fridayItems()), FRIDAY, true)
    );
    const published = edition(result);
    const practical = published.article.cs.frontmatter.practical;
    expect(practical?.variant).toBe("friday-tools");
    expect(practical?.items.map((entry) => entry.kind)).toEqual(["tool", "tool", "tool", "prompt"]);
    // One write call, no rewrite: the block travels in the payload that was already paid for.
    expect(result.report.usage.map((usage) => usage.stage)).toEqual(["curate", "write"]);
    expect(validateEditionForDelivery(published).status).toBe("edition");
  });

  it("publishes the edition without the block when the desk filed a bad one", async () => {
    const items = fridayItems();
    items[1] = item("tool", "Nástroj odjinud", "https://example.com/invented");
    const result = await produceEdition(
      await productionInput(await writerResponses(FRIDAY, items), FRIDAY, true)
    );
    const published = edition(result);
    expect(published.article.cs.frontmatter.practical).toBeUndefined();
    expect(result.report.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("practical_dropped:")])
    );
    expect(result.report.usage.map((usage) => usage.stage)).toEqual(["curate", "write"]);
  });

  // The writing packet offers up to twelve runner-ups and the delivered frontmatter carries four
  // of them. A block grounded in the difference passed the producer and then failed the delivery
  // boundary, and a refused package costs the whole edition rather than the extra.
  it("drops a block grounded in a supplied URL the package will not carry", async () => {
    const items = fridayItems();
    items[2] = item(
      "tool",
      "Nástroj z nezařazeného zdroje",
      "https://simonwillison.net/2026/Aug/4/example-inference-test/"
    );
    const result = await produceEdition(
      await productionInput(await writerResponses(FRIDAY, items), FRIDAY, true)
    );
    const published = edition(result);
    expect(published.article.cs.frontmatter.practical).toBeUndefined();
    expect(validateEditionForDelivery(published).status).toBe("edition");
  });

  it("ignores a filed block while the switch is off", async () => {
    const result = await produceEdition(
      await productionInput(await writerResponses(FRIDAY, fridayItems()), FRIDAY, false)
    );
    const published = edition(result);
    expect(published.article.cs.frontmatter.practical).toBeUndefined();
    expect(result.report.warnings.filter((warning) => warning.startsWith("practical"))).toEqual([]);
  });
});

describe("the delivery boundary", () => {
  async function fridayEdition(): Promise<Extract<EditionPackage, { status: "edition" }>> {
    return edition(await produceEdition(
      await productionInput(await writerResponses(FRIDAY, fridayItems()), FRIDAY, true)
    ));
  }

  it("refuses a block whose source the delivered package does not carry", async () => {
    const tampered = resealed(await fridayEdition(), (frontmatter) => {
      const practical = frontmatter.practical as { items: { source_url: string }[] };
      practical.items[0]!.source_url = "https://example.com/added-after-the-fact";
    });
    expect(() => validateEditionForDelivery(tampered)).toThrow(DeliveryPackageError);
    expect(() => validateEditionForDelivery(tampered)).toThrow(
      /carries neither as a source nor on the Watchlist/
    );
  });

  it("refuses a tools issue moved onto a day that is not a Friday", async () => {
    const published = await fridayEdition();
    // Re-date the whole package the way a mis-scheduled run would, and keep it self-consistent
    // so nothing but the weekday rule can be what rejects it.
    const moved = structuredClone(published) as unknown as Record<string, unknown> & {
      date: string;
      idempotencyKey: string;
      article: { cs: { frontmatter: Record<string, unknown> } };
    };
    moved.date = TUESDAY;
    moved.article.cs.frontmatter.date = TUESDAY;
    const key = editionPackageHash(moved);
    moved.idempotencyKey = key;
    (moved.article.cs.frontmatter.generation as { package_hash: string }).package_hash = key;
    expect(() => validateEditionForDelivery(moved)).toThrow(/which is not a Friday/);
  });

  it("refuses a block the package schema itself rejects", async () => {
    const tampered = resealed(await fridayEdition(), (frontmatter) => {
      const practical = frontmatter.practical as { variant: string };
      practical.variant = "daily";
    });
    const parsed = EditionPackageSchema.safeParse(tampered);
    expect(parsed.success).toBe(false);
    expect(() => validateEditionForDelivery(tampered)).toThrow(DeliveryPackageError);
  });

  it("still accepts every edition that carries no practical block at all", async () => {
    const golden = JSON.parse(await readFile(path.join(fixtureRoot, "golden-package.json"), "utf8"));
    expect(validateEditionForDelivery(golden).status).toBe("edition");
  });
});
