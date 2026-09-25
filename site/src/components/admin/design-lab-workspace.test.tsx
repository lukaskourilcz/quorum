import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminWriteProvider } from "./admin-write-mode";
import { DesignLabWorkspace } from "./design-lab-workspace";
import { canvaBrief } from "./design-lab-model";
import type { LabArticle } from "@/lib/design-lab";
import type { LabPackageArticle } from "@/lib/design-lab-package";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ARTICLE = {
  kind: "summary",
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
  it("carries source copy, brand and photo credit into the Canva handoff", () => {
    const article = { ...ARTICLE, heroCredit: "Foto: Žaneta · CC BY 4.0", designTokens: {
      colors: { accent: "#EF4770" }, fonts: { headline: "Inter", body: "Inter", mono: "IBM Plex Mono" }
    } };
    const copy = ["Příliš žluťoučký kůň", "Zdroj uvádí nejistý odhad, nikoli výsledek."];
    const brief = canvaBrief(article, article.recipe, "instagram-story", copy);
    for (const value of [...copy, article.caption, article.heroCredit, article.slug, "1080 × 1920", "#EF4770", "IBM Plex Mono"])
      expect(brief).toContain(value);
    expect(brief).toContain("https://www.instagram.com/technology/");
  });
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

    expect(html).toContain("nikam neposílají");
    expect(html).toContain("Publikování řídí samostatné schválení");
    expect(html).toContain("Stáhnout slide");
    expect(html).toContain("Stáhnout celý deck");
    expect(html).not.toContain("publikovat automaticky");
  });

  it("opens the article the link names, and says so when the link names none of them", () => {
    const second = { ...ARTICLE, id: "caught-up/2026-08-20/second", slug: "second", date: "2026-08-20", headline: "Druhý článek" };
    const linked = renderToStaticMarkup(<DesignLabWorkspace articles={[ARTICLE, second]} initialArticleId={second.id} presets={[]} />);
    expect(linked).toContain('data-lab-article="caught-up/second/2026-08-20"');
    expect(linked).not.toContain("data-article-link-missing");
    const missing = renderToStaticMarkup(<DesignLabWorkspace articles={[ARTICLE, second]} initialArticleId="caught-up:gone:2026-01-01" presets={[]} />);
    expect(missing).toContain('data-lab-article="caught-up/synthetic-evidence/2026-08-19"');
    expect(missing).toContain("data-article-link-missing");
  });
});

const PACKAGE: LabPackageArticle = {
  kind: "package",
  id: "devshark:marketingshark-2026-09-26-devshark:2026-09-26",
  venture: "devshark",
  ventureLabel: "devShark",
  slug: "marketingshark-2026-09-26-devshark",
  date: "2026-09-26",
  locale: "en",
  headline: "Which format can browser code parse without an XML parser?",
  slides: (["hook", "context", "reveal", "why", "footer"] as const).map((role, index) => ({
    index,
    role,
    templateId: ["minimal-text-poster", "quiz-question-context", "stat-highlight", "quote-card", "minimal-text-poster"][index]!,
    original: { headline: `Headline ${index + 1}`, body: "", alt: `Slide ${index + 1}` },
    current: { headline: `Headline ${index + 1}`, body: "", alt: `Slide ${index + 1}` },
    edited: false
  })),
  renderable: true,
  problems: [],
  limits: { hook: 80, headline: 120, body: 600, alt: 200, altTotal: 1000 },
  queueItems: [
    { id: "ms-2026-09-26-devshark-en-linkedin", platform: "linkedin", status: "draft", contentHash: "a".repeat(64) },
    { id: "ms-2026-09-26-devshark-en-instagram", platform: "instagram", status: "queued", contentHash: "b".repeat(64) }
  ]
};

describe("a devShark package in the workspace (quorum#575)", () => {
  it("shows its five slides, the three fields of the open one, and the drafts Send to Queue replaces", () => {
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled>
        <DesignLabWorkspace articles={[PACKAGE]} initialArticleId={PACKAGE.id} presets={[]} />
      </AdminWriteProvider>
    );
    expect(html).toContain("data-lab-package");
    expect(html.match(/aria-label="Open slide \d, /gu)).toHaveLength(5);
    for (const label of ["Headline", "Body", "Alt text", "Save slide", "Send to Queue", "LinkedIn · draft", "Instagram · queued"]) expect(html).toContain(label);
    expect(html).toContain(`/admin/api/carousel-studio/package/devshark/${PACKAGE.slug}/${PACKAGE.date}/1`);
    // No family look, no deck export and no "nothing is sent" line: the package has its own footer.
    expect(html).not.toContain("data-launch-looks");
    expect(html).not.toContain("Stáhnout celý deck");
    expect(html).not.toContain("nikam neposílají");
    expect(html).toContain("Nothing is posted");
  });

  it("keeps every control inert while writes are disabled, and says when no draft is left to replace", () => {
    const html = renderToStaticMarkup(
      <AdminWriteProvider enabled={false}>
        <DesignLabWorkspace articles={[{ ...PACKAGE, queueItems: [] }]} presets={[]} />
      </AdminWriteProvider>
    );
    expect(html).toMatch(/<button[^>]*data-send-package[^>]*disabled/u);
    expect(html).toMatch(/<button[^>]*data-save-package-slide[^>]*disabled/u);
    expect(html).toContain("nothing to replace");
  });
});
