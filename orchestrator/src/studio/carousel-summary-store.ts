import {
  buildCarouselSummary,
  reviewCarouselSummary,
  type CarouselSummary,
  type CarouselSummarySource,
  type CarouselSummaryVenture
} from "@boardlessai/carousel-studio";
import type { EditionPackage } from "../contracts/edition-package.js";
import type { ArticlePackage } from "../contracts/mma-files.js";
import { atomicWriteJson } from "../state.js";

/**
 * What an article sends to Carousel Studio, written beside the package that shipped.
 *
 * The two magazines publish a thousand Czech words a day. A carousel is a handful of frames, and
 * the decision about which of those words belong on them is one the desk already made when it
 * wrote the piece. So delivery hands the studio a *summary* — headline, standfirst, an ordered
 * set of passages and the sources — rather than the article, and the templates parse that.
 *
 * Recorded rather than derived on demand, for one reason: this is what was actually sent. The
 * site can rebuild the same summary from the package with the same function, and does, for
 * everything published before this existed. But once a package is corrected, a re-derived summary
 * would show the owner something that never left the building, and the recorded file would not.
 *
 * Deterministic and free. No model call: splitting prose at a sentence boundary is arithmetic,
 * and paying for it would add cost, latency and a way for a slide to say something the article
 * does not.
 */

function summaryPath(summary: CarouselSummary): string {
  return `ventures/carousel-studio/summaries/${summary.venture}/${summary.date}-${summary.slug}.json`;
}

/**
 * What a source is, without saying where it lives.
 *
 * An article's `sources[].ref` is a repository path, which is an internal address; the studio
 * renders public slides, so only the kind travels.
 */
function publicSources(sources: ArticlePackage["sources"]): CarouselSummarySource[] {
  const labels: Record<string, string> = {
    internal: "BoardlessAI verified record",
    primary: "Primary document",
    record: "Published record",
    external: "External source"
  };
  const seen = new Set<string>();
  const out: CarouselSummarySource[] = [];
  for (const source of sources ?? []) {
    const kind = typeof source.kind === "string" ? source.kind : "external";
    if (seen.has(kind)) continue;
    seen.add(kind);
    out.push({ kind, label: labels[kind] ?? "Source" });
  }
  return out;
}

/** The attribution line, flattened the way the delivery verifier flattens it. */
function creditOf(attribution: string | undefined): string | null {
  if (typeof attribution !== "string") return null;
  const credit = attribution.replaceAll(/<[^>]+>/gu, " ").replaceAll(/\s+/gu, " ").trim();
  return credit.length > 0 ? credit : null;
}

export interface StoredCarouselSummary {
  path: string;
  summary: CarouselSummary;
  /** Why this summary cannot be rendered as it stands, from `reviewCarouselSummary`. */
  problems: string[];
}

/**
 * Write the summary for a stored MMA Files article.
 *
 * Returns `null` when the package has no Czech article in it — a blocked or killed slot is a
 * recorded outcome with nothing to summarise, and writing an empty summary for it would put a
 * carousel in the studio for a piece that was never written.
 */
export async function storeArticleCarouselSummary(
  root: string,
  article: ArticlePackage
): Promise<StoredCarouselSummary | null> {
  const cs = article.localizations?.cs;
  if (!cs?.title || !cs.dek || !cs.bodyMDX) return null;
  const summary = buildCarouselSummary({
    venture: "mma-files",
    slug: article.slug,
    date: article.publishAt.slice(0, 10),
    title: cs.title,
    dek: cs.dek,
    bodyMdx: cs.bodyMDX,
    sources: publicSources(article.sources),
    hasHero: Boolean(article.image?.hero_bytes_base64),
    heroCredit: creditOf(article.image?.license?.attribution_html)
  });
  const path = summaryPath(summary);
  await atomicWriteJson(root, path, summary);
  return { path, summary, problems: reviewCarouselSummary(summary).problems };
}

/**
 * Write the summary for a DNESKAi edition package.
 *
 * A `no_edition` package carries a reason and no article; it produces no summary, because an
 * edition that did not go out has nothing to put on a slide. The reason is already recorded, and
 * the studio showing nothing for that day is the honest state.
 */
export async function storeEditionCarouselSummary(
  root: string,
  editionPackage: EditionPackage
): Promise<StoredCarouselSummary | null> {
  if (editionPackage.status !== "edition") return null;
  const frontmatter = editionPackage.article.cs.frontmatter as {
    slug?: string;
    title?: string;
    dek?: string;
    what_changed?: string[];
    why_it_matters?: string[];
    uncertainty?: string[];
  };
  if (!frontmatter?.slug || !frontmatter.title || !frontmatter.dek) return null;
  const summary = buildCarouselSummary({
    venture: "caught-up" satisfies CarouselSummaryVenture,
    slug: frontmatter.slug,
    date: editionPackage.date,
    title: frontmatter.title,
    dek: frontmatter.dek,
    // The editor's own structure is the argument, in the order they made it.
    points: [
      ...(frontmatter.what_changed ?? []),
      ...(frontmatter.why_it_matters ?? []),
      ...(frontmatter.uncertainty ?? []).slice(0, 1)
    ],
    hasHero: Boolean(editionPackage.image?.hero_bytes_base64),
    heroCredit: creditOf(editionPackage.image?.license?.attribution_html)
  });
  const path = summaryPath(summary);
  await atomicWriteJson(root, path, summary);
  return { path, summary, problems: reviewCarouselSummary(summary).problems };
}
