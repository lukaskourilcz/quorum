import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminKvorumLedgerClaim } from "@/lib/admin-kvorum";
import { KvorumClaimsPanel } from "./kvorum-claims-panel";

const claim: AdminKvorumLedgerClaim = {
  id: "kv-claim-2026-08-12-public-media-claim-snemovna",
  date: "2026-08-12",
  slug: "public-media-claim-snemovna",
  recommendationId: "kv-2026-08-12-public-media",
  recommendationStatus: "posted",
  claimId: "claim-snemovna",
  claim: "Návrh se vrací do sněmovního projednávání.",
  type: "fact-multi",
  sources: [{
    sourceId: "irozhlas",
    sourceName: "iROZHLAS",
    url: "https://www.irozhlas.cz/zpravy-domov/televizni-poplatky",
    publishedAt: "2026-08-12T19:00:00.000Z",
    excerpt: "Sněmovna projedná financování médií veřejné služby.",
    discoveryOnly: false
  }],
  status: "standing",
  hasCorrectionDraft: false,
  createdAt: "2026-08-12T22:00:00.000Z",
  updatedAt: "2026-08-13T07:30:00.000Z",
  publishedAt: "2026-08-13T07:30:00.000Z",
  postedUrl: "https://example.com/manual-post"
};

describe("the Kvórum claims surface", () => {
  it("keeps an absent ledger truthful and offers no correction", () => {
    const html = renderToStaticMarkup(<KvorumClaimsPanel claims={[]} state="missing" unreadable={0} />);
    expect(html).toContain("No claim records are stored yet");
    expect(html).not.toContain("<button");
  });

  it("renders typed refs and correction choices for a manually posted standing claim", () => {
    const html = renderToStaticMarkup(<KvorumClaimsPanel claims={[claim]} state="present" unreadable={0} />);
    expect(html).toContain("fact-multi");
    expect(html).toContain("iROZHLAS");
    expect(html).toContain("manual post recorded");
    expect(html).toContain("Draft correction");
    expect(html).toContain("Draft retraction");
  });

  it("does not offer correction controls before publication", () => {
    const html = renderToStaticMarkup(<KvorumClaimsPanel claims={[{
      ...claim,
      recommendationStatus: "approved-draft",
      publishedAt: null,
      postedUrl: null
    }]} state="present" unreadable={0} />);
    expect(html).toContain("approved draft · not published");
    expect(html).toContain("Correction controls stay closed");
    expect(html).not.toContain("<button");
  });
});
