import "server-only";
import path from "node:path";
import { CAROUSEL_BRANDS, CAROUSEL_SUMMARY_VENTURES, type BrandTokens } from "@boardlessai/carousel-studio";
import { readDesignLab, readDesignLabPresets, type LabArticle, type LabPreset } from "@/lib/design-lab";
import { readWebDevDesignLabSnapshot, type WebDevDesignLabSnapshot } from "@/lib/webdev-signal-design-lab";

/**
 * The Design Lab, one section per venture.
 *
 * One workspace held every venture's articles in a single list, so the answer to "what does MMA
 * Files look like right now" was a scroll through DNESKAi's week. Worse, the branding the renderer
 * actually applies — the colours and the three typefaces — appeared nowhere the owner could see
 * it, so choosing a design meant guessing which palette it would come out in.
 *
 * The section list is the renderer's own brand registry and not a list written here. A venture
 * with brand tokens has a section; a venture without them has nothing to render with, so it does
 * not. That is the whole rule: a new venture gets its section by acquiring an identity, which is
 * the same act that lets the studio draw for it, and nobody has to remember to add it twice.
 * `CAROUSEL_BRANDS` is also what the export and deck routes pass to the renderer, so a section
 * shows the tokens that will be used rather than a copy of them that can drift.
 */

export type DesignLabVentureId = BrandTokens["id"];

/**
 * The two magazines deliver articles and Tehdejší svět delivers recorded features. The other
 * brands have identity-only sections. A section says which kind it is so the content area can
 * explain an empty workspace.
 */
const PUBLISHES_ARTICLES: ReadonlySet<string> = new Set(CAROUSEL_SUMMARY_VENTURES);

/** The name the owner uses. The id addresses state and never changes; the surface speaks. */
const DISPLAY_NAME: Readonly<Record<string, string>> = {
  "caught-up": "DNESKAi"
};

export interface DesignLabSwatch {
  token: string;
  value: string;
}

export interface DesignLabSection {
  id: DesignLabVentureId;
  name: string;
  logoText: string;
  /** The accent the renderer will use, so the section's own chip carries the venture's colour. */
  accent: string;
  publishesArticles: boolean;
  articleCount: number;
  presetCount: number;
}

export interface DesignLabVenture extends DesignLabSection {
  swatches: DesignLabSwatch[];
  fonts: BrandTokens["fonts"];
  presets: LabPreset[];
  articles: LabArticle[];
  webDevRenders: WebDevDesignLabSnapshot | null;
}

function displayName(brand: BrandTokens): string {
  return DISPLAY_NAME[brand.id] ?? brand.name;
}

/**
 * Colour tokens in the order the renderer declares them, not sorted.
 *
 * Alphabetising puts `accent` first and `background` second, which reads as a palette whose
 * loudest colour is its ground. Declaration order is background, surfaces, text, then the two
 * accents — the order a designer would show them in.
 */
function swatches(brand: BrandTokens): DesignLabSwatch[] {
  return Object.entries(brand.colors).map(([token, value]) => ({ token, value }));
}

export function designLabVentureIds(): DesignLabVentureId[] {
  return Object.keys(CAROUSEL_BRANDS) as DesignLabVentureId[];
}

export function isDesignLabVenture(value: string | undefined): value is DesignLabVentureId {
  return value !== undefined && value in CAROUSEL_BRANDS;
}

/** The section nav: every venture the studio can draw for, with what each currently holds. */
export async function readDesignLabSections(): Promise<DesignLabSection[]> {
  const sections: DesignLabSection[] = [];
  for (const id of designLabVentureIds()) {
    const brand = CAROUSEL_BRANDS[id];
    const publishesArticles = PUBLISHES_ARTICLES.has(id);
    const [articles, presets, webDevRenders] = await Promise.all([
      publishesArticles ? readDesignLab(40, id) : Promise.resolve([]),
      readDesignLabPresets(id),
      id === "webdev-signal" ? readWebDevDesignLabSnapshot(process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..")) : Promise.resolve(null)
    ]);
    sections.push({
      id,
      name: displayName(brand),
      logoText: brand.logoText,
      accent: brand.colors.accent ?? brand.colors.foreground ?? "#ffffff",
      publishesArticles,
      articleCount: articles.length,
      presetCount: id === "webdev-signal" ? webDevRenders?.entries.length ?? 0 : presets.length
    });
  }
  return sections;
}

/**
 * One section in full: its identity, its designs and its content.
 *
 * Resolved on the server and handed across as plain JSON, the same sanitising boundary the office
 * walkthrough uses — the workspace is a client component and the studio package is the render
 * engine, so nothing here may cross into it.
 */
export async function readDesignLabVenture(id: DesignLabVentureId): Promise<DesignLabVenture> {
  const brand = CAROUSEL_BRANDS[id];
  const publishesArticles = PUBLISHES_ARTICLES.has(id);
  const [articles, presets, webDevRenders] = await Promise.all([
    publishesArticles ? readDesignLab(40, id) : Promise.resolve([]),
    readDesignLabPresets(id),
    id === "webdev-signal" ? readWebDevDesignLabSnapshot(process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..")) : Promise.resolve(null)
  ]);
  return {
    id,
    name: displayName(brand),
    logoText: brand.logoText,
    accent: brand.colors.accent ?? brand.colors.foreground ?? "#ffffff",
    publishesArticles,
    articleCount: articles.length,
    presetCount: id === "webdev-signal" ? webDevRenders?.entries.length ?? 0 : presets.length,
    swatches: swatches(brand),
    fonts: brand.fonts,
    presets,
    articles,
    webDevRenders
  };
}
