import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCarouselSummary,
  reviewCarouselSummary,
  type CarouselSummary,
  type CarouselSummarySource
} from "@boardlessai/carousel-studio";

/**
 * Every article that reached DNESKAi or MMA Files, as something the Design Lab can render.
 *
 * Two sources, in that order. Delivery writes a summary beside the package it sent, and that
 * file is the record: it is what the desk actually handed over. Where no such file exists — every
 * article delivered before summaries were written — the same deterministic builder derives one
 * from the package on disk. Both routes run `buildCarouselSummary`, so a derived summary and a
 * recorded one are byte-identical for the same article; the fallback is a backfill, not a second
 * implementation that could disagree with the first.
 *
 * Nothing here invents an article. A venture with no delivered articles returns an empty list and
 * the studio says so.
 */

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

export interface StudioArticle {
  /** `<venture>:<slug>:<date>`, which is how the studio addresses one. */
  id: string;
  venture: "caught-up" | "mma-files";
  ventureLabel: string;
  summary: CarouselSummary;
  /** Where the summary came from, so the panel can say whether it is recorded or derived. */
  origin: "recorded" | "derived";
  /** Problems that would stop this summary rendering, from `reviewCarouselSummary`. */
  problems: string[];
}

const VENTURE_LABEL: Record<StudioArticle["venture"], string> = {
  "caught-up": "DNESKAi",
  "mma-files": "MMA Files"
};

/**
 * What a source is, without saying where it lives.
 *
 * An article's `sources[].ref` is a repository path — `state/mma/fighters/ufc:…json` — which is
 * an internal address and stays internal. The kind is the part a reader can use: whether the desk
 * stood the claim on a primary document, on its own verified record, or on an outside page.
 */
function publicSources(value: unknown): CarouselSummarySource[] {
  if (!Array.isArray(value)) return [];
  const labels: Record<string, string> = {
    internal: "BoardlessAI verified record",
    primary: "Primary document",
    record: "Published record",
    external: "External source"
  };
  const seen = new Set<string>();
  const sources: CarouselSummarySource[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const kind = typeof (entry as { kind?: unknown }).kind === "string" ? (entry as { kind: string }).kind : "external";
    const label = labels[kind] ?? "Source";
    const key = `${kind}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ kind, label });
  }
  return sources;
}

/** The attribution line, flattened the way the delivery verifier flattens it. */
function creditOf(image: unknown): string | null {
  const attribution = (image as { license?: { attribution_html?: unknown } } | undefined)?.license?.attribution_html;
  if (typeof attribution !== "string") return null;
  const credit = attribution.replaceAll(/<[^>]+>/gu, " ").replaceAll(/\s+/gu, " ").trim();
  return credit.length > 0 ? credit : null;
}

async function readJsonFiles(directory: string): Promise<Array<{ name: string; value: unknown }>> {
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse();
    return await Promise.all(names.map(async (name) => ({
      name,
      value: JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown
    })));
  } catch {
    return [];
  }
}

/** Summaries delivery wrote. One directory per venture, one file per delivered article. */
async function recordedSummaries(root: string): Promise<Map<string, CarouselSummary>> {
  const recorded = new Map<string, CarouselSummary>();
  for (const venture of ["caught-up", "mma-files"] as const) {
    const directory = path.join(root, "state", "ventures", "carousel-studio", "summaries", venture);
    for (const { value } of await readJsonFiles(directory)) {
      const summary = value as Partial<CarouselSummary>;
      if (summary?.schemaVersion !== "carousel-summary/1") continue;
      if (typeof summary.slug !== "string" || !Array.isArray(summary.passages)) continue;
      recorded.set(`${venture}:${summary.slug}:${summary.date}`, summary as CarouselSummary);
    }
  }
  return recorded;
}

/** MMA Files articles, derived from the packages the desk delivered. */
async function mmaFilesSummaries(root: string): Promise<CarouselSummary[]> {
  const summaries: CarouselSummary[] = [];
  for (const { value } of await readJsonFiles(path.join(root, "state/ventures/mma-files/articles"))) {
    const article = value as {
      slug?: string;
      publishAt?: string;
      sources?: unknown;
      image?: unknown;
      localizations?: { cs?: { title?: string; dek?: string; bodyMDX?: string } };
    };
    const cs = article.localizations?.cs;
    if (!article.slug || !cs?.title || !cs.dek || !cs.bodyMDX) continue;
    summaries.push(buildCarouselSummary({
      venture: "mma-files",
      slug: article.slug,
      date: (article.publishAt ?? "").slice(0, 10),
      title: cs.title,
      dek: cs.dek,
      bodyMdx: cs.bodyMDX,
      sources: publicSources(article.sources),
      hasHero: Boolean((article.image as { hero_bytes_base64?: unknown } | undefined)?.hero_bytes_base64),
      heroCredit: creditOf(article.image)
    }));
  }
  return summaries;
}

/** DNESKAi editions, derived from the packages the edition room delivered. */
async function dneskaiSummaries(root: string): Promise<CarouselSummary[]> {
  const summaries: CarouselSummary[] = [];
  const directories = [
    path.join(root, "state/edition/archive"),
    path.join(root, "state/edition/outbox")
  ];
  const seen = new Set<string>();
  for (const directory of directories) {
    for (const { value } of await readJsonFiles(directory)) {
      const pkg = value as {
        date?: string;
        status?: string;
        image?: unknown;
        article?: { cs?: { frontmatter?: Record<string, unknown> } };
      };
      const frontmatter = pkg.article?.cs?.frontmatter as {
        slug?: string;
        title?: string;
        dek?: string;
        what_changed?: string[];
        why_it_matters?: string[];
        uncertainty?: string[];
      } | undefined;
      // `no_edition` is a real and recorded outcome, and it has no article to summarise.
      if (pkg.status !== "edition" || !frontmatter?.slug || !frontmatter.title || !frontmatter.dek) continue;
      if (seen.has(frontmatter.slug)) continue;
      seen.add(frontmatter.slug);
      summaries.push(buildCarouselSummary({
        venture: "caught-up",
        slug: frontmatter.slug,
        date: pkg.date ?? "",
        title: frontmatter.title,
        dek: frontmatter.dek,
        points: [
          ...(frontmatter.what_changed ?? []),
          ...(frontmatter.why_it_matters ?? []),
          ...(frontmatter.uncertainty ?? []).slice(0, 1)
        ],
        hasHero: Boolean((pkg.image as { hero_bytes_base64?: unknown } | undefined)?.hero_bytes_base64),
        heroCredit: creditOf(pkg.image)
      }));
    }
  }
  return summaries;
}

/**
 * Every article the studio can render, newest first.
 *
 * A recorded summary always wins over a derived one for the same article: if delivery wrote a
 * summary, that is what was sent, and re-deriving it from a package that may since have been
 * corrected would show the owner something that never left the building.
 */
export async function readStudioArticles(root = repositoryRoot()): Promise<StudioArticle[]> {
  const [recorded, mmaFiles, dneskai] = await Promise.all([
    recordedSummaries(root),
    mmaFilesSummaries(root),
    dneskaiSummaries(root)
  ]);
  const byId = new Map<string, StudioArticle>();
  const add = (summary: CarouselSummary, origin: StudioArticle["origin"]) => {
    // The shared summary contract now knows Kvórum, but this article-backed rail does not until
    // its approval route supplies the recipe and copy records that the workspace also requires.
    if (summary.venture === "kvorum") return;
    // Venture, slug *and* date. Three MMA packages redeliver one event and share a slug, so a
    // slug-keyed map collapsed them into one article and the Lab could only ever show the first.
    const id = `${summary.venture}:${summary.slug}:${summary.date}`;
    if (byId.has(id) && origin === "derived") return;
    byId.set(id, {
      id,
      venture: summary.venture,
      ventureLabel: VENTURE_LABEL[summary.venture],
      summary,
      origin,
      problems: reviewCarouselSummary(summary).problems
    });
  };
  for (const summary of recorded.values()) add(summary, "recorded");
  for (const summary of [...dneskai, ...mmaFiles]) add(summary, "derived");
  return [...byId.values()].sort((left, right) =>
    right.summary.date.localeCompare(left.summary.date) || left.id.localeCompare(right.id));
}
