import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PortfolioCard,
  adminImagePreviewSource,
  isAdminImageAsset
} from "./portfolio-card";
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

  it("rebuilds committed social frames through the protected Admin renderer", () => {
    expect(adminImagePreviewSource(
      "/social/2026-08-05/cs/instagram/frame-01.png"
    )).toBe("/admin/api/social-frames/2026-08-05/cs/instagram/1");
    expect(adminImagePreviewSource(
      "/social/2026-08-05/en/threads/frame-04.png"
    )).toBe("/admin/api/social-frames/2026-08-05/en/threads/4");
    expect(adminImagePreviewSource("/admin/media/preview.webp"))
      .toBe("/admin/media/preview.webp");
  });

  it("keeps arbitrary assets as text instead of passing them to next/image", () => {
    const html = renderToStaticMarkup(<PortfolioCard card={card} originHref={null} />);
    expect(html).toContain("/admin/media/preview.webp");
    expect(html).toContain("renders/future-image.json");
    expect(html).toContain("https://untrusted.example/asset.png");
    expect(html).toContain("Attached assets");
  });

  it("does not expose a missing public URL for a versioned social frame", () => {
    const html = renderToStaticMarkup(
      <PortfolioCard
        card={{
          ...card,
          media: ["/social/2026-08-05/cs/threads/frame-04.png"]
        }}
        originHref={null}
      />
    );
    expect(html).toContain(
      "/admin/api/social-frames/2026-08-05/cs/threads/4"
    );
    expect(html).not.toContain(
      'href="/social/2026-08-05/cs/threads/frame-04.png"'
    );
  });
});
