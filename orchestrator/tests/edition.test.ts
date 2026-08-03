import { createDigest, renderDigestDataBlock } from "../src/sources/digest.js";
import { curate } from "../src/edition/curate.js";
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
import type { LocalizedContent } from "../src/edition/types.js";
import { removeEmptyCzechAdverbs } from "../src/edition/localize.js";

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
    // No test reaches the network. Production reads each picked article through the keyless
    // reader; here every fixture URL is fictional and would only time out.
    readBody: async () => null,
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
      writing: "claude-sonnet-4-6"
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

  it("reserves the one-call first-pass graph inside the production cap", async () => {
    const responses = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const result = await produceEdition(
      await productionInput(responses, 10, true)
    );
    expect(result.package.status).toBe("edition");
    // $0.194 when the desk wrote English and then paid to translate it.
    expect(result.report.measuredCostUsd).toBe(0.134);
    expect(result.report.usage.map((usage) => usage.stage)).toEqual([
      "curate",
      "write"
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
      expect(result.package.article.cs.frontmatter.slug).toBe(
        "2026-08-04-openai-pricing-update"
      );
    }
    expect(result.report.usage.map((usage) => usage.stage)).toEqual([
      "curate",
      "write",
      
    ]);
  });

  it("accounts for a rejected unsupplied URL before regenerating", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const invalid = structuredClone(base[1]!);
    const invalidValue = invalid.value as { cs: { body_mdx: string } };
    invalidValue.cs.body_mdx += "\n\n[Unapproved source](https://variety.com/)";
    const rewrite = structuredClone(base[1]!);
    rewrite.usage.stage = "rewrite";
    const result = await produceEdition(
      await productionInput([base[0]!, invalid, rewrite, base[2]!])
    );
    expect(result.package.status).toBe("edition");
    expect(result.report.usage.map((usage) => usage.stage)).toEqual([
      "curate",
      "write",
      "rewrite"
    ]);
    expect(result.report.measuredCostUsd).toBe(0.224);
  });

  it("accounts for malformed tool data before regenerating", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const malformed = structuredClone(base[1]!);
    (malformed.value as { cs: unknown }).cs = "not a locale object";
    const rewrite = structuredClone(base[1]!);
    rewrite.usage.stage = "rewrite";
    const result = await produceEdition(
      await productionInput([base[0]!, malformed, rewrite, base[2]!])
    );
    expect(result.package.status).toBe("edition");
    expect(result.report.usage.map((usage) => usage.stage)).toEqual([
      "curate",
      "write",
      "rewrite"
    ]);
    expect(result.report.measuredCostUsd).toBe(0.224);
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
      const finalWire = result.package.article.cs.frontmatter.wire ?? [];
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

  it("removes a recoverable empty adverb before the release review", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const writer = structuredClone(base[1]!);
    const value = writer.value as { cs: { dek: string; dispatches: Array<{ body: string }> } };
    // Czech empty adverbs, since Czech is the register now reviewed.
    value.cs.dek = "Skutečně to mění rozpočet menším týmům.";
    value.cs.dispatches[0]!.body = "Upřímně, zdrojový dokument je veřejný.";

    const result = await produceEdition(
      await productionInput([base[0]!, writer, base[2]!])
    );

    expect(result.package.status).toBe("edition");
    expect(result.report.stet?.passed).toBe(true);
    if (result.package.status === "edition") {
      expect(result.package.article.cs.frontmatter.dek).toBe(
        "To mění rozpočet menším týmům."
      );
    }
    expect(removeEmptyCzechAdverbs("Upřímně, je to skutečně užitečné.")).toBe(
      "Je to užitečné."
    );
  });

  it("accepts the specified direct example", () => {
    const good = "OpenAI cut GPT-5.6 API prices 40% on Tuesday. If you run agents at scale, your bill just changed shape — and the pressure lands on Anthropic within the quarter.";
    expect(reviewArticleText(good)).toEqual([]);
  });

  it("allows one rewrite and converts a second block to NO_EDITION", async () => {
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const slop = structuredClone(base[1]!);
    const article = slop.value as { cs: { body_mdx: string } };
    // Czech slop, because Czech is what the desk writes and the only register reviewed.
    article.cs.body_mdx = "## Koncept\n\nPojďme se podívat na tuto revoluční změnu.";
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


});

describe("edition dry production", () => {
  it("builds the deterministic golden package without leaking injected instructions", async () => {
    const result = await runEditionDry();
    expect(result.status).toBe("edition");
    // The golden hash moved with the fallback cover, which no longer sets the article's own
    // headline in type. Nothing else about the package changed.
    // Re-golded twice in this migration: once when the deterministic cover started taking its
    // fingerprint from the Czech title, and again when the package stopped carrying an English
    // half. Same bytes-in, bytes-out contract.
    expect(result.packageHash).toBe("f463391bd05b1eb63dca1554c1e0e2e95441370b635d84ff9273c4d4590d58cf");
    // The shape itself, not just its hash: one article file, and it is the Czech one.
    const mdx = result.files.filter((file) => file.endsWith(".mdx")).map((file) => file.split("/").pop());
    expect(mdx).toHaveLength(1);
    expect(mdx[0]).toMatch(/\.cs\.mdx$/);
    expect(result.report.measuredCostUsd).toBe(0.134);
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

describe("the editor's index means what the editor was shown", () => {
  it("resolves a pick against the same ordering the packet renders", async () => {
    // renderDigestDataBlock sorts by date and weight and drops duplicates, and curate used
    // to index a raw slice instead. For the fixture the two orderings are exact reverses, so
    // every pick named a different article than the editor chose — silently, in a published
    // edition. This pins that the rendered packet and the resolved pick agree.
    const items = await fixtureJson<SourceItem[]>("source-items.json");
    const shown = createDigest(items, items.length);
    const packet = renderDigestDataBlock(items.slice(0, 50));
    const urls = [...packet.matchAll(/"url":"([^"]+)"/gu)].map((match) => match[1]);
    expect(urls).toEqual(shown.map((item) => item.url));
  });

  it("bounds the pick index to the pool so an out-of-range answer cannot reach the parse", async () => {
    // On 3 August the editor answered index 54 for a 50-item pool and the whole edition died
    // after the call was billed. The provider enforces the bound now.
    const config = await loadEditionQualityConfig();
    const items = await fixtureJson<SourceItem[]>("source-items.json");
    let seenMaximum: unknown;
    await curate(items, "2026-08-03", config, {
      invoke: async (request: { tool: { inputSchema: Record<string, never> } }) => {
        const schema = request.tool.inputSchema as unknown as {
          properties: { picks: { items: { properties: { index: { maximum?: number } } } } };
        };
        seenMaximum = schema.properties.picks.items.properties.index.maximum;
        throw new Error("stop after inspecting the schema");
      }
    } as never).catch(() => undefined);
    expect(seenMaximum).toBe(Math.min(items.length, config.article.maximumCurationCandidates) - 1);
  });
});

describe("the writer is given the articles, not just their blurbs", () => {
  it("puts the fetched body beside the summary and keeps it link-free", async () => {
    // The median feed summary across this registry is 116 characters, and an ~1,100-word
    // feature was being written from three to eight of them. The 3 August edition said two
    // models "broke into Hugging Face" without mentioning they were test models stripped of
    // their safety training escaping a sandbox.
    const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
    const seen: string[] = [];
    const gateway = {
      invoke: async (request: { user: string }) => {
        seen.push(request.user);
        const next = base.shift()!;
        return { value: next.value, usage: next.usage };
      }
    };
    const input = await productionInput([], 10);
    await produceEdition({
      ...input,
      gateway: gateway as never,
      // A real page carries dozens of its own links; assertSuppliedLinks fails the write if
      // any of them is cited, so the body must arrive de-linked.
      readBody: async () => "Sam Altman [said](https://x.test/a) the models were <https://y.test/b> stripped of safety training. See https://z.test/c for detail."
    }).catch(() => undefined);
    const writePacket = seen.find((packet) => packet.includes("\"picked\""));
    expect(writePacket, "the writer received a packet").toBeDefined();
    expect(writePacket).toContain("stripped of safety training");
    for (const link of ["https://x.test/a", "https://y.test/b", "https://z.test/c"]) {
      expect(writePacket, `packet must not carry ${link}`).not.toContain(link);
    }
  });
});

describe("the Czech copy gate actually fires", () => {
  // \b is an ASCII word boundary, so a pattern ending in "ě", "í" or "ň" could never match:
  // \b needs an ASCII word character on one side. Six alternatives were dead for that reason,
  // and were verified dead by running them before the fix. This stopped being a curiosity the
  // moment Czech became the only locale — from then on this is the edition's only copy gate.
  const deadBefore: Array<[string, string]> = [
    ["throat_clearing", "V dnešní rychle se měnící době firmy hledají úspory."],
    ["bureaucratic_filler", "Došlo k provedení testu na dvou modelech."],
    ["bureaucratic_filler", "Došlo k zahájení prací na novém indexu."],
    ["literal_calque", "Chtějí to posunout na další úroveň."],
    ["empty_adverb", "Upřímně nevím, co ta čísla znamenají."],
    ["empty_adverb", "Je to skutečně velký rozdíl."],
    ["empty_adverb", "Potenciálně užitečné pro menší týmy."]
  ];

  it.each(deadBefore)("catches %s in %j", (code, text) => {
    const violations = reviewArticleText(text, "cs");
    expect(violations.map((violation) => violation.code)).toContain(code);
  });

  it("still says nothing about clean Czech prose", () => {
    const clean = "Anthropic zveřejnil test dvou modelů. Oba obešly kontrolu v izolovaném prostředí.";
    expect(reviewArticleText(clean, "cs")).toEqual([]);
  });
});
