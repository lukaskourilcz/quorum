import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MmaFilesArticlePreview, withoutSourceMarkers } from "./mma-files-article-preview";
import type { AdminMmaArticle } from "@/lib/admin-mma-files";

// Verbatim from state/ventures/mma-files/articles/2026-08-02-am-ufc-valentina-shevchenko.json,
// the desk's first published article. The package hash covers this body, so the marker cannot be
// edited out of the stored file; the preview is where it stops reaching a reader.
const STORED_BODY =
  "[Valentina Shevchenko](/fighters/ufc/valentina-shevchenko) má podle svého UFC profilu bilanci 26-4-1. "
  + "[source:state/mma/fighters/ufc:valentina-shevchenko.json] Tři poslední zápasy mají společného jmenovatele.";

function storedArticle(bodyMDX: string): AdminMmaArticle {
  const copy = { title: "Trilogie", dek: "Tři zápasy, tři výsledky.", bodyMDX };
  return {
    id: "article:2026-08-02:am:ufc-valentina-shevchenko",
    slug: "ufc-valentina-shevchenko",
    date: "2026-08-02",
    slot: "am",
    format: "fighter-profile",
    status: "published",
    localizations: { en: copy, cs: copy },
    sources: [{ kind: "internal", ref: "state/mma/fighters/ufc:valentina-shevchenko.json" }],
    fighterRefs: ["ufc:valentina-shevchenko"],
    eventRef: null,
    modelVersion: null,
    packageHash: "0".repeat(64),
    contentHash: "sha256:000000000000",
    hero: {
      url: "/admin/api/mma-files/media?path=ventures%2Fmma-files%2Fmedia%2F2026-08-02-am-ufc-valentina-shevchenko%2Fhero.webp",
      alt: { en: "Valentina Shevchenko at a training simulator", cs: "Valentina Shevchenko v UFC kleci" },
      credit: "Tech. Sgt. Katie Gar Ward · CC0 · Wikimedia Commons",
      license: "CC0",
      sourceUrl: "https://commons.wikimedia.org/?curid=74924049"
    },
    ratings: []
  };
}

describe("the admin article preview shows no repository paths", () => {
  it("renders a stored body without the marker baked into it", () => {
    const html = renderToStaticMarkup(<MmaFilesArticlePreview article={storedArticle(STORED_BODY)} />);
    expect(html).not.toContain("[source:");
    expect(html).not.toContain("state/mma/fighters");
    // The sentence either side of the marker survives, and so does the fighter link.
    expect(html).toContain("bilanci 26-4-1. Tři poslední zápasy");
    expect(html).toContain("/fighters/ufc/valentina-shevchenko");
  });

  it("cleans the headline and the standfirst, not only the body", () => {
    const article = storedArticle("Bez značky.");
    article.localizations.en.title = "Trilogie [source:state/mma/bouts/ufc/history-0fb7c82c.json]";
    article.localizations.en.dek = "Tři zápasy [^source-1], tři výsledky.";
    const html = renderToStaticMarkup(<MmaFilesArticlePreview article={article} />);
    expect(html).not.toContain("[source:");
    expect(html).not.toContain("[^source-");
    expect(html).toContain("Trilogie</h3>");
    expect(html).toContain("Tři zápasy, tři výsledky.");
  });

  it("describes the photograph and names its author", () => {
    const article = storedArticle("Bez značky.");
    const html = renderToStaticMarkup(<MmaFilesArticlePreview article={article} />);
    // The package's own alt text, not a sentence about a typographic plate that stopped being
    // what these heroes are.
    expect(html).toContain('alt="Valentina Shevchenko at a training simulator"');
    expect(html).toContain("hero.webp");
    // Attribution travels with the picture. CC BY and CC BY-SA require it, and a preview that
    // drops it is the place where the habit of dropping it starts.
    expect(html).toContain("Tech. Sgt. Katie Gar Ward · CC0 · Wikimedia Commons");
    expect(html).toContain("https://commons.wikimedia.org/?curid=74924049");
  });

  it("still cleans a marker out of alt text, wherever the string came from", () => {
    const article = storedArticle("Bez značky.");
    article.hero!.alt.en = "Obálka [source:state/mma/fighters/ufc:x.json]";
    const html = renderToStaticMarkup(<MmaFilesArticlePreview article={article} />);
    expect(html).not.toContain("state/mma/fighters");
  });

  it("withholds a picture whose credit the package did not carry", () => {
    const article = { ...storedArticle("Bez značky."), hero: null };
    const html = renderToStaticMarkup(<MmaFilesArticlePreview article={article} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("žádný nezobrazuje");
  });

  it("removes a numbered marker without stranding the punctuation after it", () => {
    expect(withoutSourceMarkers("Zvítězila na body [^source-2], potřetí v titulovém zápase."))
      .toBe("Zvítězila na body, potřetí v titulovém zápase.");
  });

  it("leaves fighter links and paragraph breaks alone", () => {
    // The renderer splits on newlines and matches the link syntax afterwards, so the cleaning
    // pass must disturb neither.
    const body = "[Valentina Shevchenko](/fighters/ufc/valentina-shevchenko) vyhrála.\n\nGrasso remizovala.";
    expect(withoutSourceMarkers(body)).toBe(body);
  });
});
