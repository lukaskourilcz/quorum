import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  CAROUSEL_BRANDS,
  QUIZ_CODE_OWNED_SLOTS,
  QUIZ_FRAME_JPEG_QUALITY,
  carouselCanvas,
  completeQuizSlots,
  letteredQuizOptions,
  liveTemplateByReference,
  liveTemplates,
  quizFrameJpeg,
  quizSlideRenderInput,
  quizSlideSlots,
  quizSlideVariant,
  quizSlotBudget,
  quizSlotField,
  renderCarouselSlidePng,
  renderCarouselSlideSvg,
  type BrandTokens,
  type CarouselFormat,
  type CarouselRenderInput,
  type CarouselTemplate,
  type QuizDeckFacts
} from "@boardlessai/carousel-studio";
import { fencedBlocks, type NormalizedQuestion } from "./bank.js";
import { brandLocales, type Brand, type MarketingSharkLocale } from "./config.js";
import { SLIDE_ROLES, type CarouselCopy, type SlideRole } from "./package.js";

/** Instagram's portrait canvas: the format a five-slide carousel is actually read in. */
export const MARKETINGSHARK_FORMAT: CarouselFormat = "instagram-portrait";

export interface RenderedRoleSlide {
  role: SlideRole;
  locale: MarketingSharkLocale;
  templateId: string;
  version: string;
  slideId: string;
  svg: string;
  svgHash: string;
  truncatedSlots: string[];
}

export function brandTokensFor(brand: Brand): BrandTokens {
  const tokens = CAROUSEL_BRANDS[brand.id];
  if (!tokens) throw new Error(`Carousel Studio has no brand tokens for ${brand.id}`);
  return tokens;
}

export function liveVersionOf(templateId: string): string {
  const template = liveTemplates().find((candidate) => candidate.id === templateId && candidate.status === "live");
  if (!template) throw new Error(`${templateId} is not a live Carousel Studio template`);
  return template.version;
}

/** The correct option's letter, A for the first option. */
export function correctLetter(question: NormalizedQuestion): string {
  return String.fromCharCode(65 + question.correctIndex);
}

/** The question's options in the carousel's own language, unlettered. */
function optionsIn(question: NormalizedQuestion, locale: "cs" | "en"): string[] {
  return locale === "cs" && question.cs?.options ? question.cs.options : question.en.options;
}

/** The answer options as the reader sees them, lettered, in the carousel's own language. */
export function letteredOptions(question: NormalizedQuestion, locale: "cs" | "en"): string {
  return letteredQuizOptions(optionsIn(question, locale));
}

/**
 * What code puts on the slides, read from the brand and the question bank.
 *
 * The package's render summary records these beside the slides, so the Design Lab can render the
 * same deck again (quorum#575) without the bank, which it cannot reach.
 */
export function quizFacts(brand: Brand, question: NormalizedQuestion, locale: "cs" | "en"): QuizDeckFacts {
  return {
    displayName: brand.displayName,
    productUrl: brand.productUrl,
    correctLetter: correctLetter(question),
    options: optionsIn(question, locale),
    codeBlocks: fencedBlocks(`${question.en.introduction ?? ""}\n${question.en.question}`)
  };
}

// The slot mapping moved into the render package so the Design Lab renders a package through the
// same code (quorum#575). The names stay importable from here, where the room and its tests use them.
export { splitContextBody, stripAnswerLetter } from "@boardlessai/carousel-studio";

/**
 * Map one slide's copy onto the slots its host template requires.
 *
 * Each of the five roles renders from its own single-slide template rather than from one
 * five-slide layout, so a role can use the layout that suits it -- a poster for the hook, a stat
 * for the answer reveal, a quote for the explanation -- and the context slide can use the only
 * template that carries monospaced code.
 *
 * The context slide's options come from the question bank rather than from the model when the
 * model did not restate them. They are facts, and a fact code already holds is not something to
 * pay for or to re-verify.
 */
export function slotsForRole(input: {
  role: SlideRole;
  template: CarouselTemplate;
  headline: string;
  body: string;
  brand: Brand;
  question: NormalizedQuestion;
  locale: "cs" | "en";
}): Record<string, string> {
  return quizSlideSlots({ ...input, facts: quizFacts(input.brand, input.question, input.locale) });
}

/**
 * Which slide variant a role uses, where its template offers one.
 *
 * The hook and the footer share minimal-text-poster, so without this the deck would open and
 * close on the same background and read as a duplicated slide.
 */
export function variantForRole(role: SlideRole, template: CarouselTemplate): string | undefined {
  return quizSlideVariant(role, template);
}

/** The template a role renders in: the brand's map, with the plain-question layout for devShark. */
export function templateIdFor(role: SlideRole, brand: Brand, question: NormalizedQuestion): string {
  return role === "context" && brand.id === "devshark" && !question.hasCode && question.en.options.length <= 4
    ? "quiz-question-context"
    : brand.templateMap[role];
}

/**
 * How much text one slot of a live template holds, read from the template itself.
 *
 * The packet and the fit gate quote these numbers, so a template change moves the limit the
 * writer is given instead of leaving a stale constant that the canvas no longer honours.
 */
export function slotBudget(templateId: string, slot: string): { maxChars: number; maxLines: number } {
  return quizSlotBudget(liveTemplateByReference(templateId, liveVersionOf(templateId)), slot);
}

/**
 * Whether the question's own code and options fit the context slide in both languages.
 *
 * Those slots are filled by code from the bank, so a question whose options overflow them fails
 * at render whatever the writer does, and a retry only spends the envelope twice. Measured on
 * the 2,511-question snapshot of 7 September 2026: about one question in twenty-five has an
 * option too long for its slot. Such a question is not selected; it costs nothing to skip.
 */
export function codeOwnedSlotsFit(brand: Brand, question: NormalizedQuestion): boolean {
  const templateId = templateIdFor("context", brand, question);
  // Pure in the brand, the question and the template, so one process answers each question once.
  const key = `${brand.id}\u0000${brandLocales(brand).join(",")}\u0000${templateId}\u0000${question.id}\u0000${question.en.options.join("\u0001")}\u0000${question.cs?.options?.join("\u0001") ?? ""}`;
  const known = codeOwnedFit.get(key);
  if (known !== undefined) return known;
  const fits = codeOwnedSlotsFitUncached(brand, question, templateId);
  codeOwnedFit.set(key, fits);
  return fits;
}

const codeOwnedFit = new Map<string, boolean>();

function codeOwnedSlotsFitUncached(brand: Brand, question: NormalizedQuestion, templateId: string): boolean {
  const template = liveTemplateByReference(templateId, liveVersionOf(templateId));
  const code = quizFacts(brand, question, "en").codeBlocks.join("\n\n");
  // Only the languages the brand writes: an overflowing Czech option is no reason to skip a
  // question for a brand that never renders Czech.
  for (const locale of brandLocales(brand)) {
    const rendered = renderCarouselSlideSvg({
      template,
      brand: brandTokensFor(brand),
      format: MARKETINGSHARK_FORMAT,
      index: 0,
      payload: {
        locale,
        strings: completeQuizSlots(template, slotsForRole({ role: "context", template, headline: "", body: code, brand, question, locale }))
      }
    });
    if (!rendered || rendered.truncatedSlots.some((slot) => QUIZ_CODE_OWNED_SLOTS.has(slot))) return false;
  }
  return true;
}

/**
 * The per-slide text limits the writer is given, in words it can act on.
 *
 * Only the slots the model fills are listed, and each number is the template's own. A role whose
 * template is not one of these gets no line rather than a guessed one; the fit gate still holds it.
 */
export function writerLimits(brand: Brand, question: NormalizedQuestion): string[] {
  const lines: string[] = [];
  const context = templateIdFor("context", brand, question);
  if (context === "quiz-code-context" || context === "quiz-question-context") {
    lines.push(`context headline (the question line) ≤ ${slotBudget(context, "question-line").maxChars} characters`);
  }
  if (context === "quiz-code-context") {
    // The one context slot the writer can fill: options restated in the body as "A. …" lines
    // replace the bank's. Without a number here the writer learned the limit only from a retry.
    const options = slotBudget(context, "options");
    lines.push(
      `context body is the question's code byte for byte; options restated as "A. …" lines after it ≤ ${options.maxChars} characters on ${options.maxLines} lines together, or leave them out and code prints the question's own`
    );
  }
  if (templateIdFor("reveal", brand, question) === "stat-highlight") {
    lines.push(
      `reveal headline is the correct letter alone ("${correctLetter(question)}"); code prints it large`,
      `reveal body is the answer in plain words, without the letter, ≤ ${slotBudget("stat-highlight", "stat-label").maxChars} characters`
    );
  }
  if (templateIdFor("why", brand, question) === "quote-card") {
    lines.push(
      `why body is the explanation, ≤ ${slotBudget("quote-card", "quote").maxChars} characters`,
      `why headline is a short label under it, ≤ ${slotBudget("quote-card", "attribution").maxChars} characters`
    );
  }
  return lines;
}

export interface FitViolation {
  role: SlideRole;
  locale: "cs" | "en";
  templateId: string;
  slot: string;
  field: "headline" | "body" | "code";
  maxChars: number;
  maxLines: number;
}

/**
 * Every slot the canvas would have to clip, found before anything is committed.
 *
 * Rendering is the studio's pure pipeline and costs nothing, so the check that used to run after
 * the retry budget was spent now runs beside the truth gates, where a violation can still go back
 * to the writer with the exact limit. The post-render check stays as the last word.
 */
export function fitViolations(input: {
  brand: Brand;
  question: NormalizedQuestion;
  copy: Partial<Record<MarketingSharkLocale, CarouselCopy>>;
}): FitViolation[] {
  const violations: FitViolation[] = [];
  for (const locale of brandLocales(input.brand)) {
    const localeCopy = input.copy[locale];
    if (!localeCopy) continue;
    const rendered = renderCarousel({ brand: input.brand, locale, copy: localeCopy, question: input.question });
    for (const slide of rendered) {
      const copy = localeCopy.slides[SLIDE_ROLES.indexOf(slide.role)];
      for (const slot of slide.truncatedSlots) {
        violations.push({
          role: slide.role,
          locale,
          templateId: slide.templateId,
          slot,
          field: quizSlotField(slide.templateId, slot, Boolean(copy?.body?.trim())),
          ...slotBudget(slide.templateId, slot)
        });
      }
    }
  }
  return violations;
}

/**
 * Render one language's five slides, or throw.
 *
 * $0: this is the studio's pure pipeline -- template plus payload plus brand tokens to SVG with a
 * stable hash. The truth gates run before this, so a render is never spent on copy that was never
 * going to ship.
 */
/**
 * What the studio is handed for each of the five slides: the role's template and its filled slots.
 *
 * One function builds it for the SVG render and for the PNG frames, so a frame is the slide that
 * passed the clip check and not a second rendering of the same copy that might differ from it.
 */
function slideInputs(input: {
  brand: Brand;
  locale: MarketingSharkLocale;
  copy: CarouselCopy;
  question: NormalizedQuestion;
  format?: CarouselFormat;
}): Array<{ role: SlideRole; templateId: string; template: CarouselTemplate; render: CarouselRenderInput & { index: number } }> {
  const tokens = brandTokensFor(input.brand);
  const format = input.format ?? MARKETINGSHARK_FORMAT;
  const facts = quizFacts(input.brand, input.question, input.locale);
  return input.copy.slides.map((slide, index) => {
    const role = SLIDE_ROLES[index]!;
    const templateId = templateIdFor(role, input.brand, input.question);
    const template = liveTemplateByReference(templateId, liveVersionOf(templateId));
    return {
      role,
      templateId,
      template,
      render: quizSlideRenderInput({ role, template, headline: slide.headline, body: slide.body ?? "", facts, locale: input.locale, brand: tokens, format })
    };
  });
}

export function renderCarousel(input: {
  brand: Brand;
  locale: MarketingSharkLocale;
  copy: CarouselCopy;
  question: NormalizedQuestion;
  format?: CarouselFormat;
}): RenderedRoleSlide[] {
  return slideInputs(input).map(({ role, templateId, template, render }) => {
    const rendered = renderCarouselSlideSvg(render);
    if (!rendered) throw new Error(`${templateId} produced no slide for role ${role}`);
    return {
      role,
      locale: input.locale,
      templateId,
      version: template.version,
      slideId: rendered.slideId,
      svg: rendered.svg,
      svgHash: rendered.svgHash,
      truncatedSlots: rendered.truncatedSlots
    };
  });
}

/** The quality the Instagram copies are encoded at. Instagram accepts JPEG only. */
export const FRAME_JPEG_QUALITY = QUIZ_FRAME_JPEG_QUALITY;

export interface FrameFile {
  /** The path a channel fetches it at, under the site's public root: `/social/<brand>/<date>/<locale>/slide-01.png`. */
  path: string;
  sha256: string;
  bytes: number;
}

export interface RenderedFrame {
  locale: MarketingSharkLocale;
  role: SlideRole;
  /** 1 to 5, the slide's position in the carousel. */
  slide: number;
  svgHash: string;
  width: number;
  height: number;
  png: FrameFile;
  jpeg: FrameFile;
}

/** Where a slide's frames live, relative to the site's public root. */
export function framePublicPath(input: { brandId: string; date: string; locale: MarketingSharkLocale; slide: number; extension: "png" | "jpg" }): string {
  return `/social/${input.brandId}/${input.date}/${input.locale}/slide-${String(input.slide).padStart(2, "0")}.${input.extension}`;
}

const sha256Of = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/**
 * One language's five slides as PNG frames and their JPEG copies, with the bytes to write.
 *
 * $0, and deterministic: the studio rasterises with the repository's own fonts and no system ones,
 * and the JPEG is encoded from those bytes at a fixed quality. Each frame is checked against the SVG
 * slide that passed the clip gate by its SVG hash, and against the canvas size, before it is
 * returned. A frame that differs from the reviewed slide is an error, never a quiet substitute.
 */
export async function rasteriseCarousel(input: {
  brand: Brand;
  locale: MarketingSharkLocale;
  copy: CarouselCopy;
  question: NormalizedQuestion;
  date: string;
  /** The SVG slides the gates passed, which the frames must reproduce. */
  reviewed: readonly RenderedRoleSlide[];
}): Promise<Array<RenderedFrame & { pngBytes: Buffer; jpegBytes: Buffer }>> {
  const background = brandTokensFor(input.brand).colors.background ?? "#000000";
  const frames: Array<RenderedFrame & { pngBytes: Buffer; jpegBytes: Buffer }> = [];
  for (const [index, entry] of slideInputs(input).entries()) {
    const rendered = await renderCarouselSlidePng(entry.render);
    if (!rendered) throw new Error(`${entry.templateId} produced no frame for role ${entry.role}`);
    const reviewed = input.reviewed[index];
    if (!reviewed || reviewed.svgHash !== rendered.svgHash) {
      throw new Error(`${input.locale}/${entry.role}: the frame does not reproduce the slide the gates passed`);
    }
    if (rendered.truncatedSlots.length > 0) {
      throw new Error(`${input.locale}/${entry.role}: the frame clipped ${rendered.truncatedSlots.join(", ")}`);
    }
    const expected = entry.template.formats[carouselCanvas(entry.render.format)];
    const jpegBytes = await quizFrameJpeg(rendered.png, background);
    const [pngMeta, jpegMeta] = await Promise.all([sharp(rendered.png).metadata(), sharp(jpegBytes).metadata()]);
    for (const [name, meta] of [["png", pngMeta], ["jpeg", jpegMeta]] as const) {
      if (meta.width !== expected.width || meta.height !== expected.height) {
        throw new Error(`${input.locale}/${entry.role}: the ${name} frame is ${meta.width}x${meta.height}, the canvas is ${expected.width}x${expected.height}`);
      }
    }
    if (jpegMeta.format !== "jpeg" || jpegMeta.space !== "srgb") {
      throw new Error(`${input.locale}/${entry.role}: the Instagram copy is not an sRGB JPEG`);
    }
    const slide = index + 1;
    frames.push({
      locale: input.locale,
      role: entry.role,
      slide,
      svgHash: rendered.svgHash,
      width: expected.width,
      height: expected.height,
      png: {
        path: framePublicPath({ brandId: input.brand.id, date: input.date, locale: input.locale, slide, extension: "png" }),
        sha256: rendered.pngHash,
        bytes: rendered.png.length
      },
      jpeg: {
        path: framePublicPath({ brandId: input.brand.id, date: input.date, locale: input.locale, slide, extension: "jpg" }),
        sha256: sha256Of(jpegBytes),
        bytes: jpegBytes.length
      },
      pngBytes: rendered.png,
      jpegBytes
    });
  }
  return frames;
}

/** The engine identity recorded in every package, so a render can be traced to its code. */
export function engineVersion(): string {
  return `carousel-studio/${liveTemplates().length}-live`;
}
