import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  SEED_TEMPLATES,
  TemplateLifecycleOverrideSchema,
  fixturePayload,
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
      const checks = Object.values(CAROUSEL_BRANDS).flatMap((brand) => previewFormats().map((format) => {
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
    formats: previewFormats(),
    inspirationLinks: parseInspiration(inspirationValue).sort((left, right) => right.addedAt.localeCompare(left.addedAt))
  };
}

export async function findCarouselTemplate(id: string, version: string, root = repositoryRoot): Promise<CarouselTemplate | null> {
  return (await readCarouselStudio(root)).templates.find((entry) => entry.template.id === id && entry.template.version === version)?.template ?? null;
}
