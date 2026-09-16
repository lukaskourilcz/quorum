import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  LAYOUT_CHECKLIST_VERSION,
  previewFormats,
  renderCarouselPng,
  validateTemplateForBrand,
  type CarouselPayload,
  type CarouselTemplate,
  type TemplateCheck
} from "@boardlessai/carousel-studio";
import { atomicWriteJson } from "../state.js";

export const StudioObservationSchema = z.object({
  id: z.string().regex(/^observation-[a-z0-9-]+$/),
  sourceUrl: z.url().refine((value) => value.startsWith("https://"), "Only HTTPS inspiration links are allowed"),
  retrievedAt: z.iso.datetime({ offset: true }),
  appliesTo: z.array(z.enum(["caught-up", "mma-files", "titty-tuesdays", "instagram", "threads"])).min(1).max(5),
  principle: z.string().trim().min(20).max(500),
  originalityBoundary: z.string().trim().min(20).max(500)
}).refine((observation) => !/(?:pinterest\.(?:com|cz)|pin\.it)/i.test(observation.sourceUrl), {
  message: "Pinterest is not an allowed inspiration source",
  path: ["sourceUrl"]
});

export type StudioObservation = z.infer<typeof StudioObservationSchema>;

/**
 * Who reviewed a stored template, against which checklist, and when.
 *
 * The stored-template half of the layout gate. `studio/src/family-review.ts` gates the composed
 * families — the ones a new layout is actually written as today — and this gates the other door:
 * a `carousel-template/1` record proposed into `state/ventures/carousel-studio/templates/`.
 *
 * Only the owner reviews. EASEL, the template designer this path was built for, is `retired` in
 * `config/agents.json`, and an agent marking its own work reviewed is the failure this record
 * exists to prevent.
 */
export const StudioTemplateReviewSchema = z.object({
  reviewer: z.literal("owner"),
  reviewedAt: z.iso.datetime({ offset: true }),
  checklistVersion: z.literal(LAYOUT_CHECKLIST_VERSION),
  note: z.string().trim().min(3).max(240)
});

export type StudioTemplateReview = z.infer<typeof StudioTemplateReviewSchema>;

export interface StudioLifecycleResult {
  artifacts: string[];
  observationCount: number;
  template: CarouselTemplate | null;
  checks: Array<{ brand: string; format: string; checks: TemplateCheck[] }>;
}

function previewPayload(template: CarouselTemplate, locale: "en" | "cs"): CarouselPayload {
  return {
    locale,
    strings: Object.fromEntries(template.requiredSlots.map((slot, index) => [
      slot,
      locale === "cs"
        ? index === 0
          ? "Příliš žluťoučký kůň ověřuje čitelnost českého návrhu."
          : `Ukázkový český obsah pro pole ${slot}.`
        : `Original preview copy for ${slot}.`
    ]))
  };
}

function observationFileName(observation: StudioObservation): string {
  const hash = createHash("sha256").update(JSON.stringify(observation)).digest("hex").slice(0, 12);
  return `${observation.retrievedAt.slice(0, 10)}-${hash}.json`;
}

export async function processStudioContribution(input: {
  root: string;
  observations: unknown[];
  templateProposal: unknown;
  allowedEvidenceRefs: readonly string[];
  allowLive: boolean;
  /**
   * The owner's review of this exact version, or nothing.
   *
   * Nothing is the default and nothing means draft. `allowLive` says the room was permitted to
   * accept a layout; this says a person looked at it. Both are required, because a passing check
   * list is a statement about arithmetic and "reviewed" is a statement about a human.
   */
  review?: unknown;
}): Promise<StudioLifecycleResult> {
  const observations = input.observations.map((value) => StudioObservationSchema.parse(value));
  for (const observation of observations) {
    if (!input.allowedEvidenceRefs.includes(observation.sourceUrl)) {
      throw new Error(`Studio observation cited a URL outside the meeting packet: ${observation.sourceUrl}`);
    }
  }

  const artifacts: string[] = [];
  for (const observation of observations) {
    const relative = `ventures/carousel-studio/observations/${observationFileName(observation)}`;
    await atomicWriteJson(input.root, relative, observation);
    artifacts.push(relative);
  }

  if (input.templateProposal === null || input.templateProposal === undefined) {
    return { artifacts, observationCount: observations.length, template: null, checks: [] };
  }

  const candidate = CarouselTemplateSchema.parse({
    ...(input.templateProposal as Record<string, unknown>),
    status: "draft"
  });
  const knownObservationRefs = new Set([
    ...input.allowedEvidenceRefs,
    ...observations.map((observation) => observation.id)
  ]);
  if (
    candidate.citedObservationRefs.length === 0 ||
    candidate.citedObservationRefs.some((reference) => !knownObservationRefs.has(reference))
  ) {
    throw new Error("Studio template proposal must cite observations available to the room");
  }

  const checks = Object.values(CAROUSEL_BRANDS).flatMap((brand) =>
    previewFormats(candidate).map((format) => ({
      brand: brand.id,
      format,
      checks: validateTemplateForBrand(candidate, brand, format)
    }))
  );
  const passes = checks.every((entry) => entry.checks.every((check) => check.status === "pass"));
  const review = input.review === undefined || input.review === null
    ? null
    : StudioTemplateReviewSchema.parse(input.review);
  const template = CarouselTemplateSchema.parse({
    ...candidate,
    status: input.allowLive && passes && review !== null ? "live" : "draft"
  });
  const templatePath = `ventures/carousel-studio/templates/${template.id}/${template.version}.json`;
  const checksPath = `ventures/carousel-studio/templates/${template.id}/${template.version}.checks.json`;
  await atomicWriteJson(input.root, templatePath, template);
  await atomicWriteJson(input.root, checksPath, {
    schemaVersion: "carousel-template-checks/1",
    templateId: template.id,
    version: template.version,
    status: template.status,
    checklistVersion: LAYOUT_CHECKLIST_VERSION,
    review,
    checks
  });
  artifacts.push(templatePath, checksPath);

  if (passes) {
    for (const brand of Object.values(CAROUSEL_BRANDS)) {
      for (const format of previewFormats(template)) {
        const renders = await renderCarouselPng({
          template,
          payload: previewPayload(template, brand.id === "caught-up" ? "cs" : "en"),
          brand,
          format
        });
        // The render runs because a layout that cannot be drawn for every brand and format
        // is not live; the bytes are not kept. Persisting them wrote three brands times
        // three formats times every slide into the repository — eighteen PNGs at up to
        // 1080x1350 per accepted version — and nothing read them: the site re-renders from
        // the stored template on request. The .checks.json artifact below is the evidence.
        if (renders.length === 0) {
          throw new Error(`Carousel template ${template.id} rendered no slide for ${brand.id}/${format}`);
        }
      }
    }
  }
  return { artifacts, observationCount: observations.length, template, checks };
}
