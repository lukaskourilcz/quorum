import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAROUSEL_BRANDS } from "@boardlessai/carousel-studio";

/**
 * The drafts-only ventures post by hand, so the pack is the whole product.
 *
 * BOOKSOFHISTORY, Tehdejší svět and Kvórum have no credential, publisher or autopublish path and
 * are not getting one. What they need instead is the same downloadable ZIP the magazines get —
 * frames, caption, alt text, manifest — and the export route serves any venture that has a brand
 * and a Design Lab entry. This is the guard that says all three still do: dropping one would take
 * a venture's only route to an audience away without failing anything else.
 */
describe("the manual posting pack", () => {
  const DRAFTS_ONLY = ["booksofhistory", "tehdejsi-svet", "kvorum"] as const;

  it("has a brand for every drafts-only venture, which the export route looks up by id", () => {
    for (const venture of DRAFTS_ONLY) {
      expect(CAROUSEL_BRANDS[venture], `${venture} has no brand`).toBeTruthy();
    }
  });

  it("reads all three into the Design Lab the export route serves from", async () => {
    const reader = await readFile(
      path.join(process.cwd(), "src/lib/carousel-summaries.ts"),
      "utf8"
    );
    for (const venture of DRAFTS_ONLY) {
      expect(reader, `${venture} is not enumerated`).toContain(`"${venture}"`);
    }
  });

  it("keeps the two typographic ventures out of image generation", async () => {
    const registry = JSON.parse(await readFile(
      path.join(process.cwd(), "..", "config", "ventures.json"),
      "utf8"
    )) as { ventures: Array<{ id: string; imageGeneration?: boolean }> };

    // Kvórum's registry says so and BOOKSOFHISTORY's founding decision says so; a pack that
    // shipped a generated picture for either would breach the decision, not just the design.
    for (const venture of ["kvorum", "booksofhistory"]) {
      const entry = registry.ventures.find((candidate) => candidate.id === venture);
      expect(entry?.imageGeneration ?? false, `${venture} may not generate images`).toBe(false);
    }
  });
});
