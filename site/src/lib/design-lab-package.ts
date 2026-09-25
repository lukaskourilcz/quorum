import "server-only";
import path from "node:path";
import { QUIZ_SLIDE_LIMITS, type QuizSlideProblem, type QuizSlideRole } from "@boardlessai/carousel-studio";
import { readStudioArticles } from "@/lib/carousel-summaries";
import { readQueueState } from "@/lib/admin-queue/state";
import type { QueuePlatform, QueueStatus } from "@/lib/admin-queue/types";
import {
  PACKAGE_BRAND,
  designLabPackagesAllowed,
  packageArticleId,
  readQuizPackage,
  reviewPackageSlides,
  slidesWithEdits,
  type PackageSlideCopy
} from "@/lib/devshark-package";
import { packageSlideEdits, readPackageSlideOverrides } from "@/lib/package-slide-overrides";

/**
 * The Design Lab's package-backed article kind: one devShark package per day (quorum#575).
 *
 * Its five slides render through marketingShark's quiz templates, never the family system, so it
 * has no recipe, no look and no deck export. What the owner can change is each slide's headline,
 * body and alt text, within the room's own caps; Save runs the clip gate first. Send to Queue
 * turns the saved words into frames and supersedes the package's live queue drafts.
 *
 * Resolved on the server and handed across as plain JSON: no file name, package path or frame
 * path reaches the browser, only the addresses the owner-only routes answer.
 */

export interface LabPackageSlide {
  index: number;
  role: QuizSlideRole;
  templateId: string;
  /** The package's own words. */
  original: PackageSlideCopy;
  /** The words the slide carries now: the owner's saved edit, or the package's. */
  current: PackageSlideCopy;
  edited: boolean;
}

/** A queue draft built from this package that a re-render can still supersede. */
export interface LabPackageQueueItem {
  id: string;
  platform: QueuePlatform;
  status: QueueStatus;
  contentHash: string;
}

export interface LabPackageArticle {
  kind: "package";
  /** `devshark:<package id>:<date>`, the Design Lab's address for it. */
  id: string;
  venture: typeof PACKAGE_BRAND;
  ventureLabel: string;
  slug: string;
  date: string;
  locale: "en";
  /** The question line, which is what tells one day's package from another. */
  headline: string;
  slides: LabPackageSlide[];
  renderable: boolean;
  problems: string[];
  limits: { hook: number; headline: number; body: number; alt: number; altTotal: number };
  queueItems: LabPackageQueueItem[];
}

const LIMITS = {
  hook: QUIZ_SLIDE_LIMITS.hookChars,
  headline: QUIZ_SLIDE_LIMITS.headlineChars,
  body: QUIZ_SLIDE_LIMITS.bodyChars,
  alt: QUIZ_SLIDE_LIMITS.altChars,
  altTotal: QUIZ_SLIDE_LIMITS.altTotalChars
};

const SUPERSEDABLE: ReadonlySet<QueueStatus> = new Set(["draft", "approved", "queued", "failed"]);

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

/** The problems a reader acts on, one sentence each, without duplicates. */
function sentences(problems: readonly QuizSlideProblem[]): string[] {
  return [...new Set(problems.map((problem) => problem.message))];
}

/**
 * Every devShark package the Lab lists, newest first, each joined to its queue drafts.
 *
 * The rail is the carousel summaries, as for every venture; a summary whose package cannot be read
 * is dropped here rather than shown as an article with no slides. Nothing is listed without the
 * `marketingshark -> design-lab` edge.
 */
export async function readDesignLabPackages(limit = 40, root = repositoryRoot(), options: { now?: Date } = {}): Promise<LabPackageArticle[]> {
  if (!(await designLabPackagesAllowed(root))) return [];
  const [articles, overrides, queue] = await Promise.all([
    readStudioArticles(root),
    readPackageSlideOverrides(root),
    readQueueState(root).catch(() => null)
  ]);
  const superseded = new Set((queue?.events ?? []).filter((event) => event.action === "edit" || event.action === "rerender").map((event) => event.itemId));
  const now = (options.now ?? new Date()).getTime();
  const lab: LabPackageArticle[] = [];
  for (const article of articles.filter((entry) => entry.venture === PACKAGE_BRAND).slice(0, limit)) {
    const record = await readQuizPackage(article.summary.date, PACKAGE_BRAND, root);
    if (!record || record.slug !== article.summary.slug) continue;
    const edits = packageSlideEdits(overrides, record.slug, record.date);
    const current = slidesWithEdits(record, edits);
    const review = record.problems.length > 0 ? [] : reviewPackageSlides(record, current);
    const problems = [...record.problems, ...sentences(review)];
    lab.push({
      kind: "package",
      id: packageArticleId(record.slug, record.date),
      venture: PACKAGE_BRAND,
      ventureLabel: article.ventureLabel,
      slug: record.slug,
      date: record.date,
      locale: "en",
      headline: record.slides[1]?.headline ?? article.summary.headline,
      slides: record.slides.map((slide, index) => ({
        index,
        role: slide.role,
        templateId: slide.templateId,
        original: { headline: slide.headline, body: slide.body, alt: slide.alt },
        current: { headline: current[index]!.headline, body: current[index]!.body, alt: current[index]!.alt },
        edited: edits.has(index)
      })),
      renderable: problems.length === 0,
      problems,
      limits: LIMITS,
      queueItems: (queue?.entries ?? []).flatMap(({ item }) =>
        item.schemaVersion === 2 && item.sourceVentureId === "marketingshark" && item.releaseId === record.id
          && SUPERSEDABLE.has(item.status) && !superseded.has(item.id) && Date.parse(item.publishWindow.notAfter) > now
          ? [{ id: item.id, platform: item.channel, status: item.status, contentHash: item.content.contentHash }]
          : [])
    });
  }
  return lab;
}
