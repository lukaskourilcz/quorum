import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TehdejsiRecommendationSchema } from "../src/contracts/tehdejsi-recommendation.js";
import { repoRoot } from "../src/paths.js";
import {
  buildTehdejsiCarouselSummary,
  buildTehdejsiDeckPack,
  renderTehdejsiDeck,
  storeApprovedTehdejsiSummary
} from "../src/ventures/tehdejsi-svet/render.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  return TehdejsiRecommendationSchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/venture-recommendation-tehdejsi.valid.json"),
    "utf8"
  )));
}

describe("Tehdejsi svet render handoff", () => {
  it("maps every Czech and Ukrainian slide into the dedicated Studio payload", async () => {
    const recommendation = await fixture();
    const pack = buildTehdejsiDeckPack(recommendation);

    expect(pack).toMatchObject({
      templateId: "tehdejsi-bilingual-3",
      templateVersion: "1.0.0",
      brandId: "tehdejsi-svet",
      format: "instagram-portrait",
      payload: { locale: "cs" }
    });
    expect(pack.payload.strings["slide-01"]).toBe(recommendation.payload.slides[0]!.cs);
    expect(pack.payload.strings["slide-01-ua"]).toBe(recommendation.payload.slides[0]!.ua);
    expect(pack.payload.strings.attribution).toBe(recommendation.media[1]!.attribution);
  });

  it("renders a synthetic fixture feature without clipping and records its Czech-primary summary", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-render-"));
    roots.push(root);
    const recommendation = await fixture();
    recommendation.media = recommendation.media.filter(({ licence }) => licence === "own-render");

    const rendered = renderTehdejsiDeck(recommendation);
    expect(rendered.rendered).toHaveLength(3);
    expect(rendered.rendered.every(({ truncatedSlots }) => truncatedSlots.length === 0)).toBe(true);
    expect(rendered.rendered[0]!.svg).toContain("Кілька");

    const stored = await storeApprovedTehdejsiSummary(root, recommendation);
    expect(stored.statePath).toBe(
      `state/ventures/carousel-studio/summaries/tehdejsi-svet/${recommendation.date}-${recommendation.id}.json`
    );
    const summary = JSON.parse(await readFile(path.join(root, stored.path), "utf8"));
    expect(summary).toEqual(buildTehdejsiCarouselSummary(recommendation));
    expect(summary).toMatchObject({ venture: "tehdejsi-svet", locale: "cs", slug: recommendation.id });
    expect(summary.passages).toEqual(recommendation.payload.slides.map(({ cs }) => cs));
  });

  it("refuses to lose a licensed photograph or its on-card credit", async () => {
    const recommendation = await fixture();
    expect(() => renderTehdejsiDeck(recommendation)).toThrow(/credits a photograph it does not carry/u);

    const noCredit = structuredClone(recommendation) as unknown as Record<string, unknown>;
    (noCredit.media as Array<{ attribution: string }>)[1]!.attribution = "";
    expect(TehdejsiRecommendationSchema.safeParse(noCredit).success).toBe(false);
  });
});
