import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { buildCarouselSummary } from "@boardlessai/carousel-studio";
import type { DatasetEntry } from "../src/contracts/boardless-dataset.js";
import { DneskaiRecipePackageSchema } from "../src/contracts/dneskai-recipe.js";
import { EditionPackageSchema } from "../src/contracts/edition-package.js";
import { canonicalJson, sha256 } from "../src/hashing.js";
import { readRecordedAssetHashes } from "../src/social/media/recorded-hashes.js";
import { composeEditionSocialPack } from "../src/social/pack.js";
import { assertQueueItemPublishable, CapabilityAwareQueueItemSchema } from "../src/social/queue.js";
import { fridayToolsCopy } from "../src/social/recipe-copy.js";
import { draftDneskaiRecipes, dueRecipes, recipePackagePath, recipeQueuePath } from "../src/social/recipes.js";
import { atomicWriteJson } from "../src/state.js";
import { caughtUpEditionMeeting, czechOnlyEdition } from "./fixtures/caught-up-edition.js";

// quorum#592: DNESKAi's recipe posts — Friday tools, Saturday "how it was made", Sunday recap, and
// the lesson on a day with no edition. Deterministic, $0, drafts only.

const SITE = "https://dneskai.example";
const RENDER_TIMEOUT_MS = 120_000;
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(): Promise<{ root: string; state: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "dneskai-recipes-"));
  roots.push(root);
  return { root, state: path.join(root, "state") };
}

const lesson: DatasetEntry = {
  id: "lex-001",
  slug: "machine-learning",
  term: "Machine learning",
  category: "models",
  en: { short: "Software that learns rules from examples", full: "Machine learning is the approach where a program improves from examples." },
  cs: { short: "Software, který se pravidla učí z příkladů", full: "Strojové učení je přístup, kdy se program zlepšuje z příkladů místo pravidel napsaných ručně." },
  verified: "2026-07-01",
  source: "Mitchell, Machine Learning (1997)"
};

const tool = {
  kind: "tool" as const,
  title: "Kalkulačka nákladů na inferenci",
  body: "Spočítá měsíční účet za tokeny podle nových sazeb a ukáže rozdíl proti minulé faktuře po jednotlivých modelech.",
  source_url: "https://www.anthropic.com/news/example-price-update"
};

async function summary(state: string, date: string, slug: string, title: string) {
  const built = buildCarouselSummary({ venture: "caught-up", slug, date, title, dek: "Krátký perex vydání, který shrnuje, co se stalo.", points: ["Jeden bod vydání.", "Druhý bod vydání."] });
  await atomicWriteJson(state, `ventures/carousel-studio/summaries/caught-up/${date}-${slug}.json`, built);
}

function run(where: { root: string; state: string }, date: string, readEntry = async () => lesson as DatasetEntry | null) {
  return draftDneskaiRecipes({ date, stateRoot: where.state, repoRoot: where.root, siteUrl: SITE, now: new Date(`${date}T06:00:00.000Z`), readEntry });
}

describe("which recipe a day draws", () => {
  it("is Friday tools, Saturday how it was made, Sunday recap, and the lesson on a no-edition day", () => {
    expect(dueRecipes("2026-11-06", "EDITION")).toEqual(["friday-tools"]);
    expect(dueRecipes("2026-11-07", null)).toEqual(["how-it-was-made"]);
    expect(dueRecipes("2026-11-08", null)).toEqual(["weekly-recap"]);
    expect(dueRecipes("2026-11-05", "NO_EDITION")).toEqual(["no-edition"]);
    expect(dueRecipes("2026-11-06", "NO_EDITION")).toEqual(["friday-tools", "no-edition"]);
    expect(dueRecipes("2026-11-04", "EDITION")).toEqual([]);
  });
});

describe("the Friday tools copy", () => {
  it("leaves a price slot per tool for the owner and cites the source edition", () => {
    const copy = fridayToolsCopy([{ date: "2026-11-03", practical: tool, destination: `${SITE}/articles/a`, ref: "state/social/packs/2026-11-03.json" }])!;
    expect(copy.caption).toContain("[DOPLNIT: ověřit u výrobce]");
    expect(copy.caption).toContain(`${SITE}/articles/a?utm_source=instagram&utm_medium=post&utm_campaign=friday-tools`);
    expect(copy.ownerSlots).toEqual([{ label: "Cena: Kalkulačka nákladů na inferenci" }]);
    expect(copy.caption).not.toMatch(/\d+\s*(?:Kč|USD|€|\$)/u);
    expect(fridayToolsCopy([])).toBeNull();
  });
});

describe("the recipe drafts", () => {
  it("drafts the Friday tools from the week's packs, frames proved by the asset gate, and nothing twice", async () => {
    const where = await repo();
    const edition = structuredClone(czechOnlyEdition()) as unknown as { article: { cs: { frontmatter: Record<string, unknown> } } };
    edition.article.cs.frontmatter.practical = { variant: "daily", items: [tool] };
    await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(edition),
      meeting: caughtUpEditionMeeting,
      destinations: { cs: `${SITE}/articles/2026-08-04-measured-model-price-cut` },
      repoRoot: where.root,
      stateRoot: where.state,
      now: new Date("2026-08-04T04:00:00.000Z")
    });
    const first = await run(where, "2026-08-07");
    expect(first.outcomes).toEqual([{ recipe: "friday-tools", status: "drafted", packagePath: "state/social/recipes/2026-08-07-friday-tools.json" }]);
    const built = DneskaiRecipePackageSchema.parse(JSON.parse(await readFile(path.join(where.state, recipePackagePath("2026-08-07", "friday-tools")), "utf8")));
    expect(built.spendUsd).toBe(0);
    expect(built.frames.length).toBeGreaterThanOrEqual(5);
    expect(built.instagram.caption).toContain("[DOPLNIT");
    const frame = await sharp(await readFile(path.join(where.root, "site/public", built.frames[0]!.path.slice(1)))).metadata();
    expect(frame).toMatchObject({ width: 1080, height: 1350, format: "jpeg" });

    for (const channel of ["instagram", "threads"] as const) {
      const item = CapabilityAwareQueueItemSchema.parse(JSON.parse(await readFile(path.join(where.state, recipeQueuePath("2026-08-07", "friday-tools", channel)), "utf8")));
      expect(item).toMatchObject({ status: "draft", sourceVentureId: "caught-up", channel, sourcePackage: { packageHash: sha256(canonicalJson(built)) } });
      expect(() => assertQueueItemPublishable(item)).toThrow(/not queued/u);
      const recorded = await readRecordedAssetHashes({ item, repoRoot: where.root, stateRoot: where.state });
      expect(recorded.sourcePackage).toBe("verified");
      expect(item.content.assetPaths.every((asset) => recorded.hashes.has(asset))).toBe(true);
      if (channel === "threads") expect(item.content.assetPaths).toEqual([]);
    }
    // The Design Lab lists it beside the editions.
    const lab = JSON.parse(await readFile(path.join(where.state, "ventures/carousel-studio/summaries/caught-up/2026-08-07-2026-08-07-friday-tools.json"), "utf8"));
    expect(lab).toMatchObject({ schemaVersion: "carousel-summary/1", venture: "caught-up" });

    expect((await run(where, "2026-08-07")).outcomes).toEqual([{ recipe: "friday-tools", status: "already-drafted", packagePath: "state/social/recipes/2026-08-07-friday-tools.json" }]);
  }, RENDER_TIMEOUT_MS);

  it("records why, and drafts nothing, when a recipe's sources are missing", async () => {
    const where = await repo();
    const result = await run(where, "2026-11-06");
    expect(result.outcomes).toEqual([{ recipe: "friday-tools", status: "skipped", reason: "no edition this week carried a practical item of type tool" }]);
    const skip = JSON.parse(await readFile(path.join(where.state, "social/recipes/2026-11-06-friday-tools.skipped.json"), "utf8"));
    expect(skip).toMatchObject({ schemaVersion: "dneskai-recipe-skip/1", recipe: "friday-tools" });
    const sunday = await run(where, "2026-11-08");
    expect(sunday.outcomes[0]).toMatchObject({ recipe: "weekly-recap", status: "skipped" });
  });

  it("recaps the week on Sunday from its recorded editions, linking /tyden", async () => {
    const where = await repo();
    await summary(where.state, "2026-11-02", "2026-11-02-first-story", "První zpráva týdne o modelech");
    await summary(where.state, "2026-11-04", "2026-11-04-second-story", "Druhá zpráva týdne o regulaci");
    const result = await run(where, "2026-11-08");
    expect(result.outcomes[0]).toMatchObject({ recipe: "weekly-recap", status: "drafted" });
    const built = DneskaiRecipePackageSchema.parse(JSON.parse(await readFile(path.join(where.state, recipePackagePath("2026-11-08", "weekly-recap")), "utf8")));
    expect(built.instagram.caption).toContain("pondělí: První zpráva týdne o modelech");
    expect(built.instagram.caption).toContain(`${SITE}/tyden?utm_source=instagram&utm_medium=post&utm_campaign=weekly-recap`);
    expect(built.window).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  }, RENDER_TIMEOUT_MS);

  it("shows how an edition was made on Saturday: the room's quote and that day's ledger cost", async () => {
    const where = await repo();
    await summary(where.state, "2026-08-04", "2026-08-04-measured-model-price-cut", "Cena modelů klesla");
    await atomicWriteJson(where.state, "meetings/2026-08-04-cu-edition.json", { ...caughtUpEditionMeeting, decision: { ...caughtUpEditionMeeting.decision, outcome: "EDITION" } });
    await atomicWriteJson(where.state, "budget/ledger.json", { entries: [
      { ts: "2026-08-04T04:10:00.000Z", cycleId: "c", requestHash: "abcdef1234", phase: "cu-edition", ventureId: "caught-up", agent: "STET", provider: "anthropic", model: "m", serviceTier: "default", tokensIn: 1, tokensOut: 1, usd: 0.3, kind: "text" },
      { ts: "2026-08-04T05:10:00.000Z", cycleId: "c", requestHash: "abcdef1235", phase: "cu-edition", ventureId: "caught-up", agent: "STET", provider: "anthropic", model: "m", serviceTier: "default", tokensIn: 1, tokensOut: 1, usd: 0.13, kind: "text" },
      { ts: "2026-08-04T05:10:00.000Z", cycleId: "c", requestHash: "abcdef1236", phase: "ms-daily", ventureId: "marketingshark", agent: "CHUM", provider: "anthropic", model: "m", serviceTier: "default", tokensIn: 1, tokensOut: 1, usd: 5, kind: "text" }
    ] });
    const result = await run(where, "2026-08-08");
    expect(result.outcomes[0]).toMatchObject({ recipe: "how-it-was-made", status: "drafted" });
    const built = DneskaiRecipePackageSchema.parse(JSON.parse(await readFile(path.join(where.state, recipePackagePath("2026-08-08", "how-it-was-made")), "utf8")));
    expect(built.frames).toHaveLength(1);
    expect(built.instagram.caption).toContain("0.43 USD");
    expect(built.sourceRefs).toContain("state/meetings/2026-08-04-cu-edition.json");
  }, RENDER_TIMEOUT_MS);

  it("offers the day's lesson, as a post and a story, when the edition room said NO_EDITION", async () => {
    const where = await repo();
    await atomicWriteJson(where.state, "meetings/2026-11-05-cu-edition.json", { ...caughtUpEditionMeeting, date: "2026-11-05", decision: { ...caughtUpEditionMeeting.decision, outcome: "NO_EDITION" } });
    const result = await run(where, "2026-11-05");
    expect(result.outcomes[0]).toMatchObject({ recipe: "no-edition", status: "drafted" });
    const built = DneskaiRecipePackageSchema.parse(JSON.parse(await readFile(path.join(where.state, recipePackagePath("2026-11-05", "no-edition")), "utf8")));
    expect(built.instagram.caption).toContain("Dnes vydání DNESKAi nevyšlo.");
    expect(built.instagram.caption).toContain("Mitchell, Machine Learning (1997)");
    expect(built.story?.link).toContain("utm_medium=story");
    const story = await sharp(await readFile(path.join(where.root, "site/public", built.story!.frame.path.slice(1)))).metadata();
    expect(story).toMatchObject({ width: 1080, height: 1920 });

    const factsOnly = await repo();
    await atomicWriteJson(factsOnly.state, "meetings/2026-11-05-cu-edition.json", { ...caughtUpEditionMeeting, date: "2026-11-05", decision: { ...caughtUpEditionMeeting.decision, outcome: "NO_EDITION" } });
    const nothing = await run(factsOnly, "2026-11-05", async () => null);
    expect(nothing.outcomes[0]).toMatchObject({ recipe: "no-edition", status: "skipped" });
  }, RENDER_TIMEOUT_MS);
});
