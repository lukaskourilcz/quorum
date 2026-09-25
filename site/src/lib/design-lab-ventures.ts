import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CAROUSEL_BRANDS, CAROUSEL_SUMMARY_VENTURES, type BrandTokens } from "@boardlessai/carousel-studio";
import { readDesignLab, readDesignLabPresets, type LabArticle, type LabPreset } from "@/lib/design-lab";
import { readDesignLabPackages, type LabPackageArticle } from "@/lib/design-lab-package";
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
 * The two magazines deliver articles, Tehdejší svět delivers recorded features and marketingShark
 * delivers a devShark package a day. The other brands have identity-only sections. A section says
 * which kind it is so the content area can explain an empty workspace.
 */
const PUBLISHES_ARTICLES: ReadonlySet<string> = new Set(CAROUSEL_SUMMARY_VENTURES);

/** A family deck from a summary, or a devShark package rendered through the quiz templates. */
export type DesignLabArticle = LabArticle | LabPackageArticle;

/** One section's articles, from the reader that owns its kind. */
function readArticles(id: DesignLabVentureId): Promise<DesignLabArticle[]> {
  if (!PUBLISHES_ARTICLES.has(id)) return Promise.resolve([]);
  return id === "devshark" ? readDesignLabPackages(40) : readDesignLab(40, id);
}

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
  articles: DesignLabArticle[];
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

/**
 * The venture a brand belongs to, where the two ids differ.
 *
 * marketingShark owns one brand per product it markets. Every other brand is its venture's own.
 */
const BRAND_VENTURE: Readonly<Record<string, string>> = {
  devshark: "marketingshark",
  geoshark: "marketingshark"
};

/**
 * The brands whose sections the Design Lab offers (`operations-2026-09b`).
 *
 * The renderer's registry decides what the studio *can* draw; the venture registry decides what
 * is running. A brand is offered when its venture is not paused and, for a marketingShark brand,
 * when that brand is enabled. A paused venture's brand keeps its tokens, so its recorded decks
 * still render at their own address. If either file cannot be read, every brand is offered, as
 * before this rule existed, rather than an empty studio.
 */
export async function activeDesignLabVentureIds(
  root = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..")
): Promise<DesignLabVentureId[]> {
  try {
    const registry = JSON.parse(await readFile(path.join(root, "config", "ventures.json"), "utf8")) as {
      ventures?: Array<{ id?: unknown; status?: unknown }>;
    };
    const marketing = JSON.parse(await readFile(path.join(root, "config", "marketingshark.json"), "utf8")) as {
      brands?: Array<{ id?: unknown; enabled?: unknown }>;
    };
    const status = new Map((registry.ventures ?? []).map((venture) => [String(venture.id), String(venture.status)]));
    const enabledBrands = new Set((marketing.brands ?? []).filter((brand) => brand.enabled === true).map((brand) => String(brand.id)));
    return designLabVentureIds().filter((id) => {
      const venture = BRAND_VENTURE[id] ?? id;
      const ventureStatus = status.get(venture);
      if (!ventureStatus || ventureStatus === "paused") return false;
      return venture !== "marketingshark" || enabledBrands.has(id);
    });
  } catch {
    return designLabVentureIds();
  }
}

/** The section nav: every running venture the studio can draw for, with what each currently holds. */
export async function readDesignLabSections(): Promise<DesignLabSection[]> {
  const sections: DesignLabSection[] = [];
  for (const id of await activeDesignLabVentureIds()) {
    const brand = CAROUSEL_BRANDS[id];
    const publishesArticles = PUBLISHES_ARTICLES.has(id);
    const [articles, presets, webDevRenders] = await Promise.all([
      readArticles(id),
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
    readArticles(id),
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
