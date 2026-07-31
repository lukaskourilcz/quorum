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
      writing: "claude-opus-4-7",
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
    expect(result.report.measuredCostUsd).toBe(0.254);
    expect(result.report.usage.map((usage) => usage.stage)).toEqual([
      "curate",
      "write",
      "localize"
    ]);
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
    expect(result.packageHash).toBe("98c929ed95bd54a1d9f6854420d343b7931598ee483d01920b895e44da86d43b");
    expect(result.report.measuredCostUsd).toBe(0.254);
    expect(result.report.quality?.result.passed).toBe(true);
    const artifact = JSON.parse(
      await readFile(
        path.join(repoRoot, "orchestrator", ".dry-run", "editions", "2026-08-04", "package.json"),
        "utf8"
      )
    );
    expect(artifact).toEqual(await fixtureJson("golden-package.json"));
    const editionPackage = EditionPackageSchema.parse(artifact);
    expect(hasValidEditionPackageHash(editionPackage)).toBe(true);
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
