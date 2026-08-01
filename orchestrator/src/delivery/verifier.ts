import { createHash } from "node:crypto";
import { load as loadHtml } from "cheerio";
import sharp from "sharp";
import { ReleaseProofSchema, type ArticleImage, type ReleaseProof } from "../contracts/autonomy.js";
import { safeFetch } from "../security/url.js";

type ReleaseCheck = ReleaseProof["checks"][number];

export interface ReleasePageSnapshot {
  locale: "en" | "cs";
  url: string;
  status: number;
  html: string;
}

export interface ReleaseSnapshot {
  venture: "caught-up" | "mma-files";
  slug: string;
  packageHash: string;
  titles: { en: string; cs: string };
  pages: { en: ReleasePageSnapshot; cs: ReleasePageSnapshot };
  image: ArticleImage;
  imageUrl: string;
  imageStatus: number;
  imageBytes: Uint8Array;
}

function check(name: ReleaseCheck["name"], passed: boolean, detail: string, now: Date): ReleaseCheck {
  return {
    name,
    status: passed ? "pass" : "fail",
    detail: detail.replace(/\s+/gu, " ").trim().slice(0, 500) || (passed ? "passed" : "failed"),
    checkedAt: now.toISOString()
  };
}

function pageFacts(page: ReleasePageSnapshot, title: string, slug: string, packageHash: string) {
  const $ = loadHtml(page.html);
  const renderedTitle = $("h1").first().text().replace(/\s+/gu, " ").trim();
  const marker = $('meta[name="boardless-content-hash"]').attr("content") ?? "";
  let path = "";
  try {
    path = new URL(page.url).pathname;
  } catch {
    path = page.url;
  }
  return {
    route: page.status === 200 && page.html.trim().length > 0,
    titleAndSlug: renderedTitle === title && path.includes(`/articles/${slug}`),
    marker: marker === packageHash,
    text: $.root().text().replace(/\s+/gu, " ").trim()
  };
}

export async function verifyReleaseSnapshot(snapshot: ReleaseSnapshot, now = new Date()): Promise<ReleaseCheck[]> {
  const en = pageFacts(snapshot.pages.en, snapshot.titles.en, snapshot.slug, snapshot.packageHash);
  const cs = pageFacts(snapshot.pages.cs, snapshot.titles.cs, snapshot.slug, snapshot.packageHash);
  let dimensions = { width: 0, height: 0 };
  try {
    const metadata = await sharp(snapshot.imageBytes).metadata();
    dimensions = { width: metadata.width ?? 0, height: metadata.height ?? 0 };
  } catch {
    dimensions = { width: 0, height: 0 };
  }
  const attributionNeedle = snapshot.image.license.attribution_html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
  const attributionPresent = snapshot.image.origin === "svg" || [en.text, cs.text].every((text) =>
    text.includes(attributionNeedle) || (text.includes(snapshot.image.license.author) && text.includes(snapshot.image.license.name))
  );
  return [
    check("english-route", en.route, `${snapshot.pages.en.status} ${snapshot.pages.en.url}`, now),
    check("czech-route", cs.route, `${snapshot.pages.cs.status} ${snapshot.pages.cs.url}`, now),
    check("title-slug", en.titleAndSlug && cs.titleAndSlug, en.titleAndSlug && cs.titleAndSlug ? `Both locale titles and ${snapshot.slug} match` : "A locale title or slug does not match", now),
    check("content-hash", en.marker && cs.marker, en.marker && cs.marker ? `Both pages expose ${snapshot.packageHash}` : "A locale is missing the package hash marker", now),
    check("hero-image", snapshot.imageStatus === 200 && snapshot.imageBytes.byteLength > 0, `${snapshot.imageStatus} ${snapshot.imageUrl}`, now),
    check("image-dimensions", dimensions.width === snapshot.image.width && dimensions.height === snapshot.image.height, `${dimensions.width}x${dimensions.height}; expected ${snapshot.image.width}x${snapshot.image.height}`, now),
    check("attribution", attributionPresent, snapshot.image.origin === "svg" ? "FRAME fallback needs no external photo credit" : `${snapshot.image.license.author} · ${snapshot.image.license.name}`, now)
  ];
}

async function githubChecks(input: { repository: string; commit: string; token: string; now: Date }): Promise<ReleaseCheck[]> {
  const headers = {
    Authorization: `Bearer ${input.token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "boardlessai-release-verifier",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  let commitPresent = false;
  try {
    await safeFetch(`https://api.github.com/repos/${input.repository}/commits/${input.commit}`, {
      allowHosts: ["api.github.com"], headers, maxBytes: 1_000_000, timeoutMs: 10_000
    });
    commitPresent = true;
  } catch {
    commitPresent = false;
  }
  let ciState = "pending";
  try {
    const [statusResponse, checksResponse] = await Promise.all([
      safeFetch(`https://api.github.com/repos/${input.repository}/commits/${input.commit}/status`, {
        allowHosts: ["api.github.com"], headers, maxBytes: 1_000_000, timeoutMs: 10_000
      }),
      safeFetch(`https://api.github.com/repos/${input.repository}/commits/${input.commit}/check-runs`, {
        allowHosts: ["api.github.com"], headers, maxBytes: 1_000_000, timeoutMs: 10_000
      })
    ]);
    const status = JSON.parse(new TextDecoder().decode(statusResponse.body)) as { state?: unknown; statuses?: unknown[] };
    const checks = JSON.parse(new TextDecoder().decode(checksResponse.body)) as { check_runs?: Array<{ status?: unknown; conclusion?: unknown }> };
    const runs = checks.check_runs ?? [];
    const checksPassed = runs.length > 0 && runs.every((run) => run.status === "completed" && ["success", "neutral", "skipped"].includes(String(run.conclusion)));
    const statusesPresent = Array.isArray(status.statuses) && status.statuses.length > 0;
    ciState = status.state === "success" || checksPassed
      ? "success"
      : status.state === "failure" || status.state === "error" || runs.some((run) => run.status === "completed" && !["success", "neutral", "skipped"].includes(String(run.conclusion)))
        ? "failure"
        : statusesPresent || runs.length > 0 ? "pending" : "missing";
  } catch {
    ciState = "unavailable";
  }
  return [
    check("target-commit", commitPresent, commitPresent ? `Target commit ${input.commit} is readable` : `Target commit ${input.commit} is not readable`, input.now),
    check("target-ci", ciState === "success", `Target CI state: ${ciState}`, input.now)
  ];
}

async function publicSnapshot(input: {
  venture: "caught-up" | "mma-files";
  slug: string;
  packageHash: string;
  titles: { en: string; cs: string };
  image: ArticleImage;
  baseUrl: string;
  now: Date;
}): Promise<ReleaseSnapshot> {
  const baseUrl = input.baseUrl.replace(/\/$/u, "");
  const cacheBust = encodeURIComponent(`${input.packageHash.slice(0, 12)}-${input.now.getTime()}`);
  const enUrl = `${baseUrl}/en/articles/${input.slug}?boardless_verify=${cacheBust}`;
  const csUrl = `${baseUrl}/cs/articles/${input.slug}?boardless_verify=${cacheBust}`;
  const imageUrl = `${baseUrl}${input.image.hero_path.replace(/^public/u, "")}?boardless_verify=${cacheBust}`;
  const host = new URL(baseUrl).hostname;
  const fetchPage = async (locale: "en" | "cs", url: string): Promise<ReleasePageSnapshot> => {
    try {
      const response = await safeFetch(url, { allowHosts: [host], maxBytes: 2_000_000, timeoutMs: 12_000 });
      return { locale, url, status: 200, html: new TextDecoder().decode(response.body) };
    } catch (error) {
      return { locale, url, status: 0, html: error instanceof Error ? error.message : "request failed" };
    }
  };
  const [en, cs, imageResponse] = await Promise.all([
    fetchPage("en", enUrl),
    fetchPage("cs", csUrl),
    safeFetch(imageUrl, { allowHosts: [host], maxBytes: 1_000_000, timeoutMs: 12_000 }).catch(() => null)
  ]);
  return {
    venture: input.venture,
    slug: input.slug,
    packageHash: input.packageHash,
    titles: input.titles,
    pages: { en, cs },
    image: input.image,
    imageUrl,
    imageStatus: imageResponse ? 200 : 0,
    imageBytes: imageResponse?.body ?? new Uint8Array()
  };
}

export async function verifyDeployedRelease(input: {
  venture: "caught-up" | "mma-files";
  packageHash: string;
  slug: string;
  titles: { en: string; cs: string };
  image: ArticleImage;
  targetRepository: "lukaskourilcz/aifirst" | "lukaskourilcz/mma-files";
  targetCommit: string;
  deploymentUrl: string;
  githubToken: string;
  retryCount: 0 | 1;
  timeoutMs?: number;
  pollMs?: number;
  now?: () => Date;
}): Promise<ReleaseProof> {
  const now = input.now ?? (() => new Date());
  const started = now();
  const deadline = started.getTime() + (input.timeoutMs ?? 15 * 60_000);
  let checks: ReleaseCheck[] = [];
  do {
    const checkedAt = now();
    const [repositoryChecks, snapshot] = await Promise.all([
      githubChecks({ repository: input.targetRepository, commit: input.targetCommit, token: input.githubToken, now: checkedAt }),
      publicSnapshot({
        venture: input.venture,
        slug: input.slug,
        packageHash: input.packageHash,
        titles: input.titles,
        image: input.image,
        baseUrl: input.deploymentUrl,
        now: checkedAt
      })
    ]);
    checks = [...repositoryChecks, ...await verifyReleaseSnapshot(snapshot, checkedAt)];
    if (checks.every((item) => item.status === "pass")) break;
    if (now().getTime() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, input.pollMs ?? 20_000));
  } while (true);
  const completed = now();
  const status = checks.every((item) => item.status === "pass") ? "passed" : "failed";
  const id = createHash("sha256").update(`${input.venture}:${input.packageHash}`).digest("hex").slice(0, 16);
  return ReleaseProofSchema.parse({
    schemaVersion: "release-proof/1",
    id: `proof-${id}`,
    venture: input.venture,
    packageHash: input.packageHash,
    targetRepository: input.targetRepository,
    targetCommit: input.targetCommit,
    deploymentUrl: input.deploymentUrl,
    checks,
    retryCount: input.retryCount,
    status,
    startedAt: started.toISOString(),
    completedAt: completed.toISOString()
  });
}
