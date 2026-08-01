import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "./route";

describe("Titty Tuesdays public catalog", () => {
  it("returns only the four concept-safe storefront fields", async () => {
    const response = await GET();
    const payload = await response.json() as { products: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(payload.products).toHaveLength(4);
    expect(payload.products.every((product) => product.publicStatus === "concept")).toBe(true);
    expect(Object.keys(payload.products[0] ?? {}).sort()).toEqual([
      "artifactVersion",
      "conceptSlug",
      "designNote",
      "name",
      "publicStatus",
      "seasonId",
      "updatedAt",
      "ventureId"
    ]);
  });
});
