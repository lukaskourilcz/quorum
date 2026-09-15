import type { WebDevSource } from "../../contracts/webdev-signal.js";
import { collectableWebDevSources, type WebDevSourceRegistry } from "./sources/registry.js";

/**
 * The bodies a dry run reads instead of the network.
 *
 * Invented on purpose and dated relative to the run, so a rehearsal on any day exercises the whole
 * chain — prefilter, clustering, selection, both packages and the render — instead of dropping
 * everything as stale. Three sources carry one invented item each, one per adapter kind; every
 * other enabled source gets a valid empty body, which is what a quiet feed looks like and keeps
 * the receipt free of "fixture-body-missing" lines that would read as a broken day. Every title
 * says it is invented, and the collector stamps each candidate `fixture: true`.
 */

const encoder = new TextEncoder();

function hoursBefore(now: string, hours: number): string {
  return new Date(Date.parse(now) - hours * 3_600_000).toISOString();
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function feedBody(source: WebDevSource, items: readonly string[]): Uint8Array {
  const home = new URL("/", source.endpoint).toString();
  return encoder.encode([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    `<title>${escapeXml(source.name)} (invented rehearsal feed)</title>`,
    `<link>${home}</link>`,
    "<description>Shape-preserving dry-run fixture; not a real announcement.</description>",
    ...items,
    "</channel></rss>",
    ""
  ].join("\n"));
}

function chromeItem(source: WebDevSource, now: string): string {
  const link = new URL("/blog/fixture-invented-css-capability/", source.endpoint).toString();
  return [
    "<item>",
    "<guid>fixture-chrome-stable-css</guid>",
    "<title>Chrome 141 ships an invented CSS capability to stable</title>",
    `<link>${link}</link>`,
    "<description>An invented rehearsal item: the stable release documents one CSS capability and a migration note for existing layouts.</description>",
    `<pubDate>${new Date(hoursBefore(now, 30)).toUTCString()}</pubDate>`,
    "</item>"
  ].join("");
}

function releasesBody(source: WebDevSource, now: string): Uint8Array {
  const repository = source.repositoryRef ?? "fixture/fixture";
  return encoder.encode(JSON.stringify([{
    id: 91001,
    tag_name: "v20.0.0",
    name: "Invented React 20.0.0",
    body: "An invented rehearsal release: a stable major with a bounded migration note for framework projects.",
    html_url: `https://github.com/${repository}/releases/tag/v20.0.0`,
    draft: false,
    prerelease: false,
    published_at: hoursBefore(now, 20),
    author: { login: "fixture-maintainer" }
  }]));
}

function advisoriesBody(now: string): Uint8Array {
  return encoder.encode(JSON.stringify([{
    ghsa_id: "GHSA-fixture-0001-0001",
    type: "reviewed",
    severity: "high",
    summary: "Invented npm package path traversal advisory",
    description: "An invented rehearsal advisory: affected versions of fixture-package allow path traversal, and the maintainers published a fixed version.",
    html_url: "https://github.com/advisories/GHSA-fixture-0001-0001",
    published_at: hoursBefore(now, 16),
    updated_at: hoursBefore(now, 15),
    vulnerabilities: [{
      package: { ecosystem: "npm", name: "fixture-package" },
      vulnerable_version_range: ">= 1.0.0, < 1.2.3",
      first_patched_version: "1.2.3"
    }]
  }]));
}

const STORY_SOURCES = {
  "chrome-developers": (source: WebDevSource, now: string) => feedBody(source, [chromeItem(source, now)]),
  "react-releases": releasesBody,
  "github-npm-advisories": (_source: WebDevSource, now: string) => advisoriesBody(now)
} as const;

function emptyBody(source: WebDevSource): Uint8Array {
  return source.sourceKind === "rss" || source.sourceKind === "atom"
    ? feedBody(source, [])
    : encoder.encode("[]");
}

export function webDevSignalFixtureBodies(registry: WebDevSourceRegistry, now: string): Record<string, Uint8Array> {
  const bodies: Record<string, Uint8Array> = {};
  for (const source of collectableWebDevSources(registry)) {
    const story = (STORY_SOURCES as Record<string, ((source: WebDevSource, now: string) => Uint8Array) | undefined>)[source.id];
    bodies[source.id] = story ? story(source, now) : emptyBody(source);
  }
  return bodies;
}
