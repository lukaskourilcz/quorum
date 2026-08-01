import type { ArticlePackage, SocialVariantPack } from "../contracts/mma-files.js";
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
  const headline = article.heroSpec.bindings.headline ?? article.localizations.en.title;
  const fingerprint = sha256(canonicalJson(article.heroSpec)).slice(0, 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(article.localizations.en.title)}</title><desc id="desc">MMA Files typographic article cover. No human figure is generated.</desc><rect width="1600" height="900" fill="#111113"/><rect x="72" y="72" width="1456" height="756" rx="24" fill="#19191d" stroke="#ef6c35" stroke-width="3"/><path d="M72 230H1528" stroke="#34343a"/><text x="112" y="154" fill="#ef6c35" font-family="Arial, sans-serif" font-size="38" font-weight="700">MMA FILES · ${escapeXml(article.format.toUpperCase())}</text>${svgText(wrapWords(String(headline), 32), 112, 360, 82)}<text x="112" y="760" fill="#aaa7a0" font-family="monospace" font-size="25">${escapeXml(article.publishAt.slice(0, 10))} · ${escapeXml(article.slot.toUpperCase())} · ${fingerprint}</text></svg>`;
}

export interface SocialRender {
  key: `${"A" | "B"}-${"en" | "cs"}`;
  svg: string;
  sha256: string;
}

export function renderSocialVariants(pack: SocialVariantPack, article: ArticlePackage): SocialRender[] {
  return pack.variants.flatMap((variant) => (["en", "cs"] as const).map((locale) => {
    const title = article.localizations[locale].title;
    const palette = variant.id === "A"
      ? { background: "#111113", card: "#1d1d22", accent: "#ef6c35" }
      : { background: "#e9e1d3", card: "#f8f3ea", accent: "#7c2d12" };
    const key = `${variant.id}-${locale}` as const;
    const fingerprint = sha256(canonicalJson({ article: article.packageHash, variant, locale })).slice(0, 12);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(title)}</title><desc id="desc">MMA Files social variant ${key}. No human figure is generated.</desc><rect width="1080" height="1350" fill="${palette.background}"/><rect x="60" y="60" width="960" height="1230" rx="28" fill="${palette.card}" stroke="${palette.accent}" stroke-width="4"/><text x="104" y="150" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="38" font-weight="700">MMA FILES · ${variant.id} · ${locale.toUpperCase()}</text>${svgText(wrapWords(title, 22), 104, 350, 70)}<text x="104" y="1120" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="30">${escapeXml(variant.designAxes.templateFamily)} · ${escapeXml(variant.designAxes.headlineFraming)}</text><text x="104" y="1200" fill="${palette.accent}" font-family="monospace" font-size="24">${fingerprint}</text></svg>`;
    return { key, svg, sha256: sha256(svg) };
  }));
}
