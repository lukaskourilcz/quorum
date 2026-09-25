import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { QUIZ_SLIDE_LIMITS, type QuizSlideProblem } from "@boardlessai/carousel-studio";
import { CarouselStudioPersistenceError, SLIDE_OVERRIDES_PATH, updateStudioJson } from "@/lib/carousel-studio-admin-store";
import { PACKAGE_BRAND, type PackageSlideCopy } from "@/lib/devshark-package";

/**
 * The owner's edits to a devShark package's slides (quorum#575).
 *
 * They live in `slide-overrides.json` beside the family decks' one-line edits, keyed by the
 * package's full identity and the slide's index, and never in the package: the package is what the
 * room committed, and a queue item binds to its hash. A record here says what the owner wants the
 * slide to read; Send to Queue turns the saved records into frames and a new package revision.
 */
export interface PackageSlideOverride extends PackageSlideCopy {
  kind: "package-slide";
  venture: typeof PACKAGE_BRAND;
  slug: string;
  date: string;
  /** 0 to 4. */
  slide: number;
  changedAt: string;
}

/** Refused before anything was written, with every reason the review found. */
export class PackageSlideRefusal extends Error {
  constructor(readonly problems: QuizSlideProblem[]) {
    super(problems.map((problem) => problem.message).join(" "));
  }
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function isPackageSlideOverride(value: unknown): value is PackageSlideOverride {
  const entry = value as Partial<PackageSlideOverride> | null;
  return typeof entry === "object" && entry !== null && entry.kind === "package-slide" && entry.venture === PACKAGE_BRAND
    && typeof entry.slug === "string" && typeof entry.date === "string" && Number.isInteger(entry.slide)
    && (entry.slide as number) >= 0 && (entry.slide as number) <= 4
    && typeof entry.headline === "string" && typeof entry.body === "string" && typeof entry.alt === "string" && typeof entry.changedAt === "string";
}

/** Every well-formed package edit in the file's value. Anything else in the file is not ours. */
export function parsePackageSlideOverrides(value: unknown): PackageSlideOverride[] {
  const entries = (value as { overrides?: unknown } | null)?.overrides;
  return Array.isArray(entries) ? entries.filter(isPackageSlideOverride) : [];
}

/** The checkout's copy, which is what a deployment's pages read. */
export async function readPackageSlideOverrides(root = repositoryRoot()): Promise<PackageSlideOverride[]> {
  try {
    return parsePackageSlideOverrides(JSON.parse(await readFile(path.join(root, SLIDE_OVERRIDES_PATH), "utf8")) as unknown);
  } catch {
    return [];
  }
}

/** One package's saved edits, by slide index. */
export function packageSlideEdits(overrides: readonly PackageSlideOverride[], slug: string, date: string): Map<number, PackageSlideCopy> {
  return new Map(overrides
    .filter((entry) => entry.slug === slug && entry.date === date)
    .map((entry) => [entry.slide, { headline: entry.headline, body: entry.body, alt: entry.alt }] as const));
}

/** Owner text as a slide holds it: NFC, Unix line ends, no surrounding space. */
export function packageSlideText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
}

/**
 * Save one slide's words, or refuse them.
 *
 * `review` sees the whole deck as it will read after this edit, built from the file's latest
 * version rather than the deployment's copy, so the alt-text total and every other slide are
 * checked against what is really saved. A slide edited back to the package's own words drops its
 * record, and the deck falls back to the package.
 */
export async function setPackageSlideOverride(
  input: {
    slug: string;
    date: string;
    slide: number;
    copy: PackageSlideCopy;
    /** The package's own words for this slide. */
    original: PackageSlideCopy;
    review: (edits: ReadonlyMap<number, PackageSlideCopy>) => QuizSlideProblem[];
    now?: Date;
  },
  root = repositoryRoot()
): Promise<{ edited: boolean; commit: string | null }> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.slug) || !/^\d{4}-\d{2}-\d{2}$/u.test(input.date)) {
    throw new CarouselStudioPersistenceError("CONFLICT", "That is not a devShark package.");
  }
  if (!Number.isInteger(input.slide) || input.slide < 0 || input.slide > 4) throw new CarouselStudioPersistenceError("CONFLICT", "A package has five slides.");
  const copy = { headline: packageSlideText(input.copy.headline), body: packageSlideText(input.copy.body), alt: packageSlideText(input.copy.alt) };
  if (copy.headline.length > QUIZ_SLIDE_LIMITS.headlineChars || copy.body.length > QUIZ_SLIDE_LIMITS.bodyChars || copy.alt.length > QUIZ_SLIDE_LIMITS.altChars) {
    throw new CarouselStudioPersistenceError("CONFLICT", "A slide field is longer than a package slide holds.");
  }
  const edited = copy.headline !== input.original.headline || copy.body !== input.original.body || copy.alt !== input.original.alt;
  const changedAt = (input.now ?? new Date()).toISOString();
  const mine = (entry: PackageSlideOverride) => entry.slug === input.slug && entry.date === input.date && entry.slide === input.slide;
  const write = await updateStudioJson(
    SLIDE_OVERRIDES_PATH,
    (current) => {
      const entries = Array.isArray((current as { overrides?: unknown } | null)?.overrides) ? (current as { overrides: unknown[] }).overrides : [];
      const kept = parsePackageSlideOverrides(current).filter((entry) => !mine(entry));
      const next: PackageSlideOverride[] = edited
        ? [{ kind: "package-slide", venture: PACKAGE_BRAND, slug: input.slug, date: input.date, slide: input.slide, ...copy, changedAt }, ...kept]
        : kept;
      const problems = input.review(packageSlideEdits(next, input.slug, input.date));
      if (problems.length > 0) throw new PackageSlideRefusal(problems);
      // The family decks' one-line edits share the file; they are carried over untouched.
      const others = entries.filter((entry) => (entry as { kind?: unknown } | null)?.kind !== "package-slide");
      return { schemaVersion: "carousel-slide-overrides/1", overrides: [...others, ...next.slice(0, 200)], updatedAt: changedAt };
    },
    `admin: edit devShark slide ${input.slide + 1} for ${input.date} ${input.slug}`,
    root
  );
  return { edited, commit: write.commit };
}
