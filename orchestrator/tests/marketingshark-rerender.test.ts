import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  liveTemplateByReference,
  quizFrameJpeg,
  quizSlideRenderInput,
  renderCarouselSlidePng,
  reviewQuizSlides,
  type QuizDeckFacts,
  type QuizSlideRole
} from "@boardlessai/carousel-studio";
import { repoRoot } from "../src/paths.js";
import { enabledBrands, loadMarketingSharkConfig } from "../src/ventures/marketingshark/config.js";
import { EMPTY_LEDGER } from "../src/ventures/marketingshark/ledger.js";
import { MarketingSharkPackage } from "../src/ventures/marketingshark/package.js";
import { fixtureChumOutput, fixtureHookLines, planBrandDay, runBrandDay } from "../src/ventures/marketingshark/run.js";

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
