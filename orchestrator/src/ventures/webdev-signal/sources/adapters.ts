import { createHash } from "node:crypto";
import Parser from "rss-parser";
import type { WebDevCandidate, WebDevSource } from "../../../contracts/webdev-signal.js";
import { WebDevCandidateSchema } from "../../../contracts/webdev-signal.js";
import { sanitizeExternalContent } from "../../../security/content.js";

const feedParser = new Parser({ timeout: 5_000 });

export interface WebDevAdapterResult {
  candidates: WebDevCandidate[];
  itemsSeen: number;
  malformedItems: number;
  filteredItems: number;
  layoutFingerprint: string;
  empty: boolean;
}

export class WebDevAdapterError extends Error {}

interface AdapterContext {
  fetchedAt: string;
  fixture: boolean;
}

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: unknown, maximum: number): string {
  return sanitizeExternalContent(typeof value === "string" ? value : "", maximum).text.slice(0, maximum).trim();
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function exactHttps(value: unknown, host?: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (host && url.hostname !== host)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sourceItemId(value: unknown, fallback: string): string {
  const raw = bounded(value, 240);
  return raw || `sha256:${hash(fallback).slice(0, 32)}`;
}

function layoutFingerprint(parserId: string, values: readonly unknown[]): string {
  const keys = [...new Set(values.flatMap((value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>)
    : [typeof value]))].sort();
  return hash(JSON.stringify({ parserId, keys }));
}

function hints(source: WebDevSource): WebDevCandidate["changeKindHints"] {
  return source.authority === "secondary-discovery" ? ["lead-only"] : source.changeKinds;
}

function versionFromText(value: string): string | null {
  return value.match(/\bv?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?\b/u)?.[0]
    ?? value.match(/\b(?:Chrome|Firefox|Safari)\s+(\d+)\b/iu)?.[1]
    ?? null;
}

function candidate(input: {
  source: WebDevSource;
  context: AdapterContext;
  sourceItemId: string;
  listingUrl: string;
  targetUrl: string;
  canonicalProjectUrl: string;
  title: string;
  summary: string;
  author: string | null;
  publishedAt: string;
  updatedAt: string | null;
  versionText: string | null;
  securityText: string | null;
}): WebDevCandidate {
  const evidenceRef = `source:${input.source.id}:${hash(`${input.sourceItemId}:${input.targetUrl}`).slice(0, 24)}`;
  const contentHash = hash(JSON.stringify({
    id: input.sourceItemId,
    title: input.title,
    summary: input.summary,
    targetUrl: input.targetUrl,
    publishedAt: input.publishedAt,
    updatedAt: input.updatedAt,
    versionText: input.versionText,
    securityText: input.securityText
  }));
  return WebDevCandidateSchema.parse({
    schemaVersion: "webdev-candidate/1",
    sourceId: input.source.id,
    sourceItemId: input.sourceItemId,
    listingUrl: input.listingUrl,
    targetUrl: input.targetUrl,
    canonicalProjectUrl: input.canonicalProjectUrl,
    title: input.title,
    summary: input.summary,
    author: input.author,
    project: input.source.project,
    publishedAt: input.publishedAt,
    updatedAt: input.updatedAt,
    versionText: input.versionText,
    securityText: input.securityText,
    topicHints: input.source.topics.slice(0, 8),
    changeKindHints: hints(input.source).slice(0, 8),
    language: input.source.locale,
    contentHash,
    provenance: {
      authority: input.source.authority,
      parserId: input.source.parser.id,
      parserVersion: input.source.parser.version,
      fetchedAt: input.context.fetchedAt,
      evidenceRefs: [evidenceRef],
      fixture: input.context.fixture
    }
  });
}

async function parseFeed(source: WebDevSource, body: Uint8Array, context: AdapterContext): Promise<WebDevAdapterResult> {
  let parsed: Awaited<ReturnType<typeof feedParser.parseString>>;
  try {
    parsed = await feedParser.parseString(new TextDecoder().decode(body));
  } catch (error) {
    throw new WebDevAdapterError(`feed-layout-invalid:${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`);
  }
  const items = parsed.items ?? [];
  const candidates: WebDevCandidate[] = [];
  let malformedItems = 0;
  for (const raw of items) {
    try {
      const item = raw as unknown as Record<string, unknown>;
      const targetUrl = exactHttps(item.link, source.canonicalHost);
      const title = bounded(item.title, 240);
      const summary = bounded(item.contentSnippet ?? item.summary ?? item.content ?? item.title, 800);
      const publishedAt = iso(item.isoDate ?? item.pubDate);
      if (!targetUrl || !title || !summary || !publishedAt) throw new Error("required feed fields missing");
      const id = sourceItemId(item.guid ?? item.id, targetUrl);
      candidates.push(candidate({
        source,
        context,
        sourceItemId: id,
        listingUrl: source.endpoint,
        targetUrl,
        canonicalProjectUrl: new URL("/", source.endpoint).toString(),
        title,
        summary,
        author: bounded(item.creator ?? item.author, 120) || null,
        publishedAt,
        updatedAt: iso(item.updated),
        versionText: versionFromText(`${title} ${summary}`),
        securityText: source.changeKinds.includes("security-advisory") && /\b(?:security|vulnerab|cve-)\b/iu.test(`${title} ${summary}`)
          ? bounded(summary, 500)
          : null
      }));
    } catch {
      malformedItems += 1;
    }
  }
  return finish(source, items, candidates, malformedItems, 0);
}

function parseJsonArray(body: Uint8Array, label: string): unknown[] {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
    if (!Array.isArray(parsed)) throw new Error("top-level value is not an array");
    return parsed;
  } catch (error) {
    throw new WebDevAdapterError(`${label}-layout-invalid:${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`);
  }
}

function parseReleases(source: WebDevSource, body: Uint8Array, context: AdapterContext): WebDevAdapterResult {
  const items = parseJsonArray(body, "release");
  const candidates: WebDevCandidate[] = [];
  let malformedItems = 0;
  let filteredItems = 0;
  const repository = source.repositoryRef;
  if (!repository) throw new WebDevAdapterError("release-repository-allowlist-missing");
  for (const value of items) {
    try {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("release is not an object");
      const item = value as Record<string, unknown>;
      if (item.draft === true) {
        filteredItems += 1;
        continue;
      }
      const targetUrl = exactHttps(item.html_url, "github.com");
      const tag = bounded(item.tag_name, 160);
      const title = bounded(item.name ?? item.tag_name, 240);
      const summary = bounded(item.body ?? item.name ?? item.tag_name, 800);
      const publishedAt = iso(item.published_at ?? item.created_at);
      if (!targetUrl || !targetUrl.includes(`github.com/${repository}/releases/`) || !tag || !title || !summary || !publishedAt) {
        throw new Error("required release fields missing");
      }
      const id = sourceItemId(item.id ?? item.node_id ?? tag, targetUrl);
      candidates.push(candidate({
        source,
        context,
        sourceItemId: id,
        listingUrl: source.endpoint,
        targetUrl,
        canonicalProjectUrl: `https://github.com/${repository}`,
        title,
        summary,
        author: item.author && typeof item.author === "object" ? bounded((item.author as Record<string, unknown>).login, 120) || null : null,
        publishedAt,
        updatedAt: iso(item.updated_at),
        versionText: tag,
        securityText: /\b(?:security|vulnerab|cve-)\b/iu.test(`${title} ${summary}`) ? bounded(summary, 500) : null
      }));
    } catch {
      malformedItems += 1;
    }
  }
  return finish(source, items, candidates, malformedItems, filteredItems);
}

function advisoryVersionText(item: Record<string, unknown>): string | null {
  if (!Array.isArray(item.vulnerabilities)) return null;
  const scopes: string[] = [];
  for (const value of item.vulnerabilities) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const vulnerability = value as Record<string, unknown>;
    const pkg = vulnerability.package && typeof vulnerability.package === "object"
      ? vulnerability.package as Record<string, unknown>
      : {};
    if (bounded(pkg.ecosystem, 40).toLowerCase() !== "npm") continue;
    const name = bounded(pkg.name, 80);
    const affected = bounded(vulnerability.vulnerable_version_range, 100);
    const fixed = bounded(vulnerability.first_patched_version, 100);
    if (name && affected) scopes.push(`${name} affected ${affected}${fixed ? ` fixed ${fixed}` : ""}`);
  }
  return scopes.length > 0 ? scopes.join("; ").slice(0, 160) : null;
}

function parseAdvisories(source: WebDevSource, body: Uint8Array, context: AdapterContext): WebDevAdapterResult {
  const items = parseJsonArray(body, "advisory");
  const candidates: WebDevCandidate[] = [];
  let malformedItems = 0;
  let filteredItems = 0;
  for (const value of items) {
    try {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("advisory is not an object");
      const item = value as Record<string, unknown>;
      const targetUrl = exactHttps(item.html_url, "github.com");
      const ghsa = bounded(item.ghsa_id, 120);
      const title = bounded(item.summary, 240);
      const description = bounded(item.description ?? item.summary, 800);
      const publishedAt = iso(item.published_at);
      const versionText = advisoryVersionText(item);
      if (!targetUrl || !targetUrl.includes("github.com/advisories/") || !ghsa || !title || !description || !publishedAt || !versionText) {
        throw new Error("required advisory fields missing");
      }
      if (item.type !== undefined && item.type !== "reviewed") {
        filteredItems += 1;
        continue;
      }
      const severity = bounded(item.severity, 40) || "unknown";
      candidates.push(candidate({
        source,
        context,
        sourceItemId: ghsa,
        listingUrl: source.endpoint,
        targetUrl,
        canonicalProjectUrl: "https://github.com/advisories",
        title,
        summary: description,
        author: "GitHub Advisory Database",
        publishedAt,
        updatedAt: iso(item.updated_at),
        versionText,
        securityText: bounded(`${ghsa}; severity ${severity}; ${versionText}`, 500)
      }));
    } catch {
      malformedItems += 1;
    }
  }
  return finish(source, items, candidates, malformedItems, filteredItems);
}

function finish(
  source: WebDevSource,
  items: readonly unknown[],
  candidates: WebDevCandidate[],
  malformedItems: number,
  filteredItems: number
): WebDevAdapterResult {
  const ordered = [...candidates]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.sourceItemId.localeCompare(right.sourceItemId))
    .slice(0, source.limits.itemCapPerRun);
  return {
    candidates: ordered,
    itemsSeen: items.length,
    malformedItems,
    filteredItems: filteredItems + Math.max(0, candidates.length - ordered.length),
    layoutFingerprint: layoutFingerprint(source.parser.id, items),
    empty: items.length === 0
  };
}

export async function parseWebDevSource(
  source: WebDevSource,
  body: Uint8Array,
  context: AdapterContext
): Promise<WebDevAdapterResult> {
  switch (source.sourceKind) {
    case "rss":
    case "atom":
      return parseFeed(source, body, context);
    case "github-releases":
      return parseReleases(source, body, context);
    case "github-advisories":
      return parseAdvisories(source, body, context);
    default:
      throw new WebDevAdapterError(`unsupported-source-kind:${source.sourceKind}`);
  }
}
