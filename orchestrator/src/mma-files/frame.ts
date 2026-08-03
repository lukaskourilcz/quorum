import type { ArticlePackage, SocialVariantPack } from "../contracts/mma-files.js";
import { CAROUSEL_BRANDS, renderCarouselSvg } from "@boardlessai/carousel-studio";
import { resolveLiveCarouselTemplate } from "../studio/catalog.js";
import { canonicalJson, sha256 } from "./hash.js";

function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapWords(value: string, maximum = 26): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/u)) {
    if (line && `${line} ${word}`.length > maximum) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

function svgText(lines: readonly string[], x: number, y: number, size: number): string {
  return lines.map((line, index) =>
    `<text x="${x}" y="${y + index * Math.round(size * 1.08)}" fill="#f5f1e8" font-family="Arial, sans-serif" font-size="${size}" font-weight="700">${escapeXml(line)}</text>`
  ).join("");
}

export function renderArticleHero(article: ArticlePackage): string {
  const headline = article.heroSpec.bindings.headline ?? article.localizations.cs.title;
  const fingerprint = sha256(canonicalJson(article.heroSpec)).slice(0, 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(article.localizations.cs.title)}</title><desc id="desc">MMA Files typographic article cover. No human figure is generated.</desc><rect width="1600" height="900" fill="#111113"/><rect x="72" y="72" width="1456" height="756" rx="24" fill="#19191d" stroke="#ef6c35" stroke-width="3"/><path d="M72 230H1528" stroke="#34343a"/><text x="112" y="154" fill="#ef6c35" font-family="Arial, sans-serif" font-size="38" font-weight="700">MMA FILES · ${escapeXml(article.format.toUpperCase())}</text>${svgText(wrapWords(String(headline), 32), 112, 360, 82)}<text x="112" y="760" fill="#aaa7a0" font-family="monospace" font-size="25">${escapeXml(article.publishAt.slice(0, 10))} · ${escapeXml(article.slot.toUpperCase())} · ${fingerprint}</text></svg>`;
}

export interface SocialRender {
  key: `${"A" | "B"}-${"en" | "cs"}-${string}`;
  svg: string;
  sha256: string;
}

export function renderSocialVariants(pack: SocialVariantPack, article: ArticlePackage): SocialRender[] {
  return pack.variants.flatMap((variant) => (["en", "cs"] as const).flatMap((locale) => {
    // Czech is always there; a variant with no English carousel renders one locale, not a crash.
    const reference = variant.carousel[locale];
    if (!reference) return [];
    return renderCarouselSvg({
      template: resolveLiveCarouselTemplate(reference.template_id, reference.version),
      payload: reference.content,
      brand: CAROUSEL_BRANDS["mma-files"],
      format: "instagram-portrait"
    }).map((render) => ({
      key: `${variant.id}-${locale}-${String(render.index + 1).padStart(2, "0")}` as const,
      svg: render.svg,
      sha256: render.svgHash
    }));
  }));
}
