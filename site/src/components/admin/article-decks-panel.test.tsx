import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeckSaveBadge, warningFor } from "./article-decks-panel";

/**
 * The three things a save can be saying, and the one thing it must never do.
 *
 * The bug was not that saves failed — it was that a failed save moved the chip back, so the
 * owner's click undid itself with no explanation. Viewing is a render and cannot fail; the badge
 * is the only thing a save is allowed to change. These assert the badge says something different
 * and true in each state, including which of the two token problems it is.
 */

describe("the deck save badge", () => {
  it("rests by naming the design the deck currently ships with", () => {
    const html = renderToStaticMarkup(<DeckSaveBadge save={{ kind: "rest", style: "editorial" }} />);
    expect(html).toContain('data-save-state="rest"');
    expect(html).toContain("vychází editorial");
  });

  it("says it is saving while the write is in flight", () => {
    const html = renderToStaticMarkup(<DeckSaveBadge save={{ kind: "saving", style: "contrast" }} />);
    expect(html).toContain('data-save-state="saving"');
    expect(html).toContain("ukládám");
  });

  it("names the commit the save produced, so the owner can find it", () => {
    const html = renderToStaticMarkup(<DeckSaveBadge save={{ kind: "saved", style: "aurora", commit: "764423f" }} />);
    expect(html).toContain('data-save-state="saved"');
    expect(html).toContain("uloženo aurora");
    expect(html).toContain("764423f");
  });

  it("warns without a commit reference when the write was local", () => {
    const html = renderToStaticMarkup(<DeckSaveBadge save={{ kind: "saved", style: "mesh", commit: null }} />);
    expect(html).toContain("uloženo mesh");
    expect(html).not.toContain("·");
  });

  it("marks an unsaved design as unsaved rather than reverting it", () => {
    const html = renderToStaticMarkup(
      <DeckSaveBadge save={{ kind: "warning", style: "spotlight", cause: "no-token", message: warningFor("no-token") }} />
    );
    expect(html).toContain('data-save-state="warning"');
    expect(html).toContain("neuloženo");
    // The chip's own state is not the badge's business, which is the whole point of the split.
    expect(html).not.toContain("editorial");
  });
});

describe("the two ways persistence can be unavailable", () => {
  it("says the deployment carries no token", () => {
    expect(warningFor("no-token")).toContain("chybí BOARDLESSAI_GITHUB_TOKEN");
    expect(warningFor("no-token")).toContain("nevydrží obnovení stránky");
  });

  it("says a token exists but GitHub refused it, which is the expiry case", () => {
    expect(warningFor("token-refused")).toContain("odmítl");
    expect(warningFor("token-refused")).toContain("Contents read/write");
    expect(warningFor("token-refused")).not.toBe(warningFor("no-token"));
  });

  it("falls back to whatever the server said for a cause it does not know", () => {
    expect(warningFor("github", "GitHub Studio write failed with 500.")).toBe("GitHub Studio write failed with 500.");
  });
});
