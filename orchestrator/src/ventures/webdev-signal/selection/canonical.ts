import { createHash } from "node:crypto";
import type { WebDevSelectionConfig } from "./config.js";

export class WebDevCanonicalizationError extends Error {}

function projectKey(value: string): string {
  return value.toLocaleLowerCase("en").normalize("NFKD").replace(/[^a-z0-9]+/gu, "");
}

export function canonicalizeWebDevProject(value: string, config: WebDevSelectionConfig): string {
  const trimmed = value.trim();
  if (!trimmed) throw new WebDevCanonicalizationError("project-empty");
  return config.projectAliases[projectKey(trimmed)] ?? trimmed.slice(0, 120);
}

function unwrap(url: URL, config: WebDevSelectionConfig): URL {
  const wrapper = config.redirectWrappers.find((entry) => entry.host === url.hostname && entry.path === url.pathname);
  if (!wrapper) return url;
  const target = url.searchParams.get(wrapper.targetParameter);
  if (!target) return url;
  try {
    const parsed = new URL(target);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed : url;
  } catch {
    return url;
  }
}

export function canonicalizeWebDevUrl(value: string, config: WebDevSelectionConfig): string {
  let url: URL;
  try {
    url = unwrap(new URL(value), config);
  } catch {
    throw new WebDevCanonicalizationError("url-invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new WebDevCanonicalizationError("url-must-be-credential-free-https");
  }
  url.hash = "";
  url.hostname = url.hostname.toLocaleLowerCase("en");
  url.pathname = url.pathname.replace(/\/{2,}/gu, "/");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  const entries = [...url.searchParams.entries()]
    .filter(([name]) => {
      const lowered = name.toLocaleLowerCase("en");
      return !config.trackingParameters.includes(lowered)
        && !config.trackingPrefixes.some((prefix) => lowered.startsWith(prefix));
    })
    .sort(([leftName, leftValue], [rightName, rightValue]) => leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue));
  url.search = "";
  for (const [name, parameterValue] of entries) url.searchParams.append(name, parameterValue);
  return url.toString();
}

export function normalizeWebDevVersion(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().replace(/^version\s+/iu, "").replace(/^v(?=\d)/u, "");
  return normalized || null;
}

export function explicitWebDevIdentifier(value: string | null): string | null {
  if (!value) return null;
  const advisory = value.match(/\b(?:GHSA-[a-z0-9-]+|CVE-\d{4}-\d{4,})\b/iu)?.[0];
  if (advisory) return advisory.toLocaleLowerCase("en");
  const version = value.match(/\bv?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?\b/u)?.[0];
  return normalizeWebDevVersion(version ?? null)?.toLocaleLowerCase("en") ?? null;
}

export function stableWebDevRecordId(input: {
  canonicalUrl: string;
  project: string;
  explicitIdentifier: string | null;
  config: WebDevSelectionConfig;
}): string {
  const material = [
    input.config.canonicalizationVersion,
    projectKey(canonicalizeWebDevProject(input.project, input.config)),
    canonicalizeWebDevUrl(input.canonicalUrl, input.config),
    input.explicitIdentifier ?? "none"
  ].join("|");
  return `wds_${createHash("sha256").update(material).digest("hex").slice(0, 24)}`;
}
