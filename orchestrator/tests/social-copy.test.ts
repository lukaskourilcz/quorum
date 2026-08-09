import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MissingCreditError,
  SocialCopyPackSchema,
  completeHashtags,
  derivedCopyPack,
  deskCopyPack,
  renderCaption,
  renderCaptionFile
} from "@boardlessai/carousel-studio";
import { articleCopyPack, socialCopyPath, storeSocialCopyPack } from "../src/studio/social-copy-store.js";
import type { ArticlePackage } from "../src/contracts/mma-files.js";

/**
 * The words that travel with a deck.
 *
 * They existed only as a concatenation performed inside the queue path, so the Lab had a deck and
 * no caption and an export was impossible. Now the desk writes them in the same call that writes
 * the article — the `altHeadline` precedent, no new paid call site — and the pipeline records
 * them beside the summary.
 */

const CREDIT = "Tech. Sgt. Katie Gar Ward · CC0 · Wikimedia Commons";

function article(overrides: Record<string, unknown> = {}): ArticlePackage {
  return {
    schemaVersion: "article/1",
    slug: "ufc-valentina-shevchenko",
    localizations: {
      cs: {
        title: "Trilogie, kterou nikdo nechtěl",
        dek: "Tři zápasy, tři výsledky a jedna otázka, na kterou zatím nikdo neodpověděl.",
        bodyMDX: "Text.",
        imageAlt: "Ilustrační obrázek k článku",
        ...overrides
      }
    },
    format: "fighter-profile",
    sources: [{ kind: "internal", ref: "state/mma/fighters/ufc:valentina-shevchenko.json" }],
    image: { license: { attribution_html: `<a href="#">${CREDIT}</a>` } },
    heroSpec: { template: "frame", bindings: {} },
    fighterRefs: ["ufc:valentina-shevchenko"],
    publishAt: "2026-08-02T06:00:00.000Z",
    slot: "am",
    status: "published",
    packageHash: "0".repeat(64)
  } as unknown as ArticlePackage;
}

describe("the licence credit", () => {
  it("is appended by code, never asked of the model", () => {
    expect(renderCaption("Tři zápasy, tři výsledky.", CREDIT)).toBe(`Tři zápasy, tři výsledky.\n\n${CREDIT}`);
  });

  it("is not doubled when the caption already carries it", () => {
    const once = renderCaption("Věta.", CREDIT);
    expect(renderCaption(once, CREDIT)).toBe(once);
  });

  it("is absent, honestly, when the article carries no photograph", () => {
    expect(renderCaption("Věta.", null)).toBe("Věta.");
  });

  it("cannot be skipped by handing over an empty one", () => {
    expect(() => renderCaption("Věta.", "   ")).toThrow(MissingCreditError);
  });

  it("ends the caption file, after the hashtags are counted", () => {
    const pack = derivedCopyPack({
      venture: "mma-files",
      slug: "gamrot",
      date: "2026-08-06",
      headline: "Gamrot vs Salkilld",
      standfirst: "Co ten výsledek znamená pro lehkou váhu.",
      closing: "Celý ozdrojovaný text najdete v MMA Files.",
      heroCredit: CREDIT
    });
    const file = renderCaptionFile(pack);
    expect(file).toContain(CREDIT);
    expect(file.trimEnd().endsWith("#mmafiles")).toBe(true);
  });
});

describe("hashtags", () => {
  it("folds diacritics away, because Instagram matches a tag with one as a different tag", () => {
    expect(completeHashtags("mma-files", ["Bojové Sporty", "těžká váha"])).toContain("bojovesporty");
    expect(completeHashtags("mma-files", ["těžká váha"])).toContain("tezkavaha");
  });

  it("fills the venture's base set out and stops at ten", () => {
    const tags = completeHashtags("caught-up", ["openai", "regulace", "eu"]);
    expect(tags).toContain("dneskai");
    expect(tags.length).toBeGreaterThanOrEqual(5);
    expect(tags.length).toBeLessThanOrEqual(10);
  });

  it("never repeats one", () => {
    const tags = completeHashtags("mma-files", ["mma", "mma", "ufc"]);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("bounds", () => {
  const long = "x".repeat(900);

  it("clips the desk's copy to what each surface can hold", () => {
    const pack = deskCopyPack({
      venture: "mma-files",
      slug: "gamrot",
      date: "2026-08-06",
      copy: { igCaption: long, hashtags: ["mma"], threadsText: long, storyLine: long },
      heroCredit: null
    });
    expect(pack.copy.igCaption).toHaveLength(500);
    expect(pack.copy.threadsText).toHaveLength(480);
    expect(pack.copy.storyLine).toHaveLength(66);
  });

  it("refuses a pack that claims fewer than five hashtags", () => {
    expect(SocialCopyPackSchema.safeParse({
      schemaVersion: "social-copy/1",
      venture: "mma-files",
      slug: "gamrot",
      date: "2026-08-06",
      locale: "cs",
      copy: { igCaption: "Věta.", hashtags: ["mma"], threadsText: "Věta.", storyLine: "Věta." },
      heroCredit: null,
      origin: "desk"
    }).success).toBe(false);
  });
});

describe("an article's copy pack", () => {
  it("uses the desk's words when the desk wrote them", () => {
    const pack = articleCopyPack(article({
      igCaption: "Tři zápasy, tři výsledky.",
      hashtags: ["shevchenko", "flyweight"],
      threadsText: "Tři zápasy, tři výsledky. A jedna otázka.",
      storyLine: "Trilogie, kterou nikdo nechtěl"
    }))!;
    expect(pack.origin).toBe("desk");
    expect(pack.copy.igCaption).toBe("Tři zápasy, tři výsledky.");
    expect(pack.copy.hashtags).toContain("shevchenko");
    expect(pack.heroCredit).toBe(CREDIT);
  });

  it("falls back to the old concatenation for an article written before the fields existed", () => {
    const pack = articleCopyPack(article())!;
    expect(pack.origin).toBe("derived");
    expect(pack.copy.igCaption).toContain("Tři zápasy");
    expect(renderCaption(pack.copy.igCaption, pack.heroCredit)).toContain(CREDIT);
  });

  it("records where the Lab and the composer both look for it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-copy-"));
    const pack = articleCopyPack(article())!;
    const stored = await storeSocialCopyPack(root, pack);
    expect(stored.path).toBe(socialCopyPath(pack));
    expect(stored.path).toBe("ventures/carousel-studio/social-copy/mma-files/2026-08-02-ufc-valentina-shevchenko.json");
    expect(JSON.parse(await readFile(path.join(root, stored.path), "utf8"))).toMatchObject({
      schemaVersion: "social-copy/1",
      venture: "mma-files"
    });
  });
});
