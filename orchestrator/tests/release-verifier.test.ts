import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { deterministicArticleImage } from "../src/images/article-image.js";
import { verifyReleaseSnapshot, resolveCiState } from "../src/delivery/verifier.js";

function html(input: { title: string; hash: string; attribution: string }): string {
  return `<!doctype html><html><head><meta name="boardless-content-hash" content="${input.hash}"></head><body><h1>${input.title}</h1><a>${input.attribution}</a></body></html>`;
}

describe("post-deploy release verifier", () => {
  it("passes both locale routes, exact titles, hash marker and image dimensions", async () => {
    const packageHash = "a".repeat(64);
    const image = deterministicArticleImage({
      venture: "caught-up",
      slug: "2026-08-01-fixture",
      title: "A verified fixture",});
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
    const image = deterministicArticleImage({ venture: "mma-files", slug: "fixture", title: "Fixture",});
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

describe("CI state from partial GitHub reads", () => {
  it("trusts a successful combined status when check runs are unreadable", () => {
    // The first MMA Files article reverted itself off the live site on "unavailable" while
    // its commit's combined status was success: one refused permission erased the other's
    // answer, because both endpoints were read under a single try.
    expect(resolveCiState({ state: "success", statuses: [{}] }, null)).toBe("success");
  });

  it("trusts passing check runs when the combined status is unreadable", () => {
    expect(resolveCiState(null, { check_runs: [{ status: "completed", conclusion: "success" }] })).toBe("success");
  });

  it("reports unavailable only when neither signal could be read", () => {
    expect(resolveCiState(null, null)).toBe("unavailable");
  });

  it("never turns an unreadable half into a pass", () => {
    expect(resolveCiState({ state: "pending", statuses: [{}] }, null)).toBe("pending");
    expect(resolveCiState({ state: "failure", statuses: [{}] }, null)).toBe("failure");
    expect(resolveCiState(null, { check_runs: [{ status: "completed", conclusion: "failure" }] })).toBe("failure");
    expect(resolveCiState({ state: "pending", statuses: [] }, { check_runs: [] })).toBe("missing");
  });
});

describe("a failing signal is not outvoted by a passing one", () => {
  it("fails when Actions reports a red check run and Vercel's commit status is green", () => {
    // /status is the legacy commit-status API that Vercel writes to; /check-runs is where
    // GitHub Actions reports. Deciding success on the first green signal let a deployed
    // preview outvote a red test suite on the same commit.
    expect(resolveCiState(
      { state: "success", statuses: [{}] },
      { check_runs: [{ status: "completed", conclusion: "failure" }] }
    )).toBe("failure");
  });

  it("fails when the commit status is red and every check run is green", () => {
    expect(resolveCiState(
      { state: "failure", statuses: [{}] },
      { check_runs: [{ status: "completed", conclusion: "success" }] }
    )).toBe("failure");
  });

  it("still passes when both readable signals agree", () => {
    expect(resolveCiState(
      { state: "success", statuses: [{}] },
      { check_runs: [{ status: "completed", conclusion: "success" }] }
    )).toBe("success");
  });
});
