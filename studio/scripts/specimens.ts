import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAROUSEL_BRANDS,
  DECK_FAMILIES,
  FAMILY_SERVES,
  articleSlideSlot,
  familyDeckTemplate,
  previewFormats,
  renderCarouselSvg,
  validateTemplateForBrand,
  type BrandTokens,
  type CarouselFormat,
  type CarouselPayload,
  type DeckFamily
} from "../src/index.js";

/**
 * One specimen page per family, rendered by the engine rather than described.
 *
 * The founding delivery's pages were built from the JSON in `SPEC.md` through a *port* of the
 * renderer, and said so in their own text: "if this page and the spec ever disagree, this page is
 * the one that is wrong." A port drifts — `figure` already composes something its spec entry does
 * not describe — so the reviewer's copy was the one document in the folder nobody could trust.
 * These pages inline the SVG `renderCarouselSvg` actually produces, so a specimen cannot disagree
 * with the engine: it is the engine's output.
 *
 * Self-contained by construction. The SVG names font families and nothing loads them, so the page
 * renders in whatever the browser has — the composition is what a reviewer is judging here, and
 * the faces are named in `TOKENS.md`. No network request, no embedded bytes, no build step.
 *
 * Deterministic: fixed payloads, fixed brands, fixed order. Re-running it on an unchanged library
 * rewrites the same bytes.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(here, "..", "..", "docs", "design-lab", "families");

const SLIDE_COUNT = 7;

/** Three passage lengths, so a page shows the fitter stepping down rather than one lucky string. */
const PASSAGES = [
  "Gamrot vyhrál, a lehká váha se tím posunula.",
  "Gamrot zvládl tři kola na zemi a rozhodčí to viděli jednomyslně pro něj.",
  "Gamrot zvládl tři kola na zemi, Salkilld nenašel odpověď na jeho tempo, a rozhodčí to nakonec viděli jednomyslně pro Poláka.",
  "Salkilld šel do klinče a tam ztratil pozici, kterou celý zápas hájil.",
  "Divize se srovnala kolem jednoho jména, a to jméno teď čeká na titulovou šanci.",
  "Tempo bylo to jediné, co oba muže odlišovalo.",
  "Co z toho plyne pro příští kartu: jeden zápas, který si diváci vyžádali."
] as const;

function payload(variant?: string): CarouselPayload {
  return {
    locale: "cs",
    strings: Object.fromEntries(Array.from({ length: SLIDE_COUNT }, (_, index) =>
      [articleSlideSlot(index), PASSAGES[index % PASSAGES.length]!])),
    ...(variant ? { variant } : {})
  };
}

interface Canvas {
  caption: string;
  svg: string;
  width: number;
  height: number;
  /** Story chrome bands, drawn over the canvas so a reviewer can see what the platform eats. */
  bands?: boolean;
}

function slidesOf(
  family: DeckFamily,
  format: CarouselFormat,
  brand: BrandTokens,
  wanted: readonly number[],
  options: { variant?: string; typeScale?: number; phaseSeed?: number } = {}
): Canvas[] {
  const template = familyDeckTemplate(family, SLIDE_COUNT, {
    ...(options.typeScale === undefined ? {} : { typeScale: options.typeScale }),
    ...(options.phaseSeed === undefined ? {} : { phaseSeed: options.phaseSeed })
  });
  const canvas = template.formats[format];
  const rendered = renderCarouselSvg({ template, payload: payload(options.variant), brand, format });
  return wanted.map((index) => ({
    caption: index === 0 ? "cover" : index === SLIDE_COUNT - 1 ? "outro" : `body ${index}`,
    svg: rendered[index]!.svg,
    width: canvas.width,
    height: canvas.height,
    ...(format === "instagram-story" ? { bands: true } : {})
  }));
}

/** The fitted sizes the engine chose, read back out of its own output. */
function typeSizes(family: DeckFamily, format: CarouselFormat, brand: BrandTokens): Array<[string, string]> {
  const template = familyDeckTemplate(family, SLIDE_COUNT);
  const rendered = renderCarouselSvg({ template, payload: payload(), brand, format });
  return rendered.map((slide, index) => {
    const sizes = [...slide.svg.matchAll(/font-size="([\d.]+)"/gu)].map((match) => Number(match[1]));
    const role = index === 0 ? "cover" : index === SLIDE_COUNT - 1 ? "outro" : `body ${index}`;
    const passage = PASSAGES[index % PASSAGES.length]!;
    return [`${role} · ${passage.length} chars`, sizes.length ? `${Math.max(...sizes)} px` : "—"] as [string, string];
  });
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** A canvas at a readable size on the page, at its true aspect ratio. */
function figure(canvas: Canvas, tall: number): string {
  const width = Math.round(tall * (canvas.width / canvas.height));
  const bands = canvas.bands
    ? `<i class="sb" style="left:0;top:0;width:100%;height:14%"></i><i class="sb" style="left:0;bottom:0;width:100%;height:16%"></i>`
    : "";
  return `<figure class="cv"><i class="fr" style="width:${width}px;height:${tall}px">`
    + canvas.svg.replace("<svg ", `<svg style="width:${width}px;height:${tall}px;display:block" `)
    + `${bands}</i><figcaption>${escapeHtml(canvas.caption)}</figcaption></figure>`;
}

function row(canvases: readonly Canvas[], tall: number): string {
  return `<div class="row">${canvases.map((canvas) => figure(canvas, tall)).join("")}</div>`;
}

const FORMAT_LABELS: Readonly<Record<CarouselFormat, string>> = {
  "instagram-portrait": "4:5 · 1080×1350",
  "instagram-square": "1:1 · 1080×1080",
  "instagram-story": "9:16 · 1080×1920 · platform chrome drawn",
  threads: "Threads · 1200×1200"
};

const STYLE = `*{box-sizing:border-box}
body{margin:0;background:#0e0e11;color:#f4f4f5;font:400 14px/1.55 'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1200px;margin:0 auto;padding:44px 28px 96px}
h1{margin:0;font-size:34px;font-weight:700;letter-spacing:-.03em}
h2{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-.01em}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#94949c;margin:0}
.lede{margin:14px 0 0;max-width:74ch;font-size:15px;line-height:1.62;color:#d4d4d8}
.meta{margin:26px 0 0;display:grid;grid-template-columns:132px 1fr;gap:9px 18px;border-top:1px solid #26262b;padding-top:18px;font-size:13px;color:#d4d4d8;max-width:96ch}
.meta dt{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#94949c;padding-top:3px}
.meta dd{margin:0}
section.fmt{margin-top:44px;border-top:1px solid #26262b;padding-top:20px}
.row{display:flex;flex-wrap:wrap;gap:20px;margin-top:12px}
.cv{margin:0;display:flex;flex-direction:column;gap:7px}
.fr{position:relative;display:block;overflow:hidden;border-radius:5px}
figcaption{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:#94949c}
.sb{position:absolute;background:rgba(255,64,64,.16);outline:1px solid rgba(255,64,64,.42);outline-offset:-1px;display:block}
table{border-collapse:collapse;margin-top:14px;font-size:12px;width:100%}
th,td{text-align:left;padding:6px 12px 6px 0;border-bottom:1px solid #1e1e22;vertical-align:top}
th{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:#94949c;font-weight:400}
td.n{font-family:ui-monospace,Menlo,monospace;color:#d4d4d8}
.note{margin-top:10px;max-width:80ch;font-size:12.5px;line-height:1.6;color:#94949c;border-left:2px solid #2e2e34;padding-left:12px}
code{font-family:ui-monospace,Menlo,monospace;font-size:.92em;color:#d4d4d8}
a{color:#d4d4d8}a:hover{color:#f4f4f5}`;

function page(family: DeckFamily): string {
  const position = DECK_FAMILIES.indexOf(family) + 1;
  const template = familyDeckTemplate(family, SLIDE_COUNT);
  const brands = Object.values(CAROUSEL_BRANDS);
  const mma = CAROUSEL_BRANDS["mma-files"];
  const beats = [0, 1, 2, SLIDE_COUNT - 1];

  const formats = previewFormats(template).map((format) =>
    `<section class="fmt"><h2>${escapeHtml(FORMAT_LABELS[format])}</h2>`
    + `<p class="mono">MMA Files · variant A · type scale 1 · phase 0</p>`
    + row(slidesOf(family, format, mma, beats), format === "instagram-story" ? 340 : 250)
    + `</section>`
  ).join("");

  const palettes = `<section class="fmt"><h2>${brands.length} palettes, one composition</h2>`
    + `<p class="mono">4:5 · body beat 1 · every brand the engine serves</p>`
    + `<div class="row">${brands.map((brand) =>
      figure({ ...slidesOf(family, "instagram-portrait", brand, [1])[0]!, caption: brand.id }, 220)).join("")}</div>`
    + `</section>`;

  const axes = `<section class="fmt"><h2>The recipe axes, acting</h2>`
    + `<p class="mono">4:5 · MMA Files · the same slide under each control the owner has</p>`
    + `<div class="row">`
    + figure({ ...slidesOf(family, "instagram-portrait", mma, [1], { variant: "A" })[0]!, caption: "variant A" }, 220)
    + figure({ ...slidesOf(family, "instagram-portrait", mma, [1], { variant: "B" })[0]!, caption: "variant B" }, 220)
    + figure({ ...slidesOf(family, "instagram-portrait", mma, [1], { typeScale: 0.9 })[0]!, caption: "type 0.9×" }, 220)
    + figure({ ...slidesOf(family, "instagram-portrait", mma, [1], { typeScale: 1.1 })[0]!, caption: "type 1.1×" }, 220)
    + `</div><div class="row">`
    + [0, 1, 2, 3].map((phaseSeed) =>
      figure({ ...slidesOf(family, "instagram-portrait", mma, [1], { phaseSeed })[0]!, caption: `phase ${phaseSeed}` }, 220)).join("")
    + `</div></section>`;

  const checkRows = brands.flatMap((brand) => previewFormats(template).map((format) => {
    const checks = validateTemplateForBrand(template, brand, format);
    const failed = checks.filter((check) => check.status === "fail");
    return `<tr><td class="n">${brand.id}</td><td class="n">${format}</td><td>${
      failed.length ? escapeHtml(failed.map((check) => check.detail).join("; ")) : "all six pass"}</td></tr>`;
  })).join("");

  const sizes = typeSizes(family, "instagram-portrait", mma)
    .map(([role, size]) => `<tr><td>${escapeHtml(role)}</td><td class="n">${escapeHtml(size)}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${family[0]!.toUpperCase()}${family.slice(1)} · Design Lab specimen</title>
<!-- Generated by studio/scripts/specimens.ts from the committed composers. Self-contained: the
     SVG below is the engine's own output, inlined, and nothing on this page loads over the
     network. No webfonts, so the page renders in a system stack — the composition is what you are
     judging; the faces intended at each role are named in ../TOKENS.md. Do not hand-edit: change
     the composer and re-run: pnpm -C studio specimens -->
<style>${STYLE}</style></head>
<body><div class="wrap">
<p class="mono">Design Lab · template family ${String(position).padStart(2, "0")} of ${DECK_FAMILIES.length} · ${family}</p>
<h1>${family[0]!.toUpperCase()}${family.slice(1)}</h1>
<p class="lede">${escapeHtml(template.description)}</p>
<dl class="meta">
<dt>Serves</dt><dd>${FAMILY_SERVES[family]}</dd>
<dt>Template id</dt><dd><code>${template.id}</code> · <code>deck-${family}-5</code> … <code>deck-${family}-10</code></dd>
<dt>Slots</dt><dd><code>${template.requiredSlots.join(" · ")}</code></dd>
<dt>Variant axes</dt><dd>A/B (accent↔secondary and the inverted ground) · photo treatment · type scale 0.9/1/1.1 · phase seed 0–3</dd>
<dt>Canvases</dt><dd>${previewFormats(template).join(" · ")}</dd>
</dl>
<p class="note">Every canvas below is the SVG <code>renderCarouselSvg</code> produced for this
family from the committed composer, at the deck length the splitter most often yields. A family
whose checks fail cannot be rendered at all, so a page existing is itself part of the evidence.</p>
${formats}
${palettes}
${axes}
<section class="fmt"><h2>Checks</h2><p class="mono">${brands.length} brands × every offered canvas</p>
<table><thead><tr><th>Brand</th><th>Canvas</th><th>Verdict</th></tr></thead><tbody>${checkRows}</tbody></table></section>
<section class="fmt"><h2>Measured type</h2><p class="mono">4:5 · MMA Files · the size the fitter actually chose</p>
<table><thead><tr><th>Slide</th><th>Largest set size</th></tr></thead><tbody>${sizes}</tbody></table>
<p class="note">The fitter steps down from each slot's ceiling until the string fits its measure and
line count, so a short passage is set large and a long one is set to read. Nothing on these pages
was written to fill a frame.</p></section>
</div></body></html>
`;
}

const wanted = process.argv.slice(2).filter((argument) => !argument.startsWith("-"));
const families = wanted.length
  ? wanted.filter((name): name is DeckFamily => (DECK_FAMILIES as readonly string[]).includes(name))
  : DECK_FAMILIES;
if (wanted.length && families.length !== wanted.length) {
  throw new Error(`Not a family: ${wanted.filter((name) => !(families as readonly string[]).includes(name)).join(", ")}`);
}

mkdirSync(outputDirectory, { recursive: true });
for (const family of families) {
  writeFileSync(path.join(outputDirectory, `${family}.html`), page(family));
  process.stdout.write(`${family}\n`);
}
