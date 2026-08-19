import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { MmaFilesBannersPanel, sourceCrop } from "./mma-files-banners-panel";
import type { AdminMmaBanners } from "@/lib/admin-mma-files";

const slot = (id: string) => ({ id, desktop: { width: 300, height: 250 }, variants: [], mobile: { width: 300, height: 250 }, pages: ["home"], enabled: false, image: null, alt: "", href: null, stagedChanged: false });

describe("MMA banner crop panel", () => {
  it("keeps a movable crop inside the source at the exact target aspect", () => {
    expect(sourceCrop({ width: 1_200, height: 900 }, { width: 300, height: 250 }, 50, 50)).toEqual({ sx: 60, sy: 0, sw: 1080, sh: 900 });
    expect(sourceCrop({ width: 900, height: 1_200 }, { width: 728, height: 90 }, 50, 100)).toMatchObject({ sx: 0, sy: expect.any(Number), sw: 900 });
  });

  it("renders six crop editors and the guarded delivery action", () => {
    const banners: AdminMmaBanners = { status: "staged", preparedAt: "2026-08-09T00:00:00.000Z", receiptRef: null, slots: ["masthead-billboard", "infeed-rectangle", "article-top", "article-mid", "article-rail", "footer-billboard"].map(slot) };
    const html = renderToStaticMarkup(<MmaFilesBannersPanel banners={banners} />);
    expect(html.match(/type="file"/gu)).toHaveLength(6);
    expect(html).toContain("Vodorovné těžiště ořezu");
    expect(html).toContain("Připravit přesný ořez");
    expect(html).toContain("Doručit");
  });

  it("names an empty banner registry", () => {
    const banners: AdminMmaBanners = {
      status: "delivered",
      preparedAt: "2026-08-09T00:00:00.000Z",
      receiptRef: null,
      slots: [],
    };
    const html = renderToStaticMarkup(<MmaFilesBannersPanel banners={banners} />);

    expect(html).toContain('data-admin-state="initial-empty"');
    expect(html).toContain("žádné bannerové sloty");
  });
});
