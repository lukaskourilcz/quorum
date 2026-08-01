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

function frameSvg(input: {
  width: number;
  height: number;
  venture: "caught-up" | "mma-files";
  title: string;
  fingerprint: string;
}): string {
  const accent = input.venture === "caught-up" ? "#79f2c0" : "#ef6c35";
  const brand = input.venture === "caught-up" ? "CAUGHT UP" : "MMA FILES";
  const fontSize = Math.round(input.width * 0.057);
  const title = lines(input.title, input.width >= 1_000 ? 32 : 28)
    .map((line, index) => `<text x="7%" y="${42 + index * 11}%" fill="#f7f4ec" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700">${escapeXml(line)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(input.title)}</title><desc id="desc">Deterministic ${brand} article cover.</desc><rect width="100%" height="100%" fill="#101116"/><rect x="4%" y="7%" width="92%" height="86%" rx="24" fill="#181a20" stroke="${accent}" stroke-width="4"/><text x="7%" y="19%" fill="${accent}" font-family="Arial, sans-serif" font-size="${Math.round(fontSize * 0.48)}" font-weight="700">${brand} · FRAME</text>${title}<text x="7%" y="86%" fill="#9da1aa" font-family="monospace" font-size="${Math.round(fontSize * 0.32)}">${input.fingerprint}</text></svg>`;
}

export function deterministicArticleImage(input: {
  venture: "caught-up" | "mma-files";
  slug: string;
  title: string;
  altEn: string;
  altCs: string;
}): ArticleImage {
  const safeSlug = input.slug.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-|-$/gu, "");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([input.venture, safeSlug, input.title]))
    .digest("hex")
    .slice(0, 16);
  const directory = input.venture === "caught-up" ? "editions" : "articles";
  const hero = frameSvg({ width: 1_600, height: 900, venture: input.venture, title: input.title, fingerprint });
  const thumb = frameSvg({ width: 640, height: 360, venture: input.venture, title: input.title, fingerprint });
  return ArticleImageSchema.parse({
    hero_path: `public/images/${directory}/${safeSlug}/hero.svg`,
    thumb_path: `public/images/${directory}/${safeSlug}/thumb.svg`,
    width: 1_600,
    height: 900,
    alt_en: input.altEn,
    alt_cs: input.altCs,
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
