import {
  SocialCopyPackSchema,
  derivedCopyPack,
  deskCopyPack,
  type SocialCopyPack
} from "@boardlessai/carousel-studio";
import { atomicWriteJson } from "../state.js";
import type { ArticlePackage } from "../contracts/mma-files.js";
import type { EditionPackage } from "../contracts/edition-package.js";

/**
 * The copy pack, recorded beside the carousel summary.
 *
 * Captions used to exist only as a concatenation performed inside the queue path, so nothing
 * outside that path could read one: the Lab had a deck and no words, and an export was
 * impossible. Recording it at delivery is inventory rather than composition — it needs no enabled
 * channel and posts nothing — and it means the words a reader will see were written by the desk
 * that wrote the article rather than assembled at the last moment.
 */

export function socialCopyPath(pack: Pick<SocialCopyPack, "venture" | "slug" | "date">): string {
  return `ventures/carousel-studio/social-copy/${pack.venture}/${pack.date}-${pack.slug}.json`;
}

/** The attribution line, flattened the way the delivery verifier flattens it. */
function creditOf(attribution: string | undefined): string | null {
  if (typeof attribution !== "string") return null;
  const credit = attribution.replaceAll(/<[^>]+>/gu, " ").replaceAll(/\s+/gu, " ").trim();
  return credit.length > 0 ? credit : null;
}

export interface StoredSocialCopy {
  path: string;
  pack: SocialCopyPack;
}

export function articleCopyPack(article: ArticlePackage): SocialCopyPack | null {
  const cs = article.localizations?.cs as {
    title?: string;
    dek?: string;
    igCaption?: string;
    hashtags?: string[];
    threadsText?: string;
    storyLine?: string;
  } | undefined;
  if (!cs?.title || !cs.dek) return null;
  const common = {
    venture: "mma-files" as const,
    slug: article.slug,
    date: article.publishAt.slice(0, 10),
    heroCredit: creditOf(article.image?.license?.attribution_html)
  };
  // The desk's own copy when it wrote all four; otherwise the deterministic concatenation the
  // queue path has always used, so an article written before these fields existed still has words.
  if (cs.igCaption && cs.threadsText && cs.storyLine) {
    return deskCopyPack({
      ...common,
      copy: { igCaption: cs.igCaption, hashtags: cs.hashtags ?? [], threadsText: cs.threadsText, storyLine: cs.storyLine }
    });
  }
  return derivedCopyPack({
    ...common,
    headline: cs.title,
    standfirst: cs.dek,
    closing: "Celý ozdrojovaný text najdete v MMA Files."
  });
}

export function editionCopyPack(editionPackage: EditionPackage): SocialCopyPack | null {
  if (editionPackage.status !== "edition") return null;
  const frontmatter = editionPackage.article.cs.frontmatter as {
    slug?: string;
    title?: string;
    dek?: string;
    tags?: string[];
    social_copy?: { igCaption: string; hashtags: string[]; threadsText: string; storyLine: string };
  };
  if (!frontmatter?.slug || !frontmatter.title || !frontmatter.dek) return null;
  const common = {
    venture: "caught-up" as const,
    slug: frontmatter.slug,
    date: editionPackage.date,
    heroCredit: creditOf(editionPackage.image?.license?.attribution_html)
  };
  if (frontmatter.social_copy) return deskCopyPack({ ...common, copy: frontmatter.social_copy });
  return derivedCopyPack({
    ...common,
    headline: frontmatter.title,
    standfirst: frontmatter.dek,
    closing: "Jedno vydání a máte přehled.",
    ...(frontmatter.tags ? { tags: frontmatter.tags } : {})
  });
}

export async function storeSocialCopyPack(root: string, pack: SocialCopyPack): Promise<StoredSocialCopy> {
  const validated = SocialCopyPackSchema.parse(pack);
  const path = socialCopyPath(validated);
  await atomicWriteJson(root, path, validated);
  return { path, pack: validated };
}
