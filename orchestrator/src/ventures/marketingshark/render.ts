import {
  CAROUSEL_BRANDS,
  liveTemplateByReference,
  liveTemplates,
  renderCarouselSlideSvg,
  type BrandTokens,
  type CarouselFormat,
  type CarouselTemplate
} from "@boardlessai/carousel-studio";
import type { NormalizedQuestion } from "./bank.js";
import type { Brand } from "./config.js";
import { SLIDE_ROLES, type CarouselCopy, type SlideRole } from "./package.js";

/** Instagram's portrait canvas: the format a five-slide carousel is actually read in. */
export const MARKETINGSHARK_FORMAT: CarouselFormat = "instagram-portrait";

export interface RenderedRoleSlide {
  role: SlideRole;
  locale: "cs" | "en";
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

/** The answer options as the reader sees them, lettered, in the carousel's own language. */
export function letteredOptions(question: NormalizedQuestion, locale: "cs" | "en"): string {
  const options = locale === "cs" && question.cs?.options ? question.cs.options : question.en.options;
  return options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join("\n");
}

/**
 * Split the context slide's body into the code that must stay monospaced and the rest.
 *
 * CHUM is asked to put the question's code on the context slide byte for byte, and it may also
 * restate the options there. The code slot is monospaced and the options slot is not, so the two
 * are separated deterministically rather than by asking the model for two fields: a line that
 * opens with a bare answer letter is an option, everything else is code.
 */
export function splitContextBody(body: string): { code: string; options: string } {
  const lines = body.split("\n");
  const optionLines = lines.filter((line) => /^\s*[A-D][.):]\s/u.test(line));
  const codeLines = lines.filter((line) => !/^\s*[A-D][.):]\s/u.test(line));
  return {
    code: codeLines.join("\n").replace(/^\n+|\n+$/gu, ""),
    options: optionLines.join("\n").trim()
  };
}

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
  const { headline, body } = input;
  switch (input.template.id) {
    case "minimal-text-poster":
      return {
        "poster-line": headline,
        "poster-note": input.role === "footer"
          ? input.brand.productUrl.replace(/^https:\/\//u, "")
          : body || input.brand.displayName
      };
    case "quiz-code-context": {
      const { code, options } = splitContextBody(body);
      return {
        "question-line": headline,
        "code-block": code,
        options: options || letteredOptions(input.question, input.locale)
      };
    }
    case "stat-highlight":
      return { stat: headline, "stat-label": body, source: input.brand.displayName };
    case "quote-card":
      return { quote: body || headline, attribution: body ? headline : input.brand.displayName };
    default:
      throw new Error(`No slot mapping for template ${input.template.id}`);
  }
}

/**
 * Which slide variant a role uses, where its template offers one.
 *
 * The hook and the footer share minimal-text-poster, so without this the deck would open and
 * close on the same background and read as a duplicated slide.
 */
export function variantForRole(role: SlideRole, template: CarouselTemplate): string | undefined {
  const available = template.slides[0]?.variants ?? [];
  if (available.length === 0) return undefined;
  return role === "footer" ? available.at(-1)?.id : available[0]?.id;
}

/**
 * Every required slot the mapping did not fill, filled with an empty string.
 *
 * The renderer throws on a missing slot, and an empty slot is a legitimate slide -- an answer
 * reveal with no sub-label, a code slide whose question carries no code. Undefined is the
 * failure; empty is a design choice.
 */
function completeSlots(template: CarouselTemplate, slots: Record<string, string>): Record<string, string> {
  const complete: Record<string, string> = {};
  for (const slot of template.requiredSlots) complete[slot] = slots[slot] ?? "";
  return complete;
}

/**
 * Render one language's five slides, or throw.
 *
 * $0: this is the studio's pure pipeline -- template plus payload plus brand tokens to SVG with a
 * stable hash. The truth gates run before this, so a render is never spent on copy that was never
 * going to ship.
 */
export function renderCarousel(input: {
  brand: Brand;
  locale: "cs" | "en";
  copy: CarouselCopy;
  question: NormalizedQuestion;
  format?: CarouselFormat;
}): RenderedRoleSlide[] {
  const tokens = brandTokensFor(input.brand);
  const format = input.format ?? MARKETINGSHARK_FORMAT;

  return input.copy.slides.map((slide, index) => {
    const role = SLIDE_ROLES[index]!;
    const templateId = input.brand.templateMap[role];
    const template = liveTemplateByReference(templateId, liveVersionOf(templateId));
    const variant = variantForRole(role, template);
    const rendered = renderCarouselSlideSvg({
      template,
      brand: tokens,
      format,
      index: 0,
      payload: {
        locale: input.locale,
        strings: completeSlots(template, slotsForRole({
          role,
          template,
          headline: slide.headline,
          body: slide.body ?? "",
          brand: input.brand,
          question: input.question,
          locale: input.locale
        })),
        ...(variant ? { variant } : {})
      }
    });
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

/** The engine identity recorded in every package, so a render can be traced to its code. */
export function engineVersion(): string {
  return `carousel-studio/${liveTemplates().length}-live`;
}
