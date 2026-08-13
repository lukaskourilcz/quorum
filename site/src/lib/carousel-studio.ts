import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  SEED_TEMPLATES,
  TemplateLifecycleOverrideSchema,
  fixtureAssignment,
  fixtureItem,
  fixturePayload,
  readLibrary,
  previewFormats,
  resolveLifecycleStatus,
  validateTemplateForBrand,
  type CarouselFormat,
  type CarouselPayload,
  type CarouselTemplate
} from "@boardlessai/carousel-studio";
import { parseRatingLedger, type RatingRecord } from "./rating-model";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

export interface CarouselStudioTemplate {
  template: CarouselTemplate;
  source: "seed" | "proposal";
  contentHash: string;
  checks: Array<{
    brand: keyof typeof CAROUSEL_BRANDS;
    format: CarouselFormat;
    passed: boolean;
    details: ReturnType<typeof validateTemplateForBrand>;
  }>;
  allChecksPass: boolean;
  ratings: RatingRecord[];
}

export interface CarouselInspirationLink {
  url: string;
  label: string;
  addedAt: string;
}

export interface CarouselStudioSnapshot {
  templates: CarouselStudioTemplate[];
  brands: Array<{ id: keyof typeof CAROUSEL_BRANDS; name: string }>;
  formats: CarouselFormat[];
  inspirationLinks: CarouselInspirationLink[];
}

function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12)}`;
}

async function optionalJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function proposalTemplates(root: string): Promise<CarouselTemplate[]> {
  const directory = path.join(root, "state", "ventures", "carousel-studio", "templates");
  try {
    const ids = await readdir(directory, { withFileTypes: true });
    const templates: CarouselTemplate[] = [];
    for (const id of ids.filter((entry) => entry.isDirectory())) {
      const files = await readdir(path.join(directory, id.name));
      for (const file of files.filter((name) => /^\d+\.\d+\.\d+\.json$/.test(name))) {
        const parsed = CarouselTemplateSchema.safeParse(await optionalJson(path.join(directory, id.name, file)));
        if (parsed.success) templates.push(parsed.data);
      }
    }
    return templates;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function ratingHistory(root: string): Promise<RatingRecord[]> {
  try {
    return parseRatingLedger(await readFile(path.join(root, "state", "ratings", "carousel-studio", "ledger.jsonl"), "utf8")) ?? [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function parseInspiration(value: unknown): CarouselInspirationLink[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { links?: unknown }).links)) return [];
  return (value as { links: unknown[] }).links.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const link = candidate as Partial<CarouselInspirationLink>;
    return typeof link.url === "string" && link.url.startsWith("https://") && typeof link.label === "string" && typeof link.addedAt === "string"
      ? [{ url: link.url, label: link.label, addedAt: link.addedAt }]
      : [];
  });
}

export function previewPayload(template: CarouselTemplate, locale: "en" | "cs"): CarouselPayload {
  try {
    return fixturePayload(template, locale);
  } catch {
    return {
      locale,
      strings: Object.fromEntries(template.requiredSlots.map((slot, index) => [
        slot,
        locale === "cs"
          ? index === 0 ? "Příliš žluťoučký kůň ověřuje českou sazbu." : `Ukázkový obsah pro ${slot}.`
          : `Original preview content for ${slot}.`
      ]))
    };
  }
}

/** The slot slide 1 puts its headline in: the first text layer on the first slide. */
export function slideOneTextSlot(template: CarouselTemplate): string | null {
  const first = template.slides[0];
  if (!first) return null;
  const layer = first.layers.find((candidate) => candidate.type === "text");
  return layer && layer.type === "text" ? layer.slot : null;
}

/**
 * A preview payload whose slide 1 carries a real assigned hook.
 *
 * The two shark brands are quiz verticals, so their previews run the real assignment against a
 * fixture item carrying real quiz metadata and render whatever it returns. That makes the gallery
 * show the thing the studio actually publishes rather than lorem for the one slot that has to earn
 * the next interaction.
 *
 * Every other brand keeps its fixture headline. Their libraries are unwritten, so a preview that
 * invented a hook for them would be showing something the pipeline would never produce.
 */
export async function previewPayloadForBrand(
  template: CarouselTemplate,
  locale: "en" | "cs",
  brandId: keyof typeof CAROUSEL_BRANDS
): Promise<CarouselPayload> {
  const base = previewPayload(template, locale);
  const vertical = brandId === "devshark" ? "dev" : brandId === "geoshark" ? "geo" : null;
  const slot = slideOneTextSlot(template);
  if (!vertical || !slot) return base;

  const resolved = fixtureAssignment(await readLibrary("quiz"), fixtureItem(vertical));
  // No line means the fallback fired, which is exactly when the template's own headline renders.
  if (!resolved.line) return base;

  return { ...base, strings: { ...base.strings, [slot]: resolved.line[locale] } };
}

/**
 * The public gallery is a closed, filesystem-free projection of committed seed templates.
 *
 * Admin may inspect draft proposals, owner lifecycle choices, ratings and inspiration links. None
 * of those records belongs on a public route before the owner publishes it, even when the preview
 * copy itself is synthetic. Keeping this function synchronous makes accidental state reads hard
 * to reintroduce: its only inputs are the compiled template and brand registries.
 */
export function readPublicCarouselStudio(): CarouselStudioSnapshot {
  const templates = SEED_TEMPLATES.map((template): CarouselStudioTemplate => {
    const checks = Object.values(CAROUSEL_BRANDS).flatMap((brand) => previewFormats(template).map((format) => {
      const details = validateTemplateForBrand(template, brand, format);
      return { brand: brand.id, format, passed: details.every((check) => check.status === "pass"), details };
    }));
    return {
      template,
      source: "seed",
      contentHash: hash(template),
      checks,
      allChecksPass: checks.every((entry) => entry.passed),
      ratings: []
    };
  }).sort((left, right) => left.template.id.localeCompare(right.template.id) || right.template.version.localeCompare(left.template.version));
  return {
    templates,
    brands: Object.values(CAROUSEL_BRANDS).map((brand) => ({ id: brand.id, name: brand.name })),
    formats: previewFormats(),
    inspirationLinks: []
  };
}

/** A public preview can address only a committed seed, never an unpublished proposal record. */
export function findPublicCarouselTemplate(id: string, version: string): CarouselTemplate | null {
  return readPublicCarouselStudio().templates.find(
    (entry) => entry.template.id === id && entry.template.version === version
  )?.template ?? null;
}

export async function readCarouselStudio(root = repositoryRoot): Promise<CarouselStudioSnapshot> {
  const [proposals, overrideValue, inspirationValue, ratings] = await Promise.all([
    proposalTemplates(root),
    optionalJson(path.join(root, "state", "ventures", "carousel-studio", "template-overrides.json")),
    optionalJson(path.join(root, "state", "ventures", "carousel-studio", "inspiration", "owner-links.json")),
    ratingHistory(root)
  ]);
  const overrideResult = TemplateLifecycleOverrideSchema.safeParse(overrideValue);
  const overrides = overrideResult.success ? overrideResult.data.overrides : [];
  const seen = new Set<string>();
  const templates = [...SEED_TEMPLATES.map((template) => ({ template, source: "seed" as const })), ...proposals.map((template) => ({ template, source: "proposal" as const }))]
    .filter(({ template }) => {
      const key = `${template.id}@${template.version}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ template: raw, source }): CarouselStudioTemplate => {
      const checks = Object.values(CAROUSEL_BRANDS).flatMap((brand) => previewFormats(raw).map((format) => {
        const details = validateTemplateForBrand(raw, brand, format);
        return { brand: brand.id, format, passed: details.every((check) => check.status === "pass"), details };
      }));
      const ownerOverride = overrides.find((override) => override.templateId === raw.id && override.version === raw.version)?.status;
      const template = CarouselTemplateSchema.parse({
        ...raw,
        status: resolveLifecycleStatus({ template: raw, checks: checks.flatMap((entry) => entry.details), ownerOverride })
      });
      return {
        template,
        source,
        contentHash: hash(template),
        checks,
        allChecksPass: checks.every((entry) => entry.passed),
        ratings: ratings.filter((rating) => rating.objectKind === "template" && rating.objectRef.id === `${template.id}@${template.version}`).sort((left, right) => right.ratedAt.localeCompare(left.ratedAt))
      };
    })
    .sort((left, right) => left.template.id.localeCompare(right.template.id) || right.template.version.localeCompare(left.template.version));
  return {
    templates,
    brands: Object.values(CAROUSEL_BRANDS).map((brand) => ({ id: brand.id, name: brand.name })),
    // The gallery's own picker: every canvas the studio renders. Which of them a given template
    // is offered is per-template and rides on its `checks` above.
    formats: previewFormats(),
    inspirationLinks: parseInspiration(inspirationValue).sort((left, right) => right.addedAt.localeCompare(left.addedAt))
  };
}

export async function findCarouselTemplate(id: string, version: string, root = repositoryRoot): Promise<CarouselTemplate | null> {
  return (await readCarouselStudio(root)).templates.find((entry) => entry.template.id === id && entry.template.version === version)?.template ?? null;
}
