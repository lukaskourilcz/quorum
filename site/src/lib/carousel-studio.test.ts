import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAROUSEL_BRANDS, SEED_TEMPLATES, renderCarouselPng } from "@boardlessai/carousel-studio";
import { readCarouselStudio, readPublicCarouselStudio, previewPayload } from "./carousel-studio";

vi.mock("server-only", () => ({}));

const temporaryRoots: string[] = [];
afterEach(async () => Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Carousel Studio gallery and showcase", () => {
  it("exposes twelve checked live seed templates across all brands and formats", async () => {
    const snapshot = await readCarouselStudio();
    expect(snapshot.templates).toHaveLength(12);
    expect(snapshot.templates.every((entry) => entry.template.status === "live" && entry.allChecksPass)).toBe(true);
    expect(snapshot.brands.map((brand) => brand.id)).toEqual([
      "caught-up", "mma-files", "titty-tuesdays", "devshark", "geoshark", "kvorum", "booksofhistory", "door-money",
      "tehdejsi-svet", "webdev-signal"
    ]);
    // The gallery's picker is every canvas the studio renders. Which of them a template is
    // offered is per-template: only a layout composed for 9:16 is offered the story.
    expect(snapshot.formats).toEqual(["instagram-square", "instagram-portrait", "instagram-story", "threads"]);
    const story = snapshot.templates.find((entry) => entry.template.id === "story-quote");
    expect(story?.checks.some((entry) => entry.format === "instagram-story")).toBe(true);
    const quote = snapshot.templates.find((entry) => entry.template.id === "quote-card");
    expect(quote?.checks.some((entry) => entry.format === "instagram-story")).toBe(false);
  });

  it("renders a public showcase fixture to postable PNGs", async () => {
    const snapshot = await readCarouselStudio();
    const entry = snapshot.templates.find((candidate) => candidate.template.id === "cover-cta")!;
    const renders = await renderCarouselPng({
      template: entry.template,
      payload: previewPayload(entry.template, "cs"),
      brand: CAROUSEL_BRANDS["caught-up"],
      format: "instagram-portrait"
    });
    expect(renders).toHaveLength(2);
    expect(renders.every((render) => render.png.byteLength > 1_000 && /^[a-f0-9]{64}$/.test(render.pngHash))).toBe(true);
  });

  it("keeps public previews on compiled fixtures when admin has unpublished state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "carousel-public-boundary-"));
    temporaryRoots.push(root);
    const proposal = { ...SEED_TEMPLATES[0]!, id: "unpublished-review-template", status: "draft" as const };
    await mkdir(path.join(root, "state/ventures/carousel-studio/templates/unpublished-review-template"), { recursive: true });
    await writeFile(
      path.join(root, "state/ventures/carousel-studio/templates/unpublished-review-template/1.0.0.json"),
      JSON.stringify(proposal),
      "utf8"
    );

    const admin = await readCarouselStudio(root);
    const publicSnapshot = readPublicCarouselStudio();
    expect(admin.templates.some((entry) => entry.source === "proposal")).toBe(true);
    expect(publicSnapshot.templates).toHaveLength(SEED_TEMPLATES.length);
    expect(publicSnapshot.templates.every((entry) => entry.source === "seed" && entry.ratings.length === 0)).toBe(true);
    expect(publicSnapshot.inspirationLinks).toEqual([]);
    expect(publicSnapshot.templates.some((entry) => entry.template.id === proposal.id)).toBe(false);
  });
});
