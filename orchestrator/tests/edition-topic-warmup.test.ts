import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EditionQualityConfigSchema,
  loadEditionQualityConfig
} from "../src/edition/config.js";
import {
  FixtureEditionModelGateway,
  type FixtureModelResponse
} from "../src/edition/fixture.js";
import { recentEditionTags } from "../src/edition/live.js";
import { produceEdition, type EditionProductionInput } from "../src/edition/production.js";
import { repoRoot } from "../src/paths.js";
import { loadSourceRegistry } from "../src/sources/registry.js";
import { SourceItemSchema, type SourceItem } from "../src/sources/types.js";

const fixtureRoot = path.join(repoRoot, "orchestrator", "tests", "fixtures", "edition");

async function fixtureJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(fixtureRoot, name), "utf8")) as T;
}

/** The fixture writer emits exactly these two tags, so they are the whole topic set. */
const ARTICLE_TAGS = ["models", "pricing"];

async function inputWithHistory(
  responses: FixtureModelResponse[],
  recentEditionTags: readonly (readonly string[])[]
): Promise<EditionProductionInput> {
  const [rawItems, config, registry] = await Promise.all([
    fixtureJson<unknown[]>("source-items.json"),
    loadEditionQualityConfig(),
    loadSourceRegistry()
  ]);
  const items: SourceItem[] = rawItems.map((item) => SourceItemSchema.parse(item));
  return {
    date: "2026-08-04",
    now: new Date("2026-08-04T03:55:00.000Z"),
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
    recentEditionTags,
    // No test reaches the network; every fixture URL is fictional.
    readBody: async () => null,
    meetingRef: "meetings/2026-08-04-cu-edition",
    roomUrl: "https://boardless.example/meetings/2026-08-04-cu-edition",
    whyThisStory: "Four independent sources document a price cut that changes production budgets.",
    mode: "dry_run",
    config,
    gateway: new FixtureEditionModelGateway(responses)
  };
}

/** curate + write. Nothing here needs a rewrite: the topic gate no longer asks for one. */
async function responses(): Promise<FixtureModelResponse[]> {
  const base = await fixtureJson<FixtureModelResponse[]>("model-responses.json");
  return [base[0]!, base[1]!];
}

describe("repeated-topic share", () => {
  it("pins the threshold to the arithmetic of one shared tag", async () => {
    const config = await loadEditionQualityConfig();
    expect(config.quality.repeatedTopicWarmupEditions).toBe(3);
    expect(config.quality.maximumRepeatedTopicFrequency).toBe(0.5);
    // The score is (tags already carried) / (tags), and the gate fires above the threshold, so
    // 0.5 fires exactly when more than half the topic set is a rerun. One shared tag scores
    // 1/t, at most 1/2 across every set the writer contract lets hold more than one tag, so a
    // single recurring tag can never reach the threshold.
    expect(1 / 2).toBeLessThanOrEqual(config.quality.maximumRepeatedTopicFrequency);
    for (const tagCount of [2, 3, 4, 5, 6]) {
      expect(1 / tagCount).toBeLessThanOrEqual(config.quality.maximumRepeatedTopicFrequency);
    }
  });

  it("refuses a threshold that one shared tag would trip", async () => {
    const config = await loadEditionQualityConfig();
    // 0.4 puts a two-tag article with one recurring tag at 0.5, past the threshold, which is
    // the reading the share replaced.
    expect(() =>
      EditionQualityConfigSchema.parse({
        ...config,
        quality: { ...config.quality, maximumRepeatedTopicFrequency: 0.4 }
      })
    ).toThrow(/maximumRepeatedTopicFrequency/u);
    expect(() =>
      EditionQualityConfigSchema.parse({
        ...config,
        quality: { ...config.quality, maximumRepeatedTopicFrequency: 0.5 }
      })
    ).not.toThrow();
  });

  it("does not read one shared tag out of two as a repeated topic", async () => {
    // "models" ran in two of the three prior editions; "pricing" is new. Half the topic set is
    // a rerun, so 1/2 = 0.5 and the gate stays quiet. The window-based score read the same
    // history as (2+1)/(3+1) = 0.75 and ended the day no_edition on one shared tag.
    const result = await produceEdition(
      await inputWithHistory(await responses(), [
        [ARTICLE_TAGS[0]!],
        [ARTICLE_TAGS[0]!],
        ["research"]
      ])
    );
    expect(result.report.quality?.metrics.repeatedTopicFrequency).toBe(0.5);
    expect(result.report.warnings).not.toContain("quality:maximum_repeated_topic_frequency");
    expect(result.package.status).toBe("edition");
  });

  it("reads the whole topic set running again as a repeated topic", async () => {
    // Both tags have run, so 2/2 = 1.00. The verdict is recorded even though publication is
    // unblocked; edition-publication-gate.test.ts covers what the record then says.
    const result = await produceEdition(
      await inputWithHistory(await responses(), [
        [ARTICLE_TAGS[0]!],
        [ARTICLE_TAGS[1]!],
        ["research"]
      ])
    );
    expect(result.report.quality?.metrics.repeatedTopicFrequency).toBe(1);
    expect(result.report.quality?.result.violations).toEqual([
      "maximum_repeated_topic_frequency"
    ]);
  });

  it("counts only editions that published topics towards the warm-up", async () => {
    // Two no-edition days and one edition. A no-edition day is recorded with `tags: []`
    // (delivery/outbox.ts), which used to satisfy the warm-up and make a sample of one look
    // like a sample of three; the score was then reported as a measurement.
    const result = await produceEdition(
      await inputWithHistory(await responses(), [[], [], ["research"]])
    );
    expect(result.report.warnings).toContain("repeated_topic_warmup:1/3");
    expect(result.report.quality?.metrics.repeatedTopicFrequency).toBe(0);
    expect(result.package.status).toBe("edition");
  });

  it("refuses to reach a verdict on a window a quiet day padded to full", async () => {
    // Two published editions and one quiet day. Counting the quiet day cleared the warm-up on
    // a sample of two and the run then reported 2/2 = 1.00 as a measurement — a total-rerun
    // verdict manufactured by a day that carried no topics at all.
    const result = await produceEdition(
      await inputWithHistory(await responses(), [
        [ARTICLE_TAGS[0]!],
        [ARTICLE_TAGS[1]!],
        []
      ])
    );
    expect(result.report.warnings).toContain("repeated_topic_warmup:2/3");
    expect(result.report.quality?.metrics.repeatedTopicFrequency).toBe(0);
    expect(result.report.quality?.result.violations ?? []).not.toContain(
      "maximum_repeated_topic_frequency"
    );
  });
});

describe("the recent-edition window read from delivery receipts", () => {
  it("skips a no-edition receipt instead of spending a window slot on it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "edition-window-"));
    await mkdir(path.join(root, "edition", "deliveries"), { recursive: true });
    const receipts: Record<string, string[]> = {
      "2026-07-30": ["policy"],
      "2026-07-31": ["hardware"],
      "2026-08-01": [],
      "2026-08-02": [],
      "2026-08-03": ["research"]
    };
    for (const [date, tags] of Object.entries(receipts)) {
      await writeFile(
        path.join(root, "edition", "deliveries", `${date}.json`),
        JSON.stringify({ date, status: "delivered", tags })
      );
    }
    // Newest first, quiet days dropped. Taking the four newest receipts returned two empty
    // lists and only two editions, so the window was half padding.
    expect(await recentEditionTags(root)).toEqual([
      ["research"],
      ["hardware"],
      ["policy"]
    ]);
  });
});
