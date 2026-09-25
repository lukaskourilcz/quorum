import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { CAROUSEL_BRANDS, quizFrameJpeg, quizSlideRenderInput, renderCarouselSlidePng } from "@boardlessai/carousel-studio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PACKAGE_DATE, PACKAGE_SLUG, packageFixtureRoot, readQueueFixture, writeJson } from "@/lib/admin-queue/fixture-root";
import { readDesignLabPackages } from "@/lib/design-lab-package";
import { packageHash, quizSlideCopies, readQuizPackage } from "@/lib/devshark-package";
import { readStudioArticles } from "@/lib/carousel-summaries";
import { setSlideTextOverride } from "@/lib/carousel-studio-admin-store";
import { PackageSlideRefusal, readPackageSlideOverrides, setPackageSlideOverride } from "@/lib/package-slide-overrides";
import { reviewPackageSlides, slidesWithEdits } from "@/lib/devshark-package";

vi.mock("server-only", () => ({}));

// quorum#575 (B8): the Design Lab's package-backed article kind, read from the package the
// marketingShark room drafts for 2026-09-26 (the committed handshake fixtures).

const now = new Date("2026-09-26T08:00:00.000Z");
const roots: string[] = [];
let root = "";

beforeEach(async () => {
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  root = await packageFixtureRoot();
  roots.push(root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function fresh(options: Parameters<typeof packageFixtureRoot>[0]): Promise<string> {
  const other = await packageFixtureRoot(options);
  roots.push(other);
  return other;
}

describe("a devShark package in the Design Lab", () => {
  it("is listed by its carousel summary and opens on its five slides and its three queue drafts", async () => {
    const devshark = (await readStudioArticles(root)).filter((article) => article.venture === "devshark");
    expect(devshark.map((article) => article.id)).toEqual([`devshark:${PACKAGE_SLUG}:${PACKAGE_DATE}`]);
    expect(devshark[0]!.summary).toMatchObject({ schemaVersion: "carousel-summary/1", locale: "en", kicker: "devShark · 26 Sep" });

    const [article] = await readDesignLabPackages(40, root, { now });
    expect(article).toMatchObject({ kind: "package", id: `devshark:${PACKAGE_SLUG}:${PACKAGE_DATE}`, renderable: true, problems: [] });
    expect(article!.slides.map((slide) => [slide.role, slide.templateId, slide.edited])).toEqual([
      ["hook", "minimal-text-poster", false],
      ["context", "quiz-question-context", false],
      ["reveal", "stat-highlight", false],
      ["why", "quote-card", false],
      ["footer", "minimal-text-poster", false]
    ]);
    expect(article!.queueItems.map((item) => [item.platform, item.status])).toEqual([["instagram", "draft"], ["linkedin", "draft"], ["threads", "draft"]]);
    // No file name or package path reaches the browser.
    expect(JSON.stringify(article)).not.toMatch(/state\/|\.json|\/social\//u);
  });

  it("renders every slide as the room's own frame, PNG and JPEG, byte for byte", async () => {
    const record = (await readQuizPackage(PACKAGE_DATE, "devshark", root))!;
    const queue = await readQueueFixture("marketingshark-queue-linkedin.valid.json");
    expect(record.hash).toBe((queue.sourcePackage as { packageHash: string }).packageHash);
    const brand = CAROUSEL_BRANDS.devshark;
    for (const [index, copy] of quizSlideCopies(record.slides).entries()) {
      const rendered = await renderCarouselSlidePng(quizSlideRenderInput({ ...copy, facts: record.facts!, locale: "en", brand, format: record.format }));
      expect(rendered!.pngHash).toBe(record.frames[index]!.png.sha256);
      expect(createHash("sha256").update(await quizFrameJpeg(rendered!.png, brand.colors.background!)).digest("hex")).toBe(record.frames[index]!.jpeg.sha256);
    }
    expect(packageHash(JSON.parse(await readFile(path.join(root, record.artifactRef), "utf8")))).toBe(record.hash);
  });

  it("lists nothing without the marketingShark -> design-lab edge", async () => {
    const closed = await fresh({ designLabEdge: false });
    expect(await readDesignLabPackages(40, closed, { now })).toEqual([]);
    expect((await readStudioArticles(closed)).filter((article) => article.venture === "devshark")).toEqual([]);
  });

  it("says why a package drafted before its facts were recorded cannot be rendered", async () => {
    const [article] = await readDesignLabPackages(40, await fresh({ facts: false }), { now });
    expect(article!.renderable).toBe(false);
    expect(article!.problems.join(" ")).toContain("before its render summary recorded the facts");
  });

  it("leaves out queue drafts that are superseded, sent or out of their window", async () => {
    const linkedin = await readQueueFixture("marketingshark-queue-linkedin.valid.json");
    await writeJson(root, `state/social/queue/${PACKAGE_DATE}-devshark-en-linkedin.json`, { ...linkedin, status: "published" });
    const [article] = await readDesignLabPackages(40, root, { now });
    expect(article!.queueItems.map((item) => item.platform)).toEqual(["instagram", "threads"]);
    const [late] = await readDesignLabPackages(40, root, { now: new Date("2026-09-27T00:00:00.000Z") });
    expect(late!.queueItems).toEqual([]);
  });
});

describe("saving a package slide", () => {
  async function save(slide: number, copy: { headline: string; body: string; alt: string }) {
    const record = (await readQuizPackage(PACKAGE_DATE, "devshark", root))!;
    const original = record.slides[slide]!;
    return setPackageSlideOverride({
      slug: record.slug,
      date: record.date,
      slide,
      copy,
      original: { headline: original.headline, body: original.body, alt: original.alt },
      review: (edits) => reviewPackageSlides(record, slidesWithEdits(record, edits)),
      now
    }, root);
  }

  it("refuses an edit that would clip, names the slot and writes nothing", async () => {
    const error = await save(2, { headline: "A", body: "JSON, the small text format every browser parses natively without an XML parser, which is why so many web APIs return it by default today", alt: "Slide 3: the answer" })
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(PackageSlideRefusal);
    expect((error as PackageSlideRefusal).problems).toEqual([expect.objectContaining({ slide: 3, field: "body", slot: "stat-label" })]);
    await expect(readFile(path.join(root, "state/ventures/carousel-studio/slide-overrides.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("saves an edit that fits, shows it in the Lab, and drops it again when the slide reads as the package does", async () => {
    expect(await save(3, { headline: "Why JSON", body: "Browsers parse JSON natively; XML needs a parser.", alt: "Slide 4: why JSON wins" })).toMatchObject({ edited: true });
    const [edited] = await readDesignLabPackages(40, root, { now });
    expect(edited!.slides[3]).toMatchObject({ edited: true, current: { headline: "Why JSON", alt: "Slide 4: why JSON wins" } });

    const original = edited!.slides[3]!.original;
    expect(await save(3, original)).toMatchObject({ edited: false });
    expect(await readPackageSlideOverrides(root)).toEqual([]);
  });

  it("shares slide-overrides.json with the family decks' one-line edits without dropping either", async () => {
    await save(0, { headline: "Memory only.", body: "", alt: "Slide 1: memory only" });
    await setSlideTextOverride({ venture: "caught-up", slug: "synthetic", date: "2026-09-20", slide: 1, text: "Kratší věta.", now }, root);
    const file = JSON.parse(await readFile(path.join(root, "state/ventures/carousel-studio/slide-overrides.json"), "utf8")) as { overrides: Array<{ venture: string }> };
    expect(file.overrides.map((entry) => entry.venture).sort()).toEqual(["caught-up", "devshark"]);
    await save(4, { headline: "One question from devShark.", body: "", alt: "Slide 5: devShark" });
    const again = JSON.parse(await readFile(path.join(root, "state/ventures/carousel-studio/slide-overrides.json"), "utf8")) as { overrides: Array<{ venture: string }> };
    expect(again.overrides.map((entry) => entry.venture).sort()).toEqual(["caught-up", "devshark", "devshark"]);
  });
});
