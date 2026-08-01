import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { deterministicArticleImage } from "../src/images/article-image.js";
import { verifyReleaseSnapshot } from "../src/delivery/verifier.js";

function html(input: { title: string; hash: string; attribution: string }): string {
  return `<!doctype html><html><head><meta name="boardless-content-hash" content="${input.hash}"></head><body><h1>${input.title}</h1><a>${input.attribution}</a></body></html>`;
}

describe("post-deploy release verifier", () => {
  it("passes both locale routes, exact titles, hash marker and image dimensions", async () => {
    const packageHash = "a".repeat(64);
    const image = deterministicArticleImage({
      venture: "caught-up",
      slug: "2026-08-01-fixture",
      title: "A verified fixture",
      altEn: "Fixture cover",
      altCs: "Zkušební obálka"
    });
    const checks = await verifyReleaseSnapshot({
      venture: "caught-up",
      slug: "2026-08-01-fixture",
      packageHash,
      titles: { en: "A verified fixture", cs: "Ověřená zkouška" },
      pages: {
        en: { locale: "en", url: "https://caughtup-ai.vercel.app/en/articles/2026-08-01-fixture", status: 200, html: html({ title: "A verified fixture", hash: packageHash, attribution: image.license.attribution_html }) },
        cs: { locale: "cs", url: "https://caughtup-ai.vercel.app/cs/articles/2026-08-01-fixture", status: 200, html: html({ title: "Ověřená zkouška", hash: packageHash, attribution: image.license.attribution_html }) }
      },
      image,
      imageUrl: "https://caughtup-ai.vercel.app/images/editions/2026-08-01-fixture/hero.svg",
      imageStatus: 200,
      imageBytes: Buffer.from(image.hero_bytes_base64, "base64")
    }, new Date("2026-08-01T12:00:00.000Z"));
    expect(checks).toHaveLength(7);
    expect(checks.every((item) => item.status === "pass")).toBe(true);
    expect((await sharp(Buffer.from(image.hero_bytes_base64, "base64")).metadata()).width).toBe(1_600);
  });

  it("fails when a locale is stale or the content hash is absent", async () => {
    const image = deterministicArticleImage({ venture: "mma-files", slug: "fixture", title: "Fixture", altEn: "Fixture", altCs: "Zkouška" });
    const checks = await verifyReleaseSnapshot({
      venture: "mma-files",
      slug: "fixture",
      packageHash: "b".repeat(64),
      titles: { en: "Fixture", cs: "Zkouška" },
      pages: {
        en: { locale: "en", url: "https://mma-files.vercel.app/en/articles/fixture", status: 200, html: "<h1>Old title</h1>" },
        cs: { locale: "cs", url: "https://mma-files.vercel.app/cs/articles/fixture", status: 404, html: "not found" }
      },
      image,
      imageUrl: "https://mma-files.vercel.app/images/articles/fixture/hero.svg",
      imageStatus: 200,
      imageBytes: Buffer.from(image.hero_bytes_base64, "base64")
    });
    expect(checks.find((item) => item.name === "czech-route")?.status).toBe("fail");
    expect(checks.find((item) => item.name === "content-hash")?.status).toBe("fail");
    expect(checks.find((item) => item.name === "title-slug")?.status).toBe("fail");
  });
});
