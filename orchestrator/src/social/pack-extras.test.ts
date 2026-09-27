import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { caughtUpEditionMeeting, czechOnlyEdition } from "../../tests/fixtures/caught-up-edition.js";
import type { DatasetEntry } from "../contracts/boardless-dataset.js";
import { EditionPackageSchema } from "../contracts/edition-package.js";
import { SocialPackSchema } from "../contracts/social-pack.js";
import { dailyDatasetEntry, readDailyDatasetEntry } from "./daily-dataset.js";
import { composeEditionSocialPack } from "./pack.js";
import { renderStoryCard, storyCard, threadsQuestionText, withUtm } from "./pack-extras.js";

// quorum#592: the DNESKAi pack's story card, evening Threads question and slide-1 hook.

const DESTINATION = "https://caught-up.example/articles/2026-08-04-measured-model-price-cut";
const RENDER_TIMEOUT_MS = 90_000;
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const lesson: DatasetEntry = {
  id: "lex-001",
  slug: "machine-learning",
  term: "Machine learning",
  category: "models",
  en: { short: "Software that learns rules from examples", full: "Machine learning is the approach where a program improves from examples." },
  cs: { short: "Software, který se pravidla učí z příkladů", full: "Strojové učení je přístup, kdy se program zlepšuje z příkladů." },
  verified: "2026-07-01",
  source: "Mitchell, Machine Learning (1997)"
};

const practical = {
  kind: "prompt" as const,
  title: "Prompt na přepočet účtu",
  body: "Vlož do modelu svůj měsíční objem tokenů a starou i novou sazbu a nech si spočítat rozdíl proti minulé faktuře, rozepsaný po modelech.",
  source_url: "https://www.anthropic.com/news/example-price-update"
};
const block = { variant: "daily" as const, items: [practical] };

describe("the story card", () => {
  it("prefers the edition's practical item, then the day's lesson, and is absent otherwise", () => {
    const fromPractical = storyCard({ practical, lesson, destination: DESTINATION })!;
    expect(fromPractical.source).toBe("practical");
    expect(fromPractical.link).toBe(`${DESTINATION}?utm_source=instagram&utm_medium=story&utm_campaign=practical`);
    expect(fromPractical.visual.template_id).toBe("story-quote");
    expect(fromPractical.visual.content.strings.quote!.startsWith("Prompt na přepočet účtu: ")).toBe(true);
    expect(fromPractical.visual.content.strings.quote!.length).toBeLessThanOrEqual(190);
    expect(fromPractical.linkLine.length).toBeLessThanOrEqual(80);

    const fromLesson = storyCard({ practical: null, lesson, destination: DESTINATION })!;
    expect(fromLesson.source).toBe("lesson");
    expect(fromLesson.visual.content.strings.quote).toBe("Machine learning: Software, který se pravidla učí z příkladů");
    expect(fromLesson.link).toContain("utm_campaign=lesson");

    expect(storyCard({ practical: null, lesson: null, destination: DESTINATION })).toBeNull();
  });

  it("renders at 1080 × 1920", async () => {
    const card = storyCard({ practical, lesson: null, destination: DESTINATION })!;
    const { png } = await renderStoryCard(card);
    expect(await sharp(png).metadata()).toMatchObject({ width: 1080, height: 1920, format: "png" });
  }, RENDER_TIMEOUT_MS);
});

describe("the evening Threads question", () => {
  it("asks about the edition's first open question, with the edition's tagged link", () => {
    const text = threadsQuestionText({ uncertainty: ["Zda nižší cena vydrží i po zavedení nových limitů.", "Druhá otázka"], destination: DESTINATION })!;
    expect(text).toContain("Zda nižší cena vydrží i po zavedení nových limitů.");
    expect(text).not.toContain("Druhá otázka");
    expect(text).toContain(withUtm(DESTINATION, "threads", "post", "edition"));
    expect(text.length).toBeLessThanOrEqual(500);
    expect(threadsQuestionText({ uncertainty: [], destination: DESTINATION })).toBeNull();
    expect(threadsQuestionText({ uncertainty: ["x ".repeat(400)], destination: DESTINATION })!.length).toBeLessThanOrEqual(500);
  });
});

describe("the day's lesson", () => {
  it("resolves the entry the reader reveals: whole days from the anchor, modulo the length", () => {
    const entries = [lesson, { ...lesson, id: "lex-002" }, { ...lesson, id: "lex-003" }];
    expect(dailyDatasetEntry({ anchor: "2026-07-01", entries }, "2026-07-01")!.id).toBe("lex-001");
    expect(dailyDatasetEntry({ anchor: "2026-07-01", entries }, "2026-07-03")!.id).toBe("lex-003");
    expect(dailyDatasetEntry({ anchor: "2026-07-01", entries }, "2026-07-04")!.id).toBe("lex-001");
    expect(dailyDatasetEntry({ anchor: "2026-07-01", entries }, "2026-06-01")!.id).toBe("lex-001");
  });

  it("is an absence, not a guess, when the published file cannot be read", async () => {
    const refused = await readDailyDatasetEntry({
      dataset: "ai-lessons",
      date: "2026-11-05",
      resolveImpl: async () => ["140.82.112.3"],
      fetchImpl: (async () => new Response("not json", { status: 200, headers: { "content-type": "text/plain" } })) as typeof fetch
    });
    expect(refused).toBeNull();
    const file = { schemaVersion: "boardless-dataset/1", dataset: "ai-lessons", anchor: "2026-07-01", categories: { models: { en: "Models", cs: "Modely" } }, entries: [lesson] };
    const read = await readDailyDatasetEntry({
      dataset: "ai-lessons",
      date: "2026-11-05",
      resolveImpl: async () => ["140.82.112.3"],
      fetchImpl: (async () => new Response(JSON.stringify(file), { status: 200, headers: { "content-type": "text/plain" } })) as typeof fetch
    });
    expect(read?.id).toBe("lex-001");
  });
});

describe("the composed pack", () => {
  async function compose(edit?: (frontmatter: Record<string, unknown>) => void, lessonEntry: DatasetEntry | null = null) {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-pack-extras-"));
    roots.push(root);
    const edition = structuredClone(czechOnlyEdition()) as unknown as { article: { cs: { frontmatter: Record<string, unknown> } } };
    edit?.(edition.article.cs.frontmatter);
    const stateRoot = path.join(root, "state");
    const result = await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(edition),
      meeting: caughtUpEditionMeeting,
      destinations: { cs: DESTINATION },
      repoRoot: root,
      stateRoot,
      now: new Date("2026-08-04T04:00:00.000Z"),
      lesson: lessonEntry
    });
    return { root, stateRoot, result: result! };
  }

  it("carries the practical item, its story card and the evening question, all drafted and none sendable unapproved", async () => {
    const { root, result } = await compose((frontmatter) => {
      frontmatter.practical = block;
    });
    const pack = SocialPackSchema.parse(result.pack);
    expect(pack.practical).toEqual(block);
    expect(pack.story).toMatchObject({ frame: "/social/2026-08-04/story.png", source: "practical" });
    expect(pack.altTexts["/social/2026-08-04/story.png"]).toContain("Story card:");
    const story = await sharp(await readFile(path.join(root, "site/public/social/2026-08-04/story.png"))).metadata();
    expect(story).toMatchObject({ width: 1080, height: 1920 });
    expect(pack.threadsQuestion?.text).toContain("Jak to vidíte vy?");
    const question = result.queueItems.find((item) => item.id === "caught-up-2026-08-04-cs-threads-question")!;
    expect(question).toMatchObject({ channel: "threads", status: "draft", content: { text: pack.threadsQuestion!.text, assetPaths: [] } });
    // 20:30 in Prague on 4 August is 18:30 UTC (CEST).
    expect(question.publishWindow.notBefore).toBe("2026-08-04T18:30:00.000Z");
    // The story is exported, never queued: no draft points at the 9:16 card.
    expect(result.queueItems.some((item) => item.content.assetPaths.includes("/social/2026-08-04/story.png"))).toBe(false);
  }, RENDER_TIMEOUT_MS);

  it("falls back to the day's lesson for the story, and records the slide-1 hook when one matched", async () => {
    const { result } = await compose(undefined, lesson);
    const pack = SocialPackSchema.parse(result.pack);
    expect(pack.practical).toBeUndefined();
    expect(pack.story?.source).toBe("lesson");
    expect(pack.coverHook).toBeDefined();
    if (pack.coverHook) {
      expect(pack.byLocale.cs.instagram.visual.content.strings[Object.keys(pack.byLocale.cs.instagram.visual.content.strings)[0]!]).toBe(pack.coverHook.line);
    }
  }, RENDER_TIMEOUT_MS);

  it("has no story card on a day with neither a practical item nor a lesson", async () => {
    const { result } = await compose();
    expect(SocialPackSchema.parse(result.pack).story).toBeUndefined();
  }, RENDER_TIMEOUT_MS);
});
