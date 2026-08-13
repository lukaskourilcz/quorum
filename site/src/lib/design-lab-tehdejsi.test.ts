import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCarouselSummary } from "@boardlessai/carousel-studio";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Tehdejší svět in the Design Lab", () => {
  it("refuses a summary whose licensed bilingual package has no attribution", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "design-lab-tehdejsi-"));
    roots.push(root);
    const recommendation = JSON.parse(await readFile(
      path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation-tehdejsi.valid.json"),
      "utf8"
    )) as Record<string, unknown> & {
      id: string;
      date: string;
      payload: unknown;
      media: Array<Record<string, unknown> & { attribution: string }>;
    };
    recommendation.id = "ts-2026-08-14-synthetic-memory";
    recommendation.payload = {
      slides: [
        { ordinal: 1, cs: "Syntetická česká karta jedna.", ua: "Синтетична українська картка один." },
        { ordinal: 2, cs: "Syntetická česká karta dvě.", ua: "Синтетична українська картка два." },
        { ordinal: 3, cs: "Syntetická česká karta tři.", ua: "Синтетична українська картка три." }
      ],
      captionCs: "Syntetický popisek pro test.",
      captionUa: "Синтетичний підпис для тесту.",
      ctaKind: "none"
    };
    recommendation.media[1]!.attribution = "";

    const summary = buildCarouselSummary({
      venture: "tehdejsi-svet",
      slug: recommendation.id,
      date: recommendation.date,
      title: "Syntetická vzpomínka",
      dek: "Pouze umělý obsah pro kontrolu hranice.",
      points: ["První umělá karta.", "Druhá umělá karta.", "Třetí umělá karta."],
      hasHero: true,
      heroCredit: null
    });
    const summaryDirectory = path.join(root, "state/ventures/carousel-studio/summaries/tehdejsi-svet");
    const draftDirectory = path.join(root, "state/ventures/tehdejsi-svet/drafts");
    await Promise.all([mkdir(summaryDirectory, { recursive: true }), mkdir(draftDirectory, { recursive: true })]);
    await writeFile(path.join(summaryDirectory, `${summary.date}-${summary.slug}.json`), JSON.stringify(summary));
    await writeFile(path.join(draftDirectory, `${recommendation.id}.json`), JSON.stringify(recommendation));

    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    const { readDesignLab } = await import("./design-lab");
    const [article] = await readDesignLab(40, "tehdejsi-svet");
    expect(article?.dualLanguage).toBeNull();
    expect(article?.renderable).toBe(false);
    expect(article?.problems.join(" ")).toMatch(/paired-language.*unavailable|incomplete/iu);
  });
});
