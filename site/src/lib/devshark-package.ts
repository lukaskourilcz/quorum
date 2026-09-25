import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CAROUSEL_BRANDS,
  CarouselFormatSchema,
  QUIZ_SLIDE_ROLES,
  liveTemplateByReference,
  reviewQuizSlides,
  type CarouselFormat,
  type QuizDeckFacts,
  type QuizSlideCopy,
  type QuizSlideProblem,
  type QuizSlideRole
} from "@boardlessai/carousel-studio";

/**
 * marketingShark's devShark packages, read for the Design Lab and the Queue's re-render (quorum#575).
 *
 * A package is what the 07:00 room committed: five slides of copy, the frames it rendered and a
 * render summary that records the facts code put on the slides. The site has no orchestrator and no
 * zod, so the package is read here by hand and only as far as rendering it needs; everything else
 * in it is carried through untouched. Its canonical hash is computed the way the orchestrator's
 * `canonicalJson` does, because a queue item binds to that hash and the publisher's asset gate
 * refuses frames whose package no longer matches it.
 */

export const PACKAGE_BRAND = "devshark";
export type PackageBrand = typeof PACKAGE_BRAND;

const PACKAGE_ID = /^marketingshark-(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FRAME_PATH = /^\/social\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}\/[a-z]{2}\/(?:[a-f0-9]{12}\/)?slide-0[1-9]\.(?:png|jpg)$/u;

export interface PackageSlideCopy {
  headline: string;
  body: string;
  alt: string;
}

export interface PackageSlide extends PackageSlideCopy {
  role: QuizSlideRole;
  templateId: string;
  /** The template version the room rendered with, from the render summary; null when unrecorded. */
  version: string | null;
}

export interface PackageFrameFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface QuizPackageRecord {
  /** `marketingshark-<date>-<brand>`: the release id of every queue item built from it. */
  id: string;
  /** The Design Lab's slug for it, which is the package id. */
  slug: string;
  date: string;
  brandId: PackageBrand;
  artifactRef: string;
  raw: Record<string, unknown>;
  hash: string;
  slides: PackageSlide[];
  facts: QuizDeckFacts | null;
  format: CarouselFormat;
  frames: Array<{ slide: number; png: PackageFrameFile; jpeg: PackageFrameFile }>;
  /** Why this package cannot be rendered again, in the owner's words. Empty when it can. */
  problems: string[];
}

type Raw = Record<string, unknown>;

function object(value: unknown): Raw | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Raw : null;
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

/** The orchestrator's `canonicalJson`: keys sorted by code point at every depth, undefined dropped. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Raw)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** What a queue item's `sourcePackage.packageHash` must equal for this package. */
export function packageHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function packageArtifactRef(date: string, brand: string): string {
  return `state/ventures/marketingshark/packages/${date}/${brand}/package.json`;
}

/** `devshark:<package id>:<date>`, the Design Lab's address for one package. */
export function packageArticleId(slug: string, date: string): string {
  return `${PACKAGE_BRAND}:${slug}:${date}`;
}

/** The package a marketingShark release id names, when it names one. */
export function packageAddress(releaseId: string): { slug: string; date: string; brand: string } | null {
  const match = PACKAGE_ID.exec(releaseId);
  return match ? { slug: releaseId, date: match[1]!, brand: match[2]! } : null;
}

/**
 * The Design Lab edge a devShark package needs: `marketingshark -> design-lab`,
 * `bounded-render-summary/1`, allowed. Without it the Lab renders nothing for marketingShark,
 * exactly as it renders nothing for any venture without an edge.
 */
export async function designLabPackagesAllowed(root = repositoryRoot()): Promise<boolean> {
  try {
    const map = JSON.parse(await readFile(path.join(root, "config", "venture-capabilities.json"), "utf8")) as { edges?: unknown };
    return Array.isArray(map.edges) && map.edges.some((entry) => {
      const edge = object(entry);
      return edge?.source === "marketingshark" && edge.target === "design-lab" && edge.capability === "bounded-render-summary"
        && edge.dataSchemaVersion === "bounded-render-summary/1" && edge.decision === "allowed";
    });
  } catch {
    return false;
  }
}

function frameFile(value: unknown): PackageFrameFile | null {
  const file = object(value);
  if (!file || typeof file.path !== "string" || !FRAME_PATH.test(file.path) || typeof file.sha256 !== "string" || !SHA256.test(file.sha256)
    || !Number.isInteger(file.bytes) || (file.bytes as number) <= 0) return null;
  return { path: file.path, sha256: file.sha256, bytes: file.bytes as number };
}

function facts(value: unknown): QuizDeckFacts | null {
  const raw = object(value);
  const strings = (list: unknown) => Array.isArray(list) && list.every((entry) => typeof entry === "string") ? list as string[] : null;
  const options = strings(raw?.options);
  const codeBlocks = strings(raw?.codeBlocks);
  if (!raw || typeof raw.displayName !== "string" || typeof raw.productUrl !== "string" || typeof raw.correctLetter !== "string"
    || !/^[A-D]$/u.test(raw.correctLetter) || !options || !codeBlocks) return null;
  return { displayName: raw.displayName, productUrl: raw.productUrl, correctLetter: raw.correctLetter, options, codeBlocks };
}

/**
 * One package, read from the repository as the room committed it. Null when there is no package
 * for that date; a package that is there but cannot be rendered again says why in `problems`.
 */
export async function readQuizPackage(date: string, brand: string = PACKAGE_BRAND, root = repositoryRoot()): Promise<QuizPackageRecord | null> {
  if (!DATE.test(date) || brand !== PACKAGE_BRAND) return null;
  const artifactRef = packageArtifactRef(date, brand);
  let raw: Raw | null;
  try {
    raw = object(JSON.parse(await readFile(path.join(root, artifactRef), "utf8")));
  } catch {
    return null;
  }
  const slides = object(object(raw?.carousels)?.en)?.slides;
  const render = object(raw?.render);
  if (!raw || raw.schemaVersion !== "marketingshark-package/2" || raw.id !== `marketingshark-${date}-${brand}` || raw.date !== date
    || !Array.isArray(slides) || slides.length !== QUIZ_SLIDE_ROLES.length || !render || !Array.isArray(render.frames)) return null;
  const copies = slides.map(object);
  if (copies.some((slide, index) => !slide || slide.role !== QUIZ_SLIDE_ROLES[index] || typeof slide.templateId !== "string"
    || typeof slide.headline !== "string" || (slide.body !== undefined && typeof slide.body !== "string") || typeof slide.alt !== "string")) return null;

  const problems: string[] = [];
  const summaryPath = Array.isArray(render.summaryPaths) ? render.summaryPaths.find((entry) => typeof entry === "string" && entry.endsWith("/render-en.json")) : undefined;
  const summary = typeof summaryPath === "string" && /^state\/ventures\/marketingshark\/packages\/[a-z0-9/-]+\.json$/u.test(summaryPath)
    ? object(await readFile(path.join(root, summaryPath), "utf8").then((text) => JSON.parse(text) as unknown, () => null))
    : null;
  const recordedFacts = facts(summary?.facts);
  if (!summary) problems.push("The package's render summary is missing, so its slides cannot be rendered again.");
  else if (!recordedFacts) problems.push("This package was drafted before its render summary recorded the facts code puts on the slides, so the Design Lab cannot render it again.");
  const versions = Array.isArray(summary?.slides) ? summary.slides.map((entry) => object(entry)?.version) : [];
  const format = CarouselFormatSchema.safeParse(render.format);

  const frames = (render.frames as unknown[]).flatMap((entry) => {
    const frame = object(entry);
    const png = frameFile(frame?.png);
    const jpeg = frameFile(frame?.jpeg);
    return frame?.locale === "en" && Number.isInteger(frame.slide) && png && jpeg ? [{ slide: frame.slide as number, png, jpeg }] : [];
  }).sort((left, right) => left.slide - right.slide);
  if (frames.length !== QUIZ_SLIDE_ROLES.length) problems.push("The package does not record a PNG and a JPEG frame for each of its five slides.");

  return {
    id: raw.id as string,
    slug: raw.id as string,
    date,
    brandId: PACKAGE_BRAND,
    artifactRef,
    raw,
    hash: packageHash(raw),
    slides: copies.map((slide, index) => ({
      role: QUIZ_SLIDE_ROLES[index]!,
      templateId: slide!.templateId as string,
      version: typeof versions[index] === "string" ? versions[index] as string : null,
      headline: slide!.headline as string,
      body: (slide!.body as string | undefined) ?? "",
      alt: slide!.alt as string
    })),
    facts: recordedFacts,
    format: format.success ? format.data : "instagram-portrait",
    frames,
    problems
  };
}

/** Every devShark package date in the repository, newest first. */
export async function quizPackageDates(root = repositoryRoot()): Promise<string[]> {
  const directory = path.join(root, "state", "ventures", "marketingshark", "packages");
  const names = await readdir(directory).catch(() => [] as string[]);
  return names.filter((name) => DATE.test(name)).sort().reverse();
}

/** The package's slides with the owner's saved words laid over them, by slide index. */
export function slidesWithEdits(record: QuizPackageRecord, edits: ReadonlyMap<number, PackageSlideCopy>): PackageSlide[] {
  return record.slides.map((slide, index) => ({ ...slide, ...edits.get(index) }));
}

/**
 * The studio's view of the slides: each with the exact template version the room rendered with.
 * Throws when a version is unrecorded or no longer live, because rendering with another version
 * would not reproduce the room's slide.
 */
export function quizSlideCopies(slides: readonly PackageSlide[]): QuizSlideCopy[] {
  return slides.map((slide) => {
    if (!slide.version) throw new Error(`The render summary records no template version for the ${slide.role} slide.`);
    return { role: slide.role, template: liveTemplateByReference(slide.templateId, slide.version), headline: slide.headline, body: slide.body, alt: slide.alt };
  });
}

/** The review an edited deck has to pass before it is saved or sent (`reviewQuizSlides`). */
export function reviewPackageSlides(record: QuizPackageRecord, slides: readonly PackageSlide[]): QuizSlideProblem[] {
  if (!record.facts) return [{ slide: 0, field: "body", slot: null, message: record.problems[0] ?? "This package cannot be rendered again." }];
  let copies: QuizSlideCopy[];
  try {
    copies = quizSlideCopies(slides);
  } catch (error) {
    return [{ slide: 0, field: "body", slot: null, message: error instanceof Error ? error.message : "A slide template is unavailable." }];
  }
  return reviewQuizSlides({ slides: copies, facts: record.facts, locale: "en", brand: CAROUSEL_BRANDS.devshark, format: record.format });
}
