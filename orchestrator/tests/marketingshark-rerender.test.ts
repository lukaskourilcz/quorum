import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  liveTemplateByReference,
  postSlidePlacement,
  postSlideRenderInput,
  quizFrameJpeg,
  quizSlideRenderInput,
  renderCarouselSlidePng,
  reviewPostSlides,
  reviewQuizSlides,
  type PostDeckFacts,
  type QuizDeckFacts,
  type QuizSlideRole
} from "@boardlessai/carousel-studio";
import { configRoot, repoRoot } from "../src/paths.js";
import { GoViralTrendsSchema } from "../src/sources/goviral-trends.js";
import { atomicWriteJson } from "../src/state.js";
import { planDay } from "../src/ventures/marketingshark/post-plan.js";
import { fixturePostOutput, runPostDay } from "../src/ventures/marketingshark/post-run.js";
import { enabledBrands, loadMarketingSharkConfig } from "../src/ventures/marketingshark/config.js";
import { EMPTY_LEDGER } from "../src/ventures/marketingshark/ledger.js";
import { MarketingSharkPackage, PostPackageSchema } from "../src/ventures/marketingshark/package.js";
import { fixtureChumOutput, fixtureHookLines, planBrandDay, readLedger, runBrandDay } from "../src/ventures/marketingshark/run.js";

// quorum#575 (B8): a package records enough to be rendered again without the question bank. The
// Design Lab reads the package and its render summary, maps the slides through the studio's quiz
// functions and must produce the room's own frames, byte for byte. The committed fixtures are the
// handshake the site's tests render from; this test regenerates them and says when they drift.

interface RenderSummary {
  format: "instagram-portrait";
  facts: QuizDeckFacts;
  slides: Array<{ role: QuizSlideRole; templateId: string; version: string; svgHash: string; svg: string }>;
}

const DAY = "2026-09-26";
let root = "";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", name), "utf8")) as unknown;
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ms-rerender-"));
  const config = await loadMarketingSharkConfig();
  const brand = enabledBrands(config)[0]!;
  const result = await runBrandDay({
    config, brand, ledger: EMPTY_LEDGER, date: DAY, cycleId: "test-cycle", root, publicRoot: path.join(root, "public"), dry: true,
    call: async () => {
      const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: DAY, stateRoot: root });
      return { usd: 0, output: fixtureChumOutput({ brand, question: plan.question, ...fixtureHookLines(plan, brand) }) };
    }
  });
  expect(result.outcome.status).toBe("drafted");
});

async function drafted(relative: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown;
}

describe("a devShark package can be rendered again from what it records", () => {
  it("matches the committed handshake fixtures the site renders from", async () => {
    expect(await drafted(`ventures/marketingshark/packages/${DAY}/devshark/package.json`)).toEqual(await fixture("marketingshark-package.valid.json"));
    expect(await drafted(`ventures/marketingshark/packages/${DAY}/devshark/render-en.json`)).toEqual(await fixture("marketingshark-render.valid.json"));
    for (const channel of ["linkedin", "instagram", "threads"]) {
      expect(await drafted(`social/queue/${DAY}-devshark-en-${channel}.json`)).toEqual(await fixture(`marketingshark-queue-${channel}.valid.json`));
    }
  });

  it("records the facts code put on the slides", async () => {
    const summary = await drafted(`ventures/marketingshark/packages/${DAY}/devshark/render-en.json`) as RenderSummary;
    expect(summary.facts).toMatchObject({ displayName: "devShark", productUrl: "https://devshark.app" });
    expect(summary.facts.correctLetter).toMatch(/^[A-D]$/u);
    expect(summary.facts.options.length).toBeGreaterThanOrEqual(2);
  });

  it("reproduces every PNG frame and its JPEG copy from the package's copy and the recorded facts", async () => {
    const built = MarketingSharkPackage.parse(await drafted(`ventures/marketingshark/packages/${DAY}/devshark/package.json`));
    const summary = await drafted(`ventures/marketingshark/packages/${DAY}/devshark/render-en.json`) as RenderSummary;
    const brand = CAROUSEL_BRANDS.devshark;
    const slides = built.carousels.en.slides.map((slide, index) => ({
      role: slide.role,
      template: liveTemplateByReference(slide.templateId, summary.slides[index]!.version),
      headline: slide.headline,
      body: slide.body ?? "",
      alt: slide.alt
    }));
    // The room's own copy passes the owner-edit review unchanged: nothing the room ships is refused.
    expect(reviewQuizSlides({ slides, facts: summary.facts, locale: "en", brand, format: summary.format })).toEqual([]);
    for (const [index, slide] of slides.entries()) {
      const frame = built.render.frames[index]!;
      const rendered = await renderCarouselSlidePng(quizSlideRenderInput({ ...slide, facts: summary.facts, locale: "en", brand, format: summary.format }));
      expect(rendered!.svgHash, slide.role).toBe(frame.svgHash);
      expect(rendered!.pngHash, slide.role).toBe(frame.png.sha256);
      const jpeg = await quizFrameJpeg(rendered!.png, brand.colors.background!);
      expect(createHash("sha256").update(jpeg).digest("hex"), slide.role).toBe(frame.jpeg.sha256);
    }
  });
});

// quorum#576 (B9): every kind the rotation drafts has a committed package fixture, and every frame
// of it is reproduced, PNG and JPEG, from the package's words and the render summary's facts through
// the studio's post-deck functions alone. Set UPDATE_MARKETINGSHARK_FIXTURES=1 to rewrite them from
// the drafted week after an intended change; without it the test only compares.

const KIND_DAYS = { "feature-spotlight": "2026-09-29", "challenge-teaser": "2026-09-30", "this-week": "2026-10-02" } as const;
const WEEK_OF = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"] as const;
let week = "";

interface PostRenderSummary {
  kind: string;
  format: "instagram-portrait";
  facts: PostDeckFacts;
  slides: Array<{ role: string; templateId: string; version: string; svgHash: string }>;
}

async function weekFile(relative: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(week, relative), "utf8")) as unknown;
}

beforeAll(async () => {
  week = await mkdtemp(path.join(tmpdir(), "ms-kind-fixtures-"));
  const facts = await mkdtemp(path.join(tmpdir(), "ms-kind-facts-"));
  const repo = await mkdtemp(path.join(tmpdir(), "ms-kind-repo-"));
  await mkdir(path.join(repo, "state/marketingshark/challenge-banks"), { recursive: true });
  await copyFile(path.join(repoRoot, "contracts/fixtures/marketingshark-challenges.valid.json"), path.join(repo, "state/marketingshark/challenge-banks/devshark.json"));
  // A GoVIRAL snapshot whose rising devShark tag leads Friday's theme, so the fixture records a hook.
  await atomicWriteJson(facts, "goviral/trends/2026-09-28.json", GoViralTrendsSchema.parse({
    schemaVersion: "goviral-trends/1", date: "2026-09-28", generatedAt: "2026-09-28T09:00:00.000Z", sourceResults: [], freeSignals: [], items: [],
    signals: {
      topHashtags: [{ hashtag: "#javascript", topicSet: "devshark", posts: 3, engagementPerHour: 18, weekOverWeekDelta: 6 }],
      topFormats: [], topAudio: [], exploreSections: [], perTopicSet: []
    },
    forMagazines: { ai: [], mma: [] }
  }));
  const config = await loadMarketingSharkConfig();
  const brand = enabledBrands(config)[0]!;
  for (const date of WEEK_OF) {
    const day = await planDay({ brand, date, stateRoot: week, factStateRoot: facts, repoRoot: repo, configRoot });
    if (day.kind === "quiz") {
      const ledger = await readLedger(week);
      const result = await runBrandDay({
        config, brand, ledger, date, cycleId: "test-cycle", root: week, publicRoot: path.join(week, "public"), dry: true,
        call: async () => {
          const quiz = await planBrandDay({ config, brand, ledger, date, stateRoot: week });
          return { usd: 0, output: fixtureChumOutput({ brand, question: quiz.question, ...fixtureHookLines(quiz, brand) }) };
        }
      });
      expect(result.outcome.status, date).toBe("drafted");
    } else if (day.kind !== "none" && day.kind !== "invalid") {
      const result = await runPostDay({ brand, date, root: week, publicRoot: path.join(week, "public"), plan: day, call: async () => ({ usd: 0, output: fixturePostOutput(day, brand) }) });
      expect(result.outcome.status, date).toBe("drafted");
    }
  }
  if (process.env.UPDATE_MARKETINGSHARK_FIXTURES === "1") {
    for (const [kind, date] of Object.entries(KIND_DAYS)) {
      for (const [file, name] of [["package.json", `marketingshark-package-${kind}.valid.json`], ["render-en.json", `marketingshark-render-${kind}.valid.json`]] as const) {
        await writeFile(path.join(repoRoot, "contracts", "fixtures", name), `${JSON.stringify(await weekFile(`ventures/marketingshark/packages/${date}/devshark/${file}`), null, 2)}\n`);
      }
    }
  }
});

describe("every post kind can be rendered again from what its package records", () => {
  it.each(Object.entries(KIND_DAYS))("matches the committed %s fixtures", async (kind, date) => {
    expect(await weekFile(`ventures/marketingshark/packages/${date}/devshark/package.json`)).toEqual(await fixture(`marketingshark-package-${kind}.valid.json`));
    expect(await weekFile(`ventures/marketingshark/packages/${date}/devshark/render-en.json`)).toEqual(await fixture(`marketingshark-render-${kind}.valid.json`));
  });

  it.each(Object.keys(KIND_DAYS))("reproduces every %s frame, PNG and JPEG, from the package's words and the recorded facts", async (kind) => {
    const built = PostPackageSchema.parse(await fixture(`marketingshark-package-${kind}.valid.json`));
    const summary = await fixture(`marketingshark-render-${kind}.valid.json`) as PostRenderSummary;
    expect(built.kind).toBe(kind);
    expect(summary.kind).toBe(kind);
    expect(summary.facts).toEqual({ displayName: "devShark", productUrl: "https://devshark.app" });
    const brand = CAROUSEL_BRANDS.devshark;
    const slides = built.carousels.en.slides.map((slide, index) => ({
      role: slide.role,
      template: liveTemplateByReference(slide.templateId, summary.slides[index]!.version),
      headline: slide.headline,
      body: slide.body ?? "",
      alt: slide.alt
    }));
    // The room's own deck passes the post-deck review unchanged.
    expect(reviewPostSlides({ slides, facts: summary.facts, locale: "en", brand, format: summary.format })).toEqual([]);
    expect(built.render.frames).toHaveLength(5);
    for (const [index, slide] of slides.entries()) {
      const frame = built.render.frames[index]!;
      const input = postSlideRenderInput({ ...slide, placement: postSlidePlacement(index, slides.length), facts: summary.facts, locale: "en", brand, format: summary.format });
      const rendered = await renderCarouselSlidePng(input);
      expect(rendered!.svgHash, `${kind}/${slide.role}`).toBe(frame.svgHash);
      expect(rendered!.pngHash, `${kind}/${slide.role}`).toBe(frame.png.sha256);
      const jpeg = await quizFrameJpeg(rendered!.png, brand.colors.background!);
      expect(createHash("sha256").update(jpeg).digest("hex"), `${kind}/${slide.role}`).toBe(frame.jpeg.sha256);
    }
  });

  it("records where each kind's facts came from", async () => {
    const spotlight = PostPackageSchema.parse(await fixture("marketingshark-package-feature-spotlight.valid.json"));
    expect(spotlight.spotlight).toMatchObject({ factSheetEffectiveFrom: "2026-09-15" });
    const teaser = PostPackageSchema.parse(await fixture("marketingshark-package-challenge-teaser.valid.json"));
    expect(teaser.challenge).toMatchObject({ difficulty: "easy", sourceCommit: expect.stringMatching(/^[a-f0-9]{40}$/u) });
    const note = PostPackageSchema.parse(await fixture("marketingshark-package-this-week.valid.json"));
    expect(note.week!.items.map((item) => item.date)).toEqual(WEEK_OF.slice(0, 4));
    expect(note.week!.theme).toEqual({ label: "JavaScript", category: "javascript", from: "trend" });
    expect(note.week!.trend.packet).toMatchObject({ topic: "#javascript", evidenceRefs: ["state/goviral/trends/2026-09-28.json"] });
    expect(note.week!.pick.date).toBe("2026-09-30");
  });
});
