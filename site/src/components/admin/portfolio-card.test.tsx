import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioCard, isAdminImageAsset } from "./portfolio-card";
import type { AdminCard } from "@/lib/admin-portfolio";

const card: AdminCard = {
  id: "plan-fixture",
  ventureId: "titty-tuesdays",
  kind: "plan",
  title: "Asset fixture",
  summary: "A plan with one safe preview and one opaque asset reference.",
  detailPath: null,
  status: "draft",
  originMeetingRef: null,
  createdAt: null,
  updatedAt: null,
  contentHash: "sha256:abcdef123456",
  media: ["/admin/media/preview.webp", "renders/future-image.json", "https://untrusted.example/asset.png"],
  ratings: [],
  graduation: null
};

describe("PortfolioCard media", () => {
  it("sends only rooted image files to next/image", () => {
    expect(isAdminImageAsset("/admin/media/preview.webp")).toBe(true);
    expect(isAdminImageAsset("renders/future-image.json")).toBe(false);
    expect(isAdminImageAsset("https://untrusted.example/asset.png")).toBe(false);
  });

  it("keeps arbitrary assets as text instead of passing them to next/image", () => {
    const html = renderToStaticMarkup(<PortfolioCard card={card} originHref={null} />);
    expect(html).toContain("/admin/media/preview.webp");
    expect(html).toContain("renders/future-image.json");
    expect(html).toContain("https://untrusted.example/asset.png");
    expect(html).toContain("Attached assets");
  });
});
