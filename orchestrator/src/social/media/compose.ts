import sharp from "sharp";

const WIDTH = 1080;
const HEIGHT = 1350;
const BACKGROUND = "#09090b";
const SURFACE = "#18181b";
const FOREGROUND = "#f4f4f5";
const MUTED = "#a1a1aa";
const ACCENT = "#ff5a00";
const CAUGHT_UP_ACCENT = "#fe45e2";
export const ARTICLE_HERO_COMPOSER_VERSION = "article-hero-1";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrap(value: string, maxCharacters: number, maxLines: number): string[] {
  const words = value.replaceAll(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  for (const rawWord of words) {
    const word = rawWord.length > maxCharacters ? `${rawWord.slice(0, maxCharacters - 1)}…` : rawWord;
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > maxCharacters) {
      if (lines.length === maxLines) {
        lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/…$/, "").slice(0, maxCharacters - 1)}…`;
        break;
      }
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  return lines;
}

function textLines(input: {
  lines: readonly string[];
  x: number;
  y: number;
  lineHeight: number;
  fontSize: number;
  weight?: number;
  fill: string;
}): string {
  return `<text x="${input.x}" y="${input.y}" fill="${input.fill}" font-family="Arial, Helvetica, sans-serif" font-size="${input.fontSize}" font-weight="${input.weight ?? 400}">${input.lines.map((line, index) => `<tspan x="${input.x}" dy="${index === 0 ? 0 : input.lineHeight}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function shell(content: string, accent = CAUGHT_UP_ACCENT): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>
    <rect x="58" y="58" width="964" height="1234" rx="36" fill="${SURFACE}" stroke="#3f3f46" stroke-width="2"/>
    <circle cx="930" cy="150" r="18" fill="${accent}"/>
    <rect x="110" y="1190" width="760" height="14" rx="7" fill="${ACCENT}"/>
    ${content}
  </svg>`;
}

async function webp(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).webp({ quality: 90, effort: 6 }).toBuffer();
}

export async function composeCarouselFrame(input: {
  date: string;
  eyebrow: string;
  title: string;
  body: string;
  index: number;
  total: number;
}): Promise<Buffer> {
  const title = wrap(input.title, 23, 5);
  const body = wrap(input.body, 40, 7);
  return webp(shell(`
    ${textLines({ lines: ["DNESKAI", input.eyebrow.toUpperCase()], x: 110, y: 150, lineHeight: 42, fontSize: 26, weight: 700, fill: CAUGHT_UP_ACCENT })}
    ${textLines({ lines: title, x: 110, y: 370, lineHeight: 92, fontSize: 78, weight: 700, fill: FOREGROUND })}
    ${textLines({ lines: body, x: 110, y: 900, lineHeight: 54, fontSize: 38, fill: MUTED })}
    ${textLines({ lines: [input.date], x: 110, y: 1250, lineHeight: 0, fontSize: 24, weight: 700, fill: FOREGROUND })}
    ${textLines({ lines: [`${String(input.index).padStart(2, "0")} / ${String(input.total).padStart(2, "0")}`], x: 830, y: 1250, lineHeight: 0, fontSize: 24, weight: 700, fill: FOREGROUND })}
  `));
}

export async function composeQuoteCard(input: {
  date: string;
  agent: string;
  quote: string;
}): Promise<Buffer> {
  return webp(shell(`
    ${textLines({ lines: ["FROM THE EDITION ROOM"], x: 110, y: 160, lineHeight: 0, fontSize: 26, weight: 700, fill: CAUGHT_UP_ACCENT })}
    ${textLines({ lines: ["“", ...wrap(input.quote, 30, 8), "”"], x: 110, y: 355, lineHeight: 78, fontSize: 58, weight: 700, fill: FOREGROUND })}
    ${textLines({ lines: [input.agent, input.date], x: 110, y: 1130, lineHeight: 42, fontSize: 28, weight: 700, fill: MUTED })}
  `, ACCENT));
}

export async function composeArticleHero(input: {
  date: string;
  title: string;
  dek: string;
}): Promise<Buffer> {
  const width = 1200;
  const height = 630;
  const title = wrap(input.title, 28, 4);
  const dek = wrap(input.dek, 62, 3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fe45e2" stop-opacity="0.26"/>
        <stop offset="1" stop-color="#ff5a00" stop-opacity="0.08"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${BACKGROUND}"/>
    <circle cx="1010" cy="80" r="260" fill="url(#glow)"/>
    <path d="M0 515 C250 420 400 610 670 490 S1030 410 1200 470 V630 H0Z" fill="#141419"/>
    <rect x="54" y="54" width="1092" height="522" rx="28" fill="none" stroke="#3f3f46" stroke-width="2"/>
    ${textLines({ lines: ["DNESKAI", input.date], x: 92, y: 112, lineHeight: 34, fontSize: 22, weight: 700, fill: CAUGHT_UP_ACCENT })}
    ${textLines({ lines: title, x: 92, y: 235, lineHeight: 68, fontSize: 58, weight: 700, fill: FOREGROUND })}
    ${textLines({ lines: dek, x: 92, y: 500, lineHeight: 36, fontSize: 25, fill: MUTED })}
    <circle cx="1085" cy="106" r="12" fill="${ACCENT}"/>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 88, effort: 6 }).toBuffer();
}

export async function composeDeterministicSocialCard(input: {
  width?: number;
  height?: number;
  accent?: string;
  background?: string;
  output: string;
}): Promise<void> {
  const width = input.width ?? 1080;
  const height = input.height ?? 1080;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${input.background ?? BACKGROUND}"/><rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.07)}" width="${Math.round(width * 0.86)}" height="${Math.round(height * 0.86)}" rx="${Math.round(width * 0.035)}" fill="${SURFACE}"/><circle cx="${Math.round(width * 0.84)}" cy="${Math.round(height * 0.16)}" r="${Math.round(width * 0.018)}" fill="${input.accent ?? ACCENT}"/></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(input.output);
}
