import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EditorialReviewSchema } from "../contracts/editorial-review.js";
import { EditionPackageSchema } from "../contracts/edition-package.js";
import { approvedEditorialPackage } from "../edition/review.js";
import { readJson } from "../state.js";
import { parseSourcePacket, sha256, type SourcePacket } from "./contract.js";

export const NEWS_FRESHNESS_HOURS = 72;
export const RetractionSchema = z.strictObject({ schemaVersion: z.literal("marketing-source-retraction/1"),
  sourceId: z.string().min(1).max(200), actor: z.literal("owner"), reason: z.string().min(1).max(250),
  retractedAt: z.iso.datetime({ offset: true }) });
export const retractionPath = (sourceId: string) => `marketing-source/retractions/${sha256(sourceId)}.json`;

export interface SourceReader {
  read(relative: string): Promise<unknown>;
  list(relative: string): Promise<string[]>;
}
export function localSourceReader(root: string): SourceReader {
  return { read: relative => readJson(root, relative, null),
    list: async relative => (await readdir(path.join(root, relative)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []; throw error;
    })).filter(file => /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/u.test(file)).sort() };
}
export type SourceStatus = { sourceId: string; status: "approved" | "held" | "unavailable" | "no-edition"; reason: string; packet: SourcePacket | null };

export async function readNoEditionDates(reader: SourceReader): Promise<{ dates: string[]; dropped: number }> {
  const dates = new Set<string>();
  let dropped = 0;
  const Receipt = z.object({ schemaVersion: z.literal(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    packageHash: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(["delivered", "needs_reconciliation"]), editionStatus: z.enum(["edition", "no_edition"]) });
  for (const directory of ["edition/outbox", "edition/deliveries"]) {
    const files = await reader.list(directory);
    for (let offset = 0; offset < files.length; offset += 8) await Promise.all(files.slice(offset, offset + 8).map(async file => {
      try {
        const raw = await reader.read(`${directory}/${file}`);
        if (directory === "edition/outbox") {
          const parsed = EditionPackageSchema.safeParse(raw);
          if (!parsed.success) dropped++;
          else if (parsed.data.status === "no_edition") dates.add(parsed.data.date);
        } else {
          const parsed = Receipt.safeParse(raw);
          if (!parsed.success) dropped++;
          else if (parsed.data.editionStatus === "no_edition") dates.add(parsed.data.date);
        }
      } catch { dropped++; }
    }));
  }
  return { dates: [...dates].sort(), dropped };
}

export function articlePacket(input: { edition: Extract<ReturnType<typeof EditionPackageSchema.parse>, { status: "edition" }>;
  siteUrl: string; now: Date; freshnessHours: number }): SourcePacket {
  const article = input.edition.article.cs;
  const image = input.edition.image;
  const base = new URL(input.siteUrl);
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("DNESKAi site must use HTTPS");
  const content = {
    title: article.frontmatter.title, body: article.body,
    category: article.frontmatter.categories?.join(",") ?? "", difficulty: null, code: null, options: [], answer: null, explanation: null,
    evidence: article.frontmatter.sources.map(source => ({ url: source.url, title: source.title,
      excerpt: source.supports?.join("\n") ?? "", checkedAt: article.frontmatter.generation.generated_at })),
    image: { url: new URL(image.hero_path.replace(/^public/u, ""), base).href, alt: image.alt_cs,
      licence: JSON.stringify({ origin: image.origin, ...image.license }) }
  };
  const expiresAt = new Date(Date.parse(article.frontmatter.generation.generated_at) + input.freshnessHours * 3600_000).toISOString();
  // Expiry remains anchored to the authored evidence snapshot; rechecking approval cannot renew news.
  return parseSourcePacket({ schemaVersion: "marketing-source/1", brand: "dneskai", kind: "article", locale: "cs",
    sourceId: article.frontmatter.slug, sourceRevision: input.edition.idempotencyKey, contentHash: sha256(content),
    canonicalUrl: new URL(`/articles/${article.frontmatter.slug}`, base).href, observedAt: input.now.toISOString(), expiresAt,
    eligible: true, eligibilityReason: "owner-approved-article; social approval required separately", content });
}

/** The caller supplies the owning current-state reader, including remote-read failure semantics. */
export async function readSources(input: { reader: SourceReader; siteUrl: string; now: Date; freshnessHours: number;
  sourceIds?: string[] }): Promise<{ sources: SourceStatus[]; dropped: number }> {
  const sources: SourceStatus[] = [];
  let dropped = 0;
  const files = await input.reader.list("editorial/reviews");
  const candidates = files.filter(file => /^[a-f0-9]{64}\.json$/u.test(file));
  const inspect = async (file: string) => {
    let review;
    try { review = EditorialReviewSchema.safeParse(await input.reader.read(`editorial/reviews/${file}`)); }
    catch { dropped++; return; }
    if (!review.success || review.data.package.status !== "edition") { dropped++; return; }
    const sourceId = review.data.package.article.cs.frontmatter.slug;
    if (input.sourceIds && !input.sourceIds.includes(sourceId)) return;
    try {
      const decision = await input.reader.read(`editorial/decisions/${file}`);
      const approved = approvedEditorialPackage(review.data, decision);
      const retraction = await input.reader.read(retractionPath(sourceId));
      if (retraction !== null) {
        const parsed = RetractionSchema.safeParse(retraction);
        sources.push({ sourceId, status: "held", reason: parsed.success && parsed.data.sourceId === sourceId
          ? `owner-retraction:${parsed.data.reason}` : "invalid-retraction-record", packet: null });
        return;
      }
      if (!approved || approved.status !== "edition") {
        sources.push({ sourceId, status: "held", reason: "missing-rejected-or-stale-article-approval", packet: null });
      } else {
        sources.push({ sourceId, status: "approved", reason: "article-approved", packet: articlePacket({ ...input, edition: approved }) });
      }
    } catch { sources.push({ sourceId, status: "unavailable", reason: "article-record-or-packet-unavailable", packet: null }); dropped++; }
  };
  for (let offset = 0; offset < candidates.length; offset += 8) await Promise.all(candidates.slice(offset, offset + 8).map(inspect));
  // A same-slug edit with conflicting reviews is held until the owner reconciles it.
  const identities = new Map<string, SourceStatus>();
  for (const source of sources) {
    if (identities.has(source.sourceId)) identities.set(source.sourceId, { sourceId: source.sourceId, status: "held", reason: "conflicting-article-reviews", packet: null });
    else identities.set(source.sourceId, source);
  }
  for (const id of input.sourceIds ?? []) if (!identities.has(id)) identities.set(id, { sourceId: id, status: "unavailable", reason: "source-not-found", packet: null });
  return { sources: [...identities.values()].sort((left, right) => left.sourceId < right.sourceId ? -1 : 1), dropped };
}
