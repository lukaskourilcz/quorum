import {
  CAROUSEL_BRANDS,
  CarouselPayloadSchema,
  buildCarouselSummary,
  renderCarouselSvg,
  reviewCarouselSummary,
  tehdejsiCsSlot,
  tehdejsiDeckTemplate,
  tehdejsiPhotoIssues,
  tehdejsiUaSlot,
  TEHDEJSI_ATTRIBUTION_SLOT,
  TEHDEJSI_CHIP_SLOT,
  TEHDEJSI_EYEBROW_SLOT,
  TEHDEJSI_MAX_SLIDES,
  TEHDEJSI_MIN_SLIDES,
  type CarouselFormat,
  type CarouselPayload,
  type CarouselSummary,
  type RenderedSlide
} from "@boardlessai/carousel-studio";
import {
  TehdejsiRecommendationSchema,
  type TehdejsiMediaRef,
  type TehdejsiRecommendation,
} from "../../contracts/tehdejsi-recommendation.js";
import { atomicWriteJson } from "../../state.js";

export const TEHDEJSI_RENDER_FORMAT: CarouselFormat = "instagram-portrait";

export interface TehdejsiDeckPack {
  templateId: string;
  templateVersion: string;
  brandId: "tehdejsi-svet";
  format: CarouselFormat;
  payload: CarouselPayload;
  photo: TehdejsiMediaRef | null;
}

export interface TehdejsiRenderOptions {
  eyebrow?: string;
  yearPlace?: string;
  format?: CarouselFormat;
  photoPng?: Buffer;
}

export interface StoredTehdejsiSummary {
  path: string;
  statePath: string;
  summary: CarouselSummary;
  pack: TehdejsiDeckPack;
  rendered: RenderedSlide[];
}

function photoFor(recommendation: TehdejsiRecommendation): TehdejsiMediaRef | null {
  const licensed = recommendation.media.filter(({ licence }) => licence !== "own-render");
  if (licensed.length > 1) {
    throw new Error("A Tehdejsi svet deck can carry at most one licensed photograph");
  }
  const photo = licensed[0] ?? null;
  if (photo && photo.slideOrdinal !== 2) {
    throw new Error("The Tehdejsi svet family reserves slide 2 for its licensed photograph");
  }
  return photo;
}

/** Build the one bilingual payload the Studio renderer consumes. */
export function buildTehdejsiDeckPack(
  recommendation: TehdejsiRecommendation,
  options: Omit<TehdejsiRenderOptions, "photoPng"> = {}
): TehdejsiDeckPack {
  const parsed = TehdejsiRecommendationSchema.parse(recommendation);
  const slideCount = parsed.payload.slides.length;
  if (slideCount < TEHDEJSI_MIN_SLIDES || slideCount > TEHDEJSI_MAX_SLIDES) {
    throw new Error(
      `A Tehdejsi svet deck needs ${TEHDEJSI_MIN_SLIDES}-${TEHDEJSI_MAX_SLIDES} slides; this package has ${slideCount}`
    );
  }
  const template = tehdejsiDeckTemplate(slideCount);
  const photo = photoFor(parsed);
  const strings: Record<string, string> = {
    [TEHDEJSI_EYEBROW_SLOT]: options.eyebrow ?? "Rodinná paměť · Родинна памʼять",
    [TEHDEJSI_CHIP_SLOT]: options.yearPlace ?? `${parsed.date.slice(0, 4)} · Tehdejší svět`,
    [TEHDEJSI_ATTRIBUTION_SLOT]: photo?.attribution ?? ""
  };
  parsed.payload.slides.forEach((slide, index) => {
    strings[tehdejsiCsSlot(index)] = slide.cs;
    strings[tehdejsiUaSlot(index)] = slide.ua;
  });
  return {
    templateId: template.id,
    templateVersion: template.version,
    brandId: "tehdejsi-svet",
    format: options.format ?? TEHDEJSI_RENDER_FORMAT,
    payload: CarouselPayloadSchema.parse({ locale: "cs", strings }),
    photo
  };
}

/** Render the pack through the dedicated family and reject clipping or a lost photo credit. */
export function renderTehdejsiDeck(
  recommendation: TehdejsiRecommendation,
  options: TehdejsiRenderOptions = {}
): { pack: TehdejsiDeckPack; rendered: RenderedSlide[] } {
  const pack = buildTehdejsiDeckPack(recommendation, options);
  if (options.photoPng && !pack.photo) {
    throw new Error("Photograph bytes require a licensed media record on slide 2");
  }
  const photoIssues = tehdejsiPhotoIssues({
    strings: pack.payload.strings,
    hasPhoto: Boolean(options.photoPng),
    licence: pack.photo?.licence ?? null
  });
  if (photoIssues.length > 0) {
    throw new Error(photoIssues.map(({ detail }) => detail).join(" "));
  }
  const template = tehdejsiDeckTemplate(recommendation.payload.slides.length);
  const rendered = renderCarouselSvg({
    template,
    brand: CAROUSEL_BRANDS[pack.brandId],
    format: pack.format,
    payload: pack.payload,
    ...(options.photoPng ? { images: { image: options.photoPng } } : {})
  });
  const truncated = rendered.flatMap(({ truncatedSlots }) => truncatedSlots);
  if (truncated.length > 0) {
    throw new Error(`Tehdejsi svet copy clips in slots: ${[...new Set(truncated)].join(", ")}`);
  }
  return { pack, rendered };
}

export function tehdejsiSummaryPath(summary: CarouselSummary): string {
  if (summary.venture !== "tehdejsi-svet") {
    throw new Error("The Tehdejsi svet summary writer accepts only its own venture");
  }
  return `ventures/carousel-studio/summaries/tehdejsi-svet/${summary.date}-${summary.slug}.json`;
}

/** The rail reads Czech as primary; both languages stay together in the recommendation pack. */
export function buildTehdejsiCarouselSummary(recommendation: TehdejsiRecommendation): CarouselSummary {
  const parsed = TehdejsiRecommendationSchema.parse(recommendation);
  const first = parsed.payload.slides[0];
  if (!first) throw new Error("A Tehdejsi svet feature has no cover slide");
  const photo = photoFor(parsed);
  const summary = buildCarouselSummary({
    venture: "tehdejsi-svet",
    locale: "cs",
    slug: parsed.id,
    date: parsed.date,
    title: first.cs,
    dek: parsed.payload.captionCs,
    points: parsed.payload.slides.map(({ cs }) => cs),
    sources: [
      { kind: "facts", label: "Tehdejší svět verified facts" },
      ...(parsed.evidence.dossierRefs.length > 0
        ? [{ kind: "dossier", label: "Tehdejší svět research dossier" }]
        : [])
    ],
    hasHero: photo !== null,
    heroCredit: photo?.attribution ?? null
  });
  const review = reviewCarouselSummary(summary);
  if (!review.renderable) {
    throw new Error(`Tehdejsi svet summary is not renderable: ${review.problems.join(" ")}`);
  }
  return summary;
}

/** Approval owns this single writer; it validates the real deck before adding the rail record. */
export async function storeApprovedTehdejsiSummary(
  root: string,
  recommendation: TehdejsiRecommendation,
  options: TehdejsiRenderOptions = {}
): Promise<StoredTehdejsiSummary> {
  const parsed = TehdejsiRecommendationSchema.parse(recommendation);
  if (parsed.status !== "approved") {
    throw new Error("Only an owner-approved Tehdejsi svet feature enters the Design Lab rail");
  }
  const { pack, rendered } = renderTehdejsiDeck(parsed, options);
  const summary = buildTehdejsiCarouselSummary(parsed);
  const relative = tehdejsiSummaryPath(summary);
  await atomicWriteJson(root, relative, summary);
  return { path: relative, statePath: `state/${relative}`, summary, pack, rendered };
}
