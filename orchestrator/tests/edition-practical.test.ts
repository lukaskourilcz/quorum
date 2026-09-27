import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PracticalSchema,
  deliveredPractical,
  practicalErrors,
  type PracticalShape
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

/** The fixture's own date, a Tuesday. */
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

function filed(type: "prompt" | "tool" | "term", title: string, url: string) {
  return {
    type,
    title,
    text: "Otevři ceník poskytovatele, vlož do modelu svůj měsíční objem tokenů a nech si spočítat rozdíl proti minulé faktuře.",
    source_url: url
  };
}

function item(type: "prompt" | "tool" | "term", title: string, url: string, date = TUESDAY): PracticalShape {
  return deliveredPractical(filed(type, title, url), date);
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
  practical?: ReturnType<typeof filed>
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

describe("the delivered shape (aifirst#99, CONTRACTS.md §2)", () => {
  it("turns a filed item into type, title, text, url and verified_at on the edition's day", () => {
    expect(item("prompt", "Prompt na přepočet účtu", CITED[0]!)).toEqual({
      type: "prompt",
      title: "Prompt na přepočet účtu",
      text: expect.stringMatching(/^Otevři ceník/u),
      url: CITED[0],
      verified_at: TUESDAY
    });
    expect(PracticalSchema.safeParse(item("tool", "Kalkulačka nákladů", CITED[0]!)).success).toBe(true);
  });

  it("refuses a tool without a url, a url without verified_at and a text too short to follow", () => {
    expect(PracticalSchema.safeParse({ type: "tool", title: "Kalkulačka", text: "x".repeat(60) }).success).toBe(false);
    expect(PracticalSchema.safeParse({ type: "term", title: "Pojem", text: "x".repeat(60), url: CITED[0] }).success).toBe(false);
    expect(PracticalSchema.safeParse({ type: "term", title: "Pojem", text: "x".repeat(60) }).success).toBe(true);
    expect(PracticalSchema.safeParse({ ...item("prompt", "Prompt", CITED[0]!), text: "Zkus to." }).success).toBe(false);
    expect(PracticalSchema.safeParse({ ...item("prompt", "Prompt", CITED[0]!), text: "x".repeat(401) }).success).toBe(false);
  });
});

describe("what an item has to prove about itself", () => {
  const grounded = new Set<string>(CITED);

  it("names a source the edition does not carry", () => {
    expect(practicalErrors({ practical: item("tool", "Nástroj odjinud", "https://example.com/not-in-the-packet"), date: TUESDAY, groundedUrls: grounded })).toEqual([
      expect.stringContaining("carries neither as a source nor on the Watchlist")
    ]);
  });

  it("refuses a verification dated after its edition", () => {
    expect(practicalErrors({ practical: item("prompt", "Prompt", CITED[0]!, "2026-08-05"), date: TUESDAY, groundedUrls: grounded })).toEqual([
      expect.stringContaining("after its edition")
    ]);
  });

  it("refuses a link written into the reader-facing text", () => {
    const practical: PracticalShape = {
      ...item("term", "Jak přepočítat účet", CITED[0]!),
      text: "Postupuj podle návodu na https://example.com/guide a porovnej výsledek s fakturou za minulý měsíc."
    };
    expect(practicalErrors({ practical, date: TUESDAY, groundedUrls: grounded })).toEqual([
      expect.stringContaining("url is the only URL")
    ]);
  });
});

describe("the desk's filed item", () => {
  // What the delivered frontmatter will carry: the cited sources and one Watchlist URL.
  const carried = new Set<string>([...CITED, "https://feeds.arstechnica.com/example-price-comparison"]);

  it("keeps a grounded item", () => {
    const checked = checkPractical({ filed: filed("tool", "Kalkulačka nákladů na inferenci", CITED[0]!), date: TUESDAY, groundedUrls: carried });
    expect(checked.problems).toEqual([]);
    expect(checked.practical).toMatchObject({ type: "tool", url: CITED[0], verified_at: TUESDAY });
  });

  it("drops an item that cites an unsupplied URL", () => {
    const checked = checkPractical({ filed: filed("tool", "Nástroj odjinud", "https://example.com/invented"), date: TUESDAY, groundedUrls: carried });
    expect(checked.practical).toBeNull();
    expect(checked.problems).toEqual([expect.stringContaining("carries neither as a source nor on the Watchlist")]);
  });

  it("drops an item whose copy breaks the Czech register", () => {
    const checked = checkPractical({
      filed: { ...filed("tool", "Revoluční kalkulačka", CITED[0]!), text: "Tenhle průlomový nástroj jednoduše spočítá, o kolik se účet mění po nové sazbě." },
      date: TUESDAY,
      groundedUrls: carried
    });
    expect(checked.practical).toBeNull();
    expect(checked.problems).toEqual(expect.arrayContaining(["copy:hype", "copy:empty_adverb"]));
  });

  it("records the day the desk was asked and filed nothing", () => {
    expect(checkPractical({ filed: undefined, date: TUESDAY, groundedUrls: carried })).toEqual({ practical: null, problems: [PRACTICAL_NOT_FILED] });
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
  it("publishes the item in the Czech frontmatter in the reader's shape", async () => {
    const result = await produceEdition(
      await productionInput(await writerResponses(TUESDAY, filed("tool", "Kalkulačka nákladů na inferenci", CITED[0]!)), TUESDAY, true)
    );
    const published = edition(result);
    expect(published.article.cs.frontmatter.practical).toMatchObject({ type: "tool", url: CITED[0], verified_at: TUESDAY });
    // One write call, no rewrite: the item travels in the payload that was already paid for.
    expect(result.report.usage.map((usage) => usage.stage)).toEqual(["curate", "write"]);
    expect(validateEditionForDelivery(published).status).toBe("edition");
  });

  it("publishes the edition without the item when the desk filed a bad one", async () => {
    const result = await produceEdition(
      await productionInput(await writerResponses(TUESDAY, filed("tool", "Nástroj odjinud", "https://example.com/invented")), TUESDAY, true)
    );
    const published = edition(result);
    expect(published.article.cs.frontmatter.practical).toBeUndefined();
    expect(result.report.warnings).toEqual(expect.arrayContaining([expect.stringContaining("practical_dropped:")]));
    expect(result.report.usage.map((usage) => usage.stage)).toEqual(["curate", "write"]);
  });

  // The writing packet offers up to twelve runner-ups and the delivered frontmatter carries four
  // of them. An item grounded in the difference would pass the producer and then fail the delivery
  // boundary, and a refused package costs the whole edition rather than the extra.
  it("drops an item grounded in a supplied URL the package will not carry", async () => {
    const result = await produceEdition(
      await productionInput(await writerResponses(TUESDAY, filed("tool", "Nástroj z nezařazeného zdroje", "https://simonwillison.net/2026/Aug/4/example-inference-test/")), TUESDAY, true)
    );
    const published = edition(result);
    expect(published.article.cs.frontmatter.practical).toBeUndefined();
    expect(validateEditionForDelivery(published).status).toBe("edition");
  });

  it("ignores a filed item while the switch is off", async () => {
    const result = await produceEdition(
      await productionInput(await writerResponses(TUESDAY, filed("prompt", "Prompt na přepočet účtu", CITED[0]!)), TUESDAY, false)
    );
    const published = edition(result);
    expect(published.article.cs.frontmatter.practical).toBeUndefined();
    expect(result.report.warnings.filter((warning) => warning.startsWith("practical"))).toEqual([]);
  });
});

describe("the delivery boundary", () => {
  async function practicalEdition(): Promise<Extract<EditionPackage, { status: "edition" }>> {
    return edition(await produceEdition(
      await productionInput(await writerResponses(TUESDAY, filed("tool", "Kalkulačka nákladů na inferenci", CITED[0]!)), TUESDAY, true)
    ));
  }

  it("refuses an item whose source the delivered package does not carry", async () => {
    const tampered = resealed(await practicalEdition(), (frontmatter) => {
      (frontmatter.practical as { url: string }).url = "https://example.com/added-after-the-fact";
    });
    expect(() => validateEditionForDelivery(tampered)).toThrow(DeliveryPackageError);
    expect(() => validateEditionForDelivery(tampered)).toThrow(/carries neither as a source nor on the Watchlist/);
  });

  it("refuses an item the package schema itself rejects", async () => {
    const tampered = resealed(await practicalEdition(), (frontmatter) => {
      delete (frontmatter.practical as { url?: string }).url;
    });
    expect(EditionPackageSchema.safeParse(tampered).success).toBe(false);
    expect(() => validateEditionForDelivery(tampered)).toThrow(DeliveryPackageError);
  });

  it("still accepts every edition that carries no practical item at all", async () => {
    const golden = JSON.parse(await readFile(path.join(fixtureRoot, "golden-package.json"), "utf8"));
    expect(validateEditionForDelivery(golden).status).toBe("edition");
  });
});
