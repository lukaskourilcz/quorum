import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EditionPackageSchema } from "../src/contracts/edition-package.js";
import { repoRoot } from "../src/paths.js";
import { loadSourceRegistry } from "../src/sources/registry.js";
import { SourceItemSchema, type SourceItem } from "../src/sources/types.js";
import { quoteYamlDates, serializeMdx } from "../src/edition/content-write.js";
import {
  EditionQualityConfigSchema,
  loadEditionQualityConfig
} from "../src/edition/config.js";
import { runEditionDry } from "../src/edition/dry-run.js";
import {
  FixtureEditionModelGateway,
  type FixtureModelResponse
} from "../src/edition/fixture.js";
import {
  BudgetedEditionModelGateway,
  editionUsageCost
} from "../src/edition/models.js";
import { hasValidEditionPackageHash } from "../src/edition/package.js";
import { produceEdition, type EditionProductionInput } from "../src/edition/production.js";
import {
  CZECH_BENCHMARK_URLS,
  ENGLISH_BENCHMARK_URLS
} from "../src/edition/registers.js";
import {
  computeSignalStrength,
  evaluateEditionQuality,
  sourceDiversity,
  titleSimilarity
} from "../src/edition/quality.js";
import { reviewArticleText } from "../src/edition/stet.js";
import { reviewTranslationParity } from "../src/edition/localize.js";
import type { LocalizedContent } from "../src/edition/types.js";
import { removeEmptyEnglishAdverbs } from "../src/edition/write.js";

const fixtureRoot = path.join(
  repoRoot,
  "orchestrator",
  "tests",
  "fixtures",
  "edition"
);

async function fixtureJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), "utf8")) as T;
}

async function productionInput(
  responses: FixtureModelResponse[],
  successfulSources = 10,
  enforceBudget = false
): Promise<EditionProductionInput> {
  const [rawItems, config, registry] = await Promise.all([
    fixtureJson<unknown[]>("source-items.json"),
    loadEditionQualityConfig(),
    loadSourceRegistry()
  ]);
  const items: SourceItem[] = rawItems.map((item) => SourceItemSchema.parse(item));
  const fixtureGateway = new FixtureEditionModelGateway(responses);
  return {
    date: "2026-08-04",
    now: new Date("2026-08-04T03:55:00.000Z"),
    items,
    sources: registry.sources,
    sourceResults: registry.sources.slice(0, successfulSources).map((source) => ({
      sourceId: source.id,
      status: "success" as const,
      candidateItems: 1,
      durationMs: 0,
      errorCode: null,
      errorMessage: null
    })),
    recentEditionTags: [["policy"], ["hardware"], ["research"], ["media"]],
    meetingRef: "meetings/2026-08-04-cu-edition",
    roomUrl: "https://boardless.example/meetings/2026-08-04-cu-edition",
    whyThisStory: "Four independent sources document a price cut that changes production budgets.",
    mode: "dry_run",
    config,
    gateway: enforceBudget
      ? new BudgetedEditionModelGateway(fixtureGateway, 0.35)
      : fixtureGateway
  };
}

describe("edition configuration and quality", () => {
  it("pins enforced thresholds, models and regeneration limits", async () => {
    const config = await loadEditionQualityConfig();
    expect(EditionQualityConfigSchema.parse(config).quality.enforcement).toBe("enforce");
    expect(config.models).toEqual({
      curation: "claude-sonnet-4-6",
      writing: "claude-sonnet-4-6",
      localization: "claude-sonnet-4-6"
    });
    expect(config.quality.minimumSignalStrength).toBe(45);
    expect(config.budgets.editionProductionUsd).toBe(0.35);
    expect(config.budgets.maximumRegenerationAttemptsPerDate).toBe(2);
    expect(config.stet.maximumRewriteAttempts).toBe(1);
    expect(config.hacek.maximumRewriteAttempts).toBe(1);
  });

  it("ports signal, diversity, similarity and measured-token cost math", async () => {
    const registry = (await loadSourceRegistry()).sources;
    expect(computeSignalStrength({
      cited: [
        { sourceId: "anthropic-news" },
        { sourceId: "openai-blog" },
        { sourceId: "deepmind-blog" },
        { sourceId: "google-research" }
      ],
      registry
    })).toBe(91);
    expect(sourceDiversity(["a", "b", "c", "d"])).toBe(0.75);
    expect(titleSimilarity("OpenAI ships a new model", "OpenAI ships new model")).toBeGreaterThan(0.7);
    expect(editionUsageCost("claude-opus-4-7", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000
    })).toBe(36.75);
  });

  it("reserves the English and Czech first-pass call graph inside the production cap", async () => {
    const responses = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const result = await produceEdition(
      await productionInput(responses, 10, true)
    );
    expect(result.package.status).toBe("edition");
    expect(result.report.measuredCostUsd).toBe(0.194);
    expect(result.report.usage.map((usage) => usage.stage)).toEqual([
      "curate",
      "write",
      "localize"
    ]);
  });

  it("normalizes a human-readable tool slug without spending a repair call", async () => {
    const responses = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const writer = structuredClone(responses[1]!);
    (writer.value as { slug: string }).slug = "OpenAI / pricing — update!";
    const result = await produceEdition(
      await productionInput([responses[0]!, writer, responses[2]!], 10, true)
    );
    expect(result.package.status).toBe("edition");
    if (result.package.status === "edition") {
      expect(result.package.article.en.frontmatter.slug).toBe(
        "2026-08-04-openai-pricing-update"
      );
    }
    expect(result.report.usage.map((usage) => usage.stage)).toEqual([
      "curate",
      "write",
      "localize"
    ]);
  });

  it("accounts for a rejected unsupplied URL before regenerating", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const invalid = structuredClone(base[1]!);
    const invalidValue = invalid.value as { en: { body_mdx: string } };
    invalidValue.en.body_mdx += "\n\n[Unapproved source](https://variety.com/)";
    const rewrite = structuredClone(base[1]!);
    rewrite.usage.stage = "rewrite";
    const result = await produceEdition(
      await productionInput([base[0]!, invalid, rewrite, base[2]!])
    );
    expect(result.package.status).toBe("edition");
    expect(result.report.usage.map((usage) => usage.stage)).toEqual([
      "curate",
      "write",
      "rewrite",
      "localize"
    ]);
    expect(result.report.measuredCostUsd).toBe(0.284);
  });

  it("accounts for malformed tool data before regenerating", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const malformed = structuredClone(base[1]!);
    (malformed.value as { en: unknown }).en = "not a locale object";
    const rewrite = structuredClone(base[1]!);
    rewrite.usage.stage = "rewrite";
    const result = await produceEdition(
      await productionInput([base[0]!, malformed, rewrite, base[2]!])
    );
    expect(result.package.status).toBe("edition");
    expect(result.report.usage.map((usage) => usage.stage)).toEqual([
      "curate",
      "write",
      "rewrite",
      "localize"
    ]);
    expect(result.report.measuredCostUsd).toBe(0.284);
  });

  it("replaces a repeated lead source in Watchlist with a verified runner-up", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const writer = structuredClone(base[1]!);
    const wire = (writer.value as { wire: Array<{ title: string; url: string; source: string }> }).wire;
    wire[0] = {
      title: "Repeated lead source",
      url: "https://www.anthropic.com/news/example-price-update",
      source: "anthropic-news"
    };
    const result = await produceEdition(
      await productionInput([base[0]!, writer, base[2]!])
    );
    expect(result.package.status).toBe("edition");
    if (result.package.status === "edition") {
      const finalWire = result.package.article.en.frontmatter.wire ?? [];
      expect(finalWire).toHaveLength(4);
      expect(finalWire.map((item) => item.url)).not.toContain(
        "https://www.anthropic.com/news/example-price-update"
      );
    }
  });

  it("regenerates an enforced failure twice, then calls NO_EDITION", async () => {
    const config = await loadEditionQualityConfig();
    const metrics = {
      successfulSources: 1,
      candidateItems: 2,
      citedSources: 1,
      signalStrength: 20,
      maximumSingleSourceShare: 1,
      sourceDiversity: 0,
      duplicateStorySimilarity: 0,
      repeatedTopicFrequency: 0,
      primarySourceRelevant: false,
      primarySourcePresent: false,
      unsupportedWatchlistItems: 0,
      costPerRun: 0.1
    };
    expect(evaluateEditionQuality(metrics, config, 0).action).toBe("regenerate");
    expect(evaluateEditionQuality(metrics, config, 1).action).toBe("regenerate");
    expect(evaluateEditionQuality(metrics, config, 2).action).toBe("no_edition");
  });

  it("caps the production runner at two quality regenerations", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const rewriteOne = structuredClone(base[1]!);
    const rewriteTwo = structuredClone(base[1]!);
    const localizationOne = structuredClone(base[2]!);
    const localizationTwo = structuredClone(base[2]!);
    rewriteOne.usage.stage = "rewrite";
    rewriteTwo.usage.stage = "rewrite";
    const result = await produceEdition(
      await productionInput([
        base[0]!,
        base[1]!,
        base[2]!,
        rewriteOne,
        localizationOne,
        rewriteTwo,
        localizationTwo
      ], 1)
    );
    expect(result.package.status).toBe("no_edition");
    expect(result.report.regenerationAttempts).toBe(2);
    expect(result.report.quality?.result.action).toBe("no_edition");
    if (result.package.status === "no_edition") {
      expect(result.package.board.noEditionReason).toMatch(/^quality_block:/);
    }
  });
});

describe("STET article register", () => {
  it("blocks the specified generated-text tells", () => {
    const bad = "This rapidly evolving landscape could potentially be a game-changer for developers everywhere.";
    expect(reviewArticleText(bad).map((violation) => violation.code)).toEqual(
      expect.arrayContaining(["hype", "corporate_filler", "empty_adverb"])
    );
  });

  it("removes a recoverable empty adverb before the English release review", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const writer = structuredClone(base[1]!);
    const value = writer.value as { en: { dek: string; dispatches: Array<{ body: string }> } };
    value.en.dek = "This actually changes the budget for smaller teams.";
    value.en.dispatches[0]!.body = "Importantly, the source document is public.";

    const result = await produceEdition(
      await productionInput([base[0]!, writer, base[2]!])
    );

    expect(result.package.status).toBe("edition");
    expect(result.report.stet?.passed).toBe(true);
    if (result.package.status === "edition") {
      expect(result.package.article.en.frontmatter.dek).toBe(
        "This changes the budget for smaller teams."
      );
    }
    expect(removeEmptyEnglishAdverbs("Actually, this is really useful.")).toBe(
      "this is useful."
    );
  });

  it("accepts the specified direct example", () => {
    const good = "OpenAI cut GPT-5.6 API prices 40% on Tuesday. If you run agents at scale, your bill just changed shape — and the pressure lands on Anthropic within the quarter.";
    expect(reviewArticleText(good)).toEqual([]);
  });

  it("allows one rewrite and converts a second STET block to NO_EDITION", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const slop = structuredClone(base[1]!);
    const article = slop.value as { en: { body_mdx: string }; cs: { body_mdx: string } };
    article.en.body_mdx = "## Draft\n\nWe should leverage synergies in this rapidly evolving landscape.";
    article.cs.body_mdx = "## Koncept\n\nWe should leverage synergies in this rapidly evolving landscape.";
    const rewrite = structuredClone(slop);
    rewrite.usage.stage = "rewrite";
    const result = await produceEdition(await productionInput([base[0]!, slop, rewrite]));
    expect(result.package.status).toBe("no_edition");
    if (result.package.status === "no_edition") {
      expect(result.package.board.noEditionReason).toBe("stet_block_after_rewrite");
    }
    expect(result.report.stetBlocks).toBe(2);
    expect(result.report.regenerationAttempts).toBe(1);
  });
});

describe("language desk registers and parity", () => {
  it("pins ten benchmark articles per language without importing outlet copy", () => {
    expect(CZECH_BENCHMARK_URLS).toHaveLength(10);
    expect(ENGLISH_BENCHMARK_URLS).toHaveLength(10);
    expect(new Set(CZECH_BENCHMARK_URLS).size).toBe(10);
    expect(new Set(ENGLISH_BENCHMARK_URLS).size).toBe(10);
    expect(CZECH_BENCHMARK_URLS.every((url) => new URL(url).hostname === "cc.cz")).toBe(true);
    expect(ENGLISH_BENCHMARK_URLS.every((url) => new URL(url).hostname === "techcrunch.com")).toBe(true);
  });

  it("blocks Czech filler and catches URL, number and section drift", () => {
    expect(reviewArticleText(
      "Pojďme se podívat na revoluční řešení, které dává smysl pro firmy.",
      "cs"
    ).map((violation) => violation.code)).toEqual(
      expect.arrayContaining(["throat_clearing", "hype", "literal_calque"])
    );
    const english: LocalizedContent = {
      title: "Vendor cuts price 40%",
      dek: "The change applies in 2026.",
      alternativeHeadlines: ["One alternative"],
      bodyMdx: "## Change\n\nSource: https://example.com/source. Price fell 40%.",
      illustrationAlt: "A price card",
      dispatches: [{
        title: "Rate card",
        body: "The vendor published the rate.",
        source_url: "https://example.com/source",
        topic: "pricing"
      }],
      whyItMatters: ["Budgets change."],
      whatChanged: ["The rate fell."],
      uncertainty: ["Duration is unknown."]
    };
    const czech: LocalizedContent = {
      ...english,
      title: "Dodavatel snížil cenu o 30 %",
      dek: "Změna platí v roce 2027.",
      bodyMdx: "### Změna\n\nZdroj: https://example.com/other. Cena klesla o 30 %.",
      dispatches: [{
        ...english.dispatches[0]!,
        source_url: "https://example.com/other",
        topic: "ceny"
      }]
    };
    const codes = reviewTranslationParity(english, czech).violations.map(
      (violation) => violation.code
    );
    expect(codes).toEqual(expect.arrayContaining([
      "source_url_drift",
      "number_drift",
      "section_drift",
      "dispatch_source_drift",
      "dispatch_topic_drift"
    ]));
  });

  it("allows one Czech repair and blocks a second failed adaptation", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const repair = structuredClone(base[2]!);
    repair.usage.stage = "localize_rewrite";
    const slop = structuredClone(base[2]!);
    const slopValue = slop.value as { body_mdx: string };
    slopValue.body_mdx += "\n\nPojďme se podívat na tuto revoluční změnu.";

    const repaired = await produceEdition(
      await productionInput([base[0]!, base[1]!, slop, repair])
    );
    expect(repaired.package.status).toBe("edition");
    expect(repaired.report.hacekBlocks).toBe(1);

    const failedRepair = structuredClone(slop);
    failedRepair.usage.stage = "localize_rewrite";
    const blocked = await produceEdition(
      await productionInput([base[0]!, base[1]!, slop, failedRepair])
    );
    expect(blocked.package.status).toBe("no_edition");
    if (blocked.package.status === "no_edition") {
      expect(blocked.package.board.noEditionReason).toBe("hacek_block_after_rewrite");
    }
    expect(blocked.report.hacekBlocks).toBe(2);
  });
});

describe("edition dry production", () => {
  it("builds the deterministic golden package without leaking injected instructions", async () => {
    const result = await runEditionDry();
    expect(result.status).toBe("edition");
    expect(result.packageHash).toBe("a228c755075cc700f01c623777b2c179cd31a3ddaee7393c2abeed275aa41ed0");
    expect(result.report.measuredCostUsd).toBe(0.194);
    expect(result.report.quality?.result.passed).toBe(true);
    const artifact = JSON.parse(
      await readFile(
        path.join(repoRoot, "orchestrator", ".dry-run", "editions", "2026-08-04", "package.json"),
        "utf8"
      )
    );
    const editionPackage = EditionPackageSchema.parse(artifact);
    expect(hasValidEditionPackageHash(editionPackage)).toBe(true);
    if (editionPackage.status === "edition") {
      expect(editionPackage.image).toMatchObject({ origin: "svg", width: 1600, height: 900 });
      expect(Buffer.from(editionPackage.image.hero_bytes_base64, "base64").toString("utf8"))
        .toContain("FRAME");
    }
    expect(JSON.stringify(editionPackage)).not.toMatch(/ignore all previous|system prompt/i);
  });

  it("serializes quoted dates and a canonical final newline", () => {
    expect(quoteYamlDates("date: 2026-08-04\ngenerated_at: 2026-08-04T03:55:00.000Z")).toBe(
      'date: "2026-08-04"\ngenerated_at: "2026-08-04T03:55:00.000Z"'
    );
    expect(serializeMdx({ date: "2026-08-04", title: "Issue" }, "Body")).toBe(
      '---\ndate: "2026-08-04"\ntitle: Issue\n---\n\nBody\n'
    );
  });
});

describe("a rejected edition dies at the price of one write", () => {
  it("never reaches the Czech desk for a draft the quality gate refuses", async () => {
    // One full pass costs about $0.22 of the $0.35 per-edition cap and a rewrite reserves
    // $0.14, so a violation found after localization was terminal and both configured
    // regenerations were refused instantly, each recorded with durationMs 0. Supplying only
    // the three write responses and no localization at all is the assertion: if the run
    // still asked a language desk, it would have no response to take and would fail here.
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const rewriteOne = structuredClone(base[1]!);
    const rewriteTwo = structuredClone(base[1]!);
    rewriteOne.usage.stage = "rewrite";
    rewriteTwo.usage.stage = "rewrite";
    const result = await produceEdition(
      await productionInput([base[0]!, base[1]!, rewriteOne, rewriteTwo], 1)
    );
    expect(result.package.status).toBe("no_edition");
    expect(result.report.regenerationAttempts).toBe(2);
    expect(result.report.stages.some((stage) => stage.name.startsWith("hacek"))).toBe(false);
    expect(result.report.stages.some((stage) => stage.name.startsWith("stet"))).toBe(false);
  });
});
