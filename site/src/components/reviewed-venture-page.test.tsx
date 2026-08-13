import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReviewedVenturePresentation, type ReviewedVentureSlug, type ReviewedVentureSummary } from "./reviewed-venture-page";

vi.mock("next/navigation", () => ({ usePathname: () => "/ventures" }));
vi.mock("@/components/page-shell", () => ({ PageShell: ({ children }: { children: ReactNode }) => <>{children}</> }));

const summary: ReviewedVentureSummary = {
  measures: [
    { label: "Draft recommendations", value: 2, detail: "2 canonical drafts" },
    { label: "Owner-recorded posts", value: 0, detail: "nothing has been marked posted" },
    { label: "Malformed records", value: 0, detail: "none entered these totals" }
  ],
  unreadable: 0
};

describe("reviewed venture pages", () => {
  it.each([
    ["booksofhistory", "BOOKSOFHISTORY"],
    ["door-money", "Door Money"],
    ["kvorum", "Kvórum"],
    ["tehdejsi-svet", "Tehdejší svět"]
  ] as const)("renders truthful output and release boundaries for %s", (slug, name) => {
    const html = renderToStaticMarkup(<ReviewedVenturePresentation slug={slug as ReviewedVentureSlug} summary={summary} />);
    expect(html).toContain(name);
    expect(html).toContain("Draft recommendations");
    expect(html).toContain("Manual release");
    expect(html).toContain("only an owner-recorded URL is described as posted");
    expect(html).toContain(`data-reviewed-venture="${slug}"`);
  });

  it("points Tehdejší svět at its product site without presenting the product as repository output", () => {
    process.env.NEXT_PUBLIC_TEHDEJSI_PRODUCT_URL = "https://history.example";
    const html = renderToStaticMarkup(<ReviewedVenturePresentation slug="tehdejsi-svet" summary={summary} />);
    expect(html).toContain("Visit the product site");
    expect(html).toContain("https://history.example/");
    expect(html).toContain("without importing or duplicating the product here");
    delete process.env.NEXT_PUBLIC_TEHDEJSI_PRODUCT_URL;
  });

  it("does not promote a preview deployment before the production domain lands", () => {
    process.env.NEXT_PUBLIC_TEHDEJSI_PRODUCT_URL = "https://example.vercel.app";
    const html = renderToStaticMarkup(<ReviewedVenturePresentation slug="tehdejsi-svet" summary={summary} />);
    expect(html).not.toContain("Visit the product site");
    expect(html).toContain("production domain is recorded");
    delete process.env.NEXT_PUBLIC_TEHDEJSI_PRODUCT_URL;
  });

  it("reports dropped state instead of silently counting it", () => {
    const html = renderToStaticMarkup(<ReviewedVenturePresentation slug="kvorum" summary={{ ...summary, unreadable: 2 }} />);
    expect(html).toContain("2 malformed or unreadable records were dropped");
  });
});
