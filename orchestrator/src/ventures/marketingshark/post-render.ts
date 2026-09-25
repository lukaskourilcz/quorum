import {
  liveTemplateByReference,
  postSlidePlacement,
  postSlideRenderInput,
  postSlotField,
  renderCarouselSlideSvg,
  type CarouselRenderInput,
  type CarouselTemplate,
  type PostDeckFacts
} from "@boardlessai/carousel-studio";
import type { Brand } from "./config.js";
import { clipToWords, POST_KIND_ROLES, type PostDeckKind } from "./kinds.js";
import {
  brandTokensFor,
  engineVersion,
  liveVersionOf,
  MARKETINGSHARK_FORMAT,
  rasteriseSlides,
  slotBudget,
  type RasterisedFrame
} from "./render.js";

/**
 * A post deck's render path: each role's template from the kind's map, filled through the studio's
 * post-deck mapping (quorum#576). $0 and deterministic, like the quiz's.
 */

/** One slide's words, before a template is attached. */
export interface PostSlideWords {
  role: string;
  headline: string;
  body: string;
  alt: string;
}

export interface RenderedPostSlide {
  role: string;
  templateId: string;
  version: string;
  slideId: string;
  svg: string;
  svgHash: string;
  truncatedSlots: string[];
}

/** What code puts on every post deck: the brand's name and link. */
export function postDeckFacts(brand: Pick<Brand, "displayName" | "productUrl">): PostDeckFacts {
  return { displayName: brand.displayName, productUrl: brand.productUrl };
}

/** The template a kind's role renders in, from the brand's config. */
export function postTemplateId(brand: Brand, kind: PostDeckKind, role: string): string {
  const settings = brand.postKinds[kind];
  const templateId = settings ? (settings.templateMap as Record<string, string>)[role] : undefined;
  if (!templateId) throw new Error(`${brand.id} has no ${kind} template for the ${role} slide`);
  return templateId;
}

function entriesFor(brand: Brand, kind: PostDeckKind, slides: readonly PostSlideWords[]): Array<{
  role: string;
  templateId: string;
  template: CarouselTemplate;
  render: CarouselRenderInput & { index: number };
}> {
  const roles = POST_KIND_ROLES[kind] as readonly string[];
  if (slides.map((slide) => slide.role).join(",") !== roles.join(",")) {
    throw new Error(`a ${kind} renders the slides ${roles.join(", ")} in that order`);
  }
  return slides.map((slide, index) => {
    const templateId = postTemplateId(brand, kind, slide.role);
    const template = liveTemplateByReference(templateId, liveVersionOf(templateId));
    return {
      role: slide.role,
      templateId,
      template,
      render: postSlideRenderInput({
        template,
        headline: slide.headline,
        body: slide.body,
        placement: postSlidePlacement(index, slides.length),
        facts: postDeckFacts(brand),
        locale: "en",
        brand: brandTokensFor(brand),
        format: MARKETINGSHARK_FORMAT
      })
    };
  });
}

/** Render the five slides to SVG, or throw when a template gives nothing back. */
export function renderPostDeck(input: { brand: Brand; kind: PostDeckKind; slides: readonly PostSlideWords[] }): RenderedPostSlide[] {
  return entriesFor(input.brand, input.kind, input.slides).map(({ role, templateId, template, render }) => {
    const rendered = renderCarouselSlideSvg(render);
    if (!rendered) throw new Error(`${templateId} produced no slide for role ${role}`);
    return { role, templateId, version: template.version, slideId: rendered.slideId, svg: rendered.svg, svgHash: rendered.svgHash, truncatedSlots: rendered.truncatedSlots };
  });
}

/** The PNG frames and JPEG copies of the slides the gates passed, proved against their SVG hashes. */
export async function rasterisePostDeck(input: {
  brand: Brand;
  kind: PostDeckKind;
  slides: readonly PostSlideWords[];
  date: string;
  reviewed: readonly RenderedPostSlide[];
}): Promise<RasterisedFrame[]> {
  return rasteriseSlides({ brand: input.brand, locale: "en", date: input.date, entries: entriesFor(input.brand, input.kind, input.slides), reviewed: input.reviewed });
}

export interface PostFitViolation {
  role: string;
  slot: string;
  field: "headline" | "body";
  templateId: string;
  maxChars: number;
  maxLines: number;
}

/** Every slot a deck would clip, with the field that fills it and the slot's budget. */
export function postFitViolations(input: { brand: Brand; kind: PostDeckKind; slides: readonly PostSlideWords[] }): PostFitViolation[] {
  const rendered = renderPostDeck(input);
  return rendered.flatMap((slide, index) => slide.truncatedSlots.map((slot) => ({
    role: slide.role,
    slot,
    field: postSlotField(slide.templateId, slot, (input.slides[index]?.body ?? "").trim().length > 0),
    templateId: slide.templateId,
    ...slotBudget(slide.templateId, slot)
  })));
}

/** The render summary written beside a post package, as the quiz's is beside its package. */
export function buildPostRenderSummary(input: { date: string; brand: Brand; kind: PostDeckKind; rendered: readonly RenderedPostSlide[] }) {
  return {
    schemaVersion: "marketingshark-render/1" as const,
    date: input.date,
    brandId: input.brand.id,
    kind: input.kind,
    locale: "en" as const,
    format: MARKETINGSHARK_FORMAT,
    engineVersion: engineVersion(),
    /** What code put on the slides beyond their words, so a later render needs nothing else. */
    facts: postDeckFacts(input.brand),
    slides: input.rendered.map((slide) => ({
      role: slide.role,
      templateId: slide.templateId,
      version: slide.version,
      slideId: slide.slideId,
      svgHash: slide.svgHash,
      truncatedSlots: slide.truncatedSlots,
      svg: slide.svg
    }))
  };
}

/** A slide whose words code wrote from a fact it holds. */
export interface CodeSlide {
  headline: string;
  body: string;
  alt: string;
}

/** Alt text for a slide code wrote: what it shows, bounded well inside the queue's total. */
export function codeSlideAlt(slide: number, text: string): string {
  return clipToWords(`Slide ${slide}: ${text}`, 160);
}

/** The code-owned slides of a kind that would clip, as `role:slot`. Writer slides are left empty. */
export function codeSlidesClip(brand: Brand, kind: PostDeckKind, codeSlides: Readonly<Record<string, CodeSlide>>): string[] {
  const slides = (POST_KIND_ROLES[kind] as readonly string[]).map((role) => ({ role, headline: "", body: "", alt: "", ...codeSlides[role] }));
  return postFitViolations({ brand, kind, slides })
    .filter((violation) => codeSlides[violation.role] !== undefined)
    .map((violation) => `${violation.role}:${violation.slot}`);
}
