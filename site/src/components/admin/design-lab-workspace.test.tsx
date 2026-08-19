import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminWriteProvider } from "./admin-write-mode";
import { DesignLabWorkspace } from "./design-lab-workspace";
import type { LabArticle } from "@/lib/design-lab";

const ARTICLE = {
  id: "caught-up/2026-08-19/synthetic-evidence",
  venture: "caught-up",
  locale: "cs",
  ventureLabel: "Caught Up",
  slug: "synthetic-evidence",
  date: "2026-08-19",
  headline: "Syntetický článek pro test",
  coverLine: "Syntetický cover line",
  origin: "recorded",
  slides: Array.from({ length: 5 }, (_, index) => ({
    index,
    text: `Syntetický text slidu ${index + 1}.`,
    words: 5,
    edited: false,
  })),
  hasHero: false,
  heroCredit: null,
  problems: [],
  renderable: true,
  recipe: {
    schemaVersion: "carousel-recipe/1",
    venture: "caught-up",
    slug: "synthetic-evidence",
    date: "2026-08-19",
    family: "masthead",
    variant: "A",
    accentSwap: false,
    treatment: "none",
    typeScale: 1,
    phaseSeed: 0,
  },
  recipePinned: false,
  copy: {
    schemaVersion: "social-copy/1",
    venture: "caught-up",
    slug: "synthetic-evidence",
    date: "2026-08-19",
    locale: "cs",
    copy: {
      igCaption: "Syntetický popisek.",
      hashtags: ["synthetic", "evidence", "fixture", "admin", "test"],
      threadsText: "Syntetický text pro Threads.",
      storyLine: "Syntetický text pro Story.",
    },
    heroCredit: null,
    origin: "desk",
  },
  caption: "Syntetický popisek.",
  dualLanguage: null,
} satisfies LabArticle;

describe("the Design Lab workspace", () => {
  it("names the initial-empty state instead of presenting a blank rail", () => {
    const html = renderToStaticMarkup(<DesignLabWorkspace articles={[]} presets={[]} />);

    expect(html).toContain('data-admin-state="initial-empty"');
    expect(html).toContain("Zatím tu není žádný článek");
  });

  it("keeps social delivery held while preserving manual exports", () => {
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled={false}>
        <DesignLabWorkspace articles={[ARTICLE]} presets={[]} />
      </AdminWriteProvider>,
    );

    expect(html).toContain("nikam se neposílají");
    expect(html).toContain("Publikování je zavřené");
    expect(html).toContain("Stáhnout slide");
    expect(html).toContain("Stáhnout celý deck");
    expect(html).not.toContain("publikovat automaticky");
  });
});
