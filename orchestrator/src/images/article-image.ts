import { createHash } from "node:crypto";
import { ArticleImageSchema, type ArticleImage } from "../contracts/autonomy.js";

export const ALLOWED_IMAGE_LICENSES = new Set([
  "CC0",
  "CC BY",
  "CC BY-SA",
  "Pexels License",
  "Pixabay Content License"
]);

export interface LicensedImageCandidate {
  license: string | null;
  author: string | null;
  sourceUrl: string | null;
  attributionHtml: string | null;
}

export function validateLicensedImageCandidate(candidate: LicensedImageCandidate): string[] {
  const problems: string[] = [];
  const normalized = candidate.license?.trim() ?? "";
  if (!ALLOWED_IMAGE_LICENSES.has(normalized)) problems.push("license-not-allowed");
  if (!candidate.author?.trim()) problems.push("author-missing");
  if (!candidate.sourceUrl?.startsWith("https://")) problems.push("source-url-invalid");
  if (!candidate.attributionHtml?.trim()) problems.push("attribution-missing");
  return problems;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function lines(value: string, maximum: number): string[] {
  const result: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/u)) {
    if (line && `${line} ${word}`.length > maximum) {
      result.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) result.push(line);
  return result.slice(0, 4);
}

/**
 * The cover drawn when no honestly licensed photograph fits.
 *
 * It used to set the article's own headline in large type, so a reader met the same sentence
 * twice: once as the page title and once as the picture beneath it. A cover that repeats the
 * headline adds nothing and looks like a placeholder, which is what the owner called it.
 *
 * What is drawn instead is a deterministic field seeded by the article's fingerprint: the
 * same article always yields the same cover, different articles look plainly different, and
 * nothing is claimed that the article does not contain. The only words are the venture, the
 * publication date and the subject tags — chrome a reader can use, not prose they have
 * already read.
 */
function brandName(venture: "caught-up" | "mma-files"): string {
  return venture === "caught-up" ? "Caught Up" : "MMA Files";
}

function frameSvg(input: {
  width: number;
  height: number;
  venture: "caught-up" | "mma-files";
  fingerprint: string;
  date: string;
  tags: readonly string[];
}): string {
  const accent = input.venture === "caught-up" ? "#79f2c0" : "#ef6c35";
  const brand = input.venture === "caught-up" ? "CAUGHT UP" : "MMA FILES";
  const unit = input.width / 32;
  const seed = input.fingerprint.padEnd(16, "0");
  const nibble = (index: number) => Number.parseInt(seed[index % seed.length]!, 16);

  // Sixteen columns whose heights and opacities come from the fingerprint. A tall bar next to
  // a short one reads as a chart, which is what a briefing about measured things should look
  // like, and no two fingerprints give the same skyline.
  // The field is bounded by the frame and by the text block above it, so a tall bar can never
  // run off the canvas or through the wordmark.
  const floor = input.height - unit * 3;
  const ceiling = unit * 9.5;
  const span = Math.max(unit, floor - ceiling);
  const columns = Array.from({ length: 16 }, (_, index) => {
    const height = span * (0.18 + (nibble(index) / 15) * 0.82);
    const x = unit * 2 + index * unit * 1.75;
    const y = floor - height;
    const opacity = (0.18 + (nibble(index + 7) / 15) * 0.62).toFixed(2);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(unit * 1.1).toFixed(1)}" height="${height.toFixed(1)}" rx="${(unit * 0.18).toFixed(1)}" fill="${accent}" opacity="${opacity}"/>`;
  }).join("");

  const label = Math.round(input.width * 0.022);
  const tagLine = input.tags.slice(0, 4).map((tag) => tag.toUpperCase()).join("   ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(brand)} cover</title><desc id="desc">A generated ${escapeXml(brand)} cover; the article's own words are not repeated here.</desc><rect width="100%" height="100%" fill="#101116"/><rect x="${unit * 1.2}" y="${unit * 1.2}" width="${input.width - unit * 2.4}" height="${input.height - unit * 2.4}" rx="${unit * 0.7}" fill="#181a20" stroke="${accent}" stroke-width="${Math.max(2, unit * 0.09).toFixed(1)}"/>${columns}<text x="${unit * 2}" y="${unit * 4}" fill="${accent}" font-family="Arial, sans-serif" font-size="${label}" font-weight="700" letter-spacing="${(label * 0.16).toFixed(1)}">${escapeXml(brand)}</text><text x="${unit * 2}" y="${unit * 6}" fill="#f7f4ec" font-family="monospace" font-size="${Math.round(label * 1.05)}">${escapeXml(input.date)}</text>${tagLine ? `<text x="${unit * 2}" y="${unit * 7.7}" fill="#9da1aa" font-family="monospace" font-size="${Math.round(label * 0.82)}" letter-spacing="${(label * 0.1).toFixed(1)}">${escapeXml(tagLine)}</text>` : ""}<text x="${input.width - unit * 2}" y="${input.height - unit * 1.9}" text-anchor="end" fill="#6c7079" font-family="monospace" font-size="${Math.round(label * 0.72)}">FRAME · ${escapeXml(input.fingerprint)}</text></svg>`;
}

export function deterministicArticleImage(input: {
  venture: "caught-up" | "mma-files";
  slug: string;
  title: string;
  /** Publication date and subject tags, the only words the cover carries. */
  date?: string;
  tags?: readonly string[];
}): ArticleImage {
  const safeSlug = input.slug.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-|-$/gu, "");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([input.venture, safeSlug, input.title]))
    .digest("hex")
    .slice(0, 16);
  const directory = input.venture === "caught-up" ? "editions" : "articles";
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const tags = input.tags ?? [];
  const hero = frameSvg({ width: 1_600, height: 900, venture: input.venture, fingerprint, date, tags });
  const thumb = frameSvg({ width: 640, height: 360, venture: input.venture, fingerprint, date, tags });
  // The alt describes the cover that was drawn, not the illustration the writer imagined.
  // The writer produces illustration_alt before anything is attached, so the 3 August edition
  // shipped this plate under "A chessboard with pieces casting shadows shaped like daggers" —
  // a screen-reader user was told about a chessboard that is not there. A caller's alt is
  // right for a photograph and wrong for this, so this one supplies its own.
  const subject = tags.slice(0, 3).join(", ");
  const altEn = `${brandName(input.venture)} cover for ${date}${subject ? `, marked ${subject}` : ""}. A generated panel of coloured bars, carrying no photograph.`;
  const altCs = `Obálka ${brandName(input.venture)} k ${date}${subject ? `, témata ${subject}` : ""}. Generovaný panel barevných sloupců, bez fotografie.`;
  return ArticleImageSchema.parse({
    hero_path: `public/images/${directory}/${safeSlug}/hero.svg`,
    thumb_path: `public/images/${directory}/${safeSlug}/thumb.svg`,
    width: 1_600,
    height: 900,
    alt_en: altEn,
    alt_cs: altCs,
    license: {
      name: "BoardlessAI deterministic",
      author: "BoardlessAI FRAME",
      source_url: "https://boardless-ai.vercel.app/",
      attribution_html: "Artwork by BoardlessAI FRAME"
    },
    origin: "svg",
    hero_bytes_base64: Buffer.from(hero).toString("base64"),
    thumb_bytes_base64: Buffer.from(thumb).toString("base64")
  });
}
