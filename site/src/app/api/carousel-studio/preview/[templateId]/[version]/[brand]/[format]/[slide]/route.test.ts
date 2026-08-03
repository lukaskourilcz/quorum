import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => {
  throw new Error("The web preview must not load the native PNG renderer.");
});

function requestPreview(overrides: Partial<{
  templateId: string;
  version: string;
  brand: string;
  format: string;
  slide: string;
}> = {}) {
  const params = {
    templateId: "cover-cta",
    version: "1.0.0",
    brand: "caught-up",
    format: "instagram-square",
    slide: "1",
    ...overrides
  };
  const url = `http://localhost/api/carousel-studio/preview/${params.templateId}/${params.version}/${params.brand}/${params.format}/${params.slide}`;
  return GET(new Request(url), { params: Promise.resolve(params) });
}

describe("Carousel Studio preview route", () => {
  it("serves a checked SVG without a native image runtime", async () => {
    const response = await requestPreview();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(body).toMatch(/^<svg /);
    expect(body).toContain('width="1080" height="1080"');
    expect(body).toContain("Caught Up");
  });

  it("keeps invalid preview coordinates unavailable", async () => {
    const response = await requestPreview({ brand: "unknown" });
    expect(response.status).toBe(404);
  });
});
