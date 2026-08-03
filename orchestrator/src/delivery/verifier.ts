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

/**
 * Czech is the published locale; English is optional and on its way out.
 *
 * The verifier has to tolerate a Czech-only release *before* the first one exists. It fetches
 * whatever locales the package declares, so an English page that is no longer produced is an
 * absent locale rather than a failed check — the alternative is a checker that fetches a route
 * nobody publishes any more, fails closed, and reverts a commit that was perfectly good.
 */
export interface ReleaseSnapshot {
  venture: "caught-up" | "mma-files";
  slug: string;
  packageHash: string;
  titles: { en?: string; cs: string };
  pages: { en?: ReleasePageSnapshot; cs: ReleasePageSnapshot };
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
  const cs = pageFacts(snapshot.pages.cs, snapshot.titles.cs, snapshot.slug, snapshot.packageHash);
  // An English page counts only when the package declared one and it was actually fetched.
  // Anything weaker would let a half-built snapshot pass as "no English expected".
  const en = snapshot.pages.en && typeof snapshot.titles.en === "string"
    ? pageFacts(snapshot.pages.en, snapshot.titles.en, snapshot.slug, snapshot.packageHash)
    : null;
  const rendered = en === null ? [cs] : [en, cs];
  let dimensions = { width: 0, height: 0 };
  try {
    const metadata = await sharp(snapshot.imageBytes).metadata();
    dimensions = { width: metadata.width ?? 0, height: metadata.height ?? 0 };
  } catch {
    dimensions = { width: 0, height: 0 };
  }
  const attributionNeedle = snapshot.image.license.attribution_html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
  const attributionPresent = snapshot.image.origin === "svg" || rendered.every((page) =>
    page.text.includes(attributionNeedle) || (page.text.includes(snapshot.image.license.author) && page.text.includes(snapshot.image.license.name))
  );
  const titleAndSlug = rendered.every((page) => page.titleAndSlug);
  const marker = rendered.every((page) => page.marker);
  const published = en === null ? "The Czech page" : "Both pages";
  return [
    // Reported under its own name. Recording "no English was asked for" as an english-route
    // pass kept the proof at nine checks and above the contract's minimum of eight, but it
    // also made receipts/caught-up#bilingual_hero_rate — a KPI whose own label is "Editions
    // delivered in English and Czech" — read 1 on a day nothing bilingual shipped.
    en === null
      ? check("english-absent", true, "This package has no English locale", now)
      : check("english-route", en.route, `${snapshot.pages.en!.status} ${snapshot.pages.en!.url}`, now),
    check("czech-route", cs.route, `${snapshot.pages.cs.status} ${snapshot.pages.cs.url}`, now),
    check("title-slug", titleAndSlug, titleAndSlug ? `${published} and ${snapshot.slug} match` : "A locale title or slug does not match", now),
    check("content-hash", marker, marker ? `${published} expose ${snapshot.packageHash}` : "A locale is missing the package hash marker", now),
    check("hero-image", snapshot.imageStatus === 200 && snapshot.imageBytes.byteLength > 0, `${snapshot.imageStatus} ${snapshot.imageUrl}`, now),
    check("image-dimensions", dimensions.width === snapshot.image.width && dimensions.height === snapshot.image.height, `${dimensions.width}x${dimensions.height}; expected ${snapshot.image.width}x${snapshot.image.height}`, now),
    check("attribution", attributionPresent, snapshot.image.origin === "svg" ? "FRAME fallback needs no external photo credit" : `${snapshot.image.license.author} · ${snapshot.image.license.name}`, now)
  ];
}

export type CiState = "success" | "failure" | "pending" | "missing" | "unavailable";

/**
 * Decide a commit's CI state from whichever of the two GitHub signals could be read.
 *
 * A null argument means that endpoint was unreadable, which is not the same as reporting
 * nothing: an installation can hold the commit-statuses permission and not the checks one.
 * Only affirmative success passes, so an unreadable half never invents a green.
 */
export function resolveCiState(
  status: { state?: unknown; statuses?: unknown[] } | null,
  checks: { check_runs?: Array<{ status?: unknown; conclusion?: unknown }> } | null
): CiState {
  if (status === null && checks === null) return "unavailable";
  const runs = checks?.check_runs ?? [];
  const passedConclusions = ["success", "neutral", "skipped"];
  const runPassed = (run: { status?: unknown; conclusion?: unknown }) =>
    run.status === "completed" && passedConclusions.includes(String(run.conclusion));
  // Failure is decided first, because the two endpoints report different systems: /status is
  // the legacy commit-status API that Vercel writes to, /check-runs is where GitHub Actions
  // reports. Answering success on the first green signal let a deployed preview outvote a
  // red test suite on the same commit.
  if (status?.state === "failure" || status?.state === "error") return "failure";
  if (runs.some((run) => run.status === "completed" && !runPassed(run))) return "failure";
  if (status?.state === "success" || (runs.length > 0 && runs.every(runPassed))) return "success";
  const statusesPresent = Array.isArray(status?.statuses) && status.statuses.length > 0;
  return statusesPresent || runs.length > 0 ? "pending" : "missing";
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
  // Commit statuses and check runs are two separate GitHub read permissions, so an
  // installation can be allowed one and refused the other. Reading them together under a
  // single try meant one refusal erased the other's answer: the first MMA Files article
  // reverted itself off the live site on "Target CI state: unavailable" while the commit's
  // combined status was success, with every other check green. Each endpoint is now read on
  // its own, and only a genuine success still passes.
  const readJson = async <T>(url: string): Promise<{ value: T | null; error: string | null }> => {
    try {
      const response = await safeFetch(url, {
        allowHosts: ["api.github.com"], headers, maxBytes: 1_000_000, timeoutMs: 10_000
      });
      return { value: JSON.parse(new TextDecoder().decode(response.body)) as T, error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "request failed" };
    }
  };
  const base = `https://api.github.com/repos/${input.repository}/commits/${input.commit}`;
  const [status, checks] = await Promise.all([
    readJson<{ state?: unknown; statuses?: unknown[] }>(`${base}/status`),
    readJson<{ check_runs?: Array<{ status?: unknown; conclusion?: unknown }> }>(`${base}/check-runs`)
  ]);
  const ciState = resolveCiState(status.value, checks.value);
  // Name the endpoint that would not answer. "Target CI state: unavailable" on its own cost
  // two full delivery runs and an hour of wall clock to attribute to a missing installation
  // permission, because the line said the signal was absent without saying which one, or why.
  const unreadable = [
    status.error === null ? null : `statuses: ${status.error}`,
    checks.error === null ? null : `check-runs: ${checks.error}`
  ].filter((entry): entry is string => entry !== null);
  const detail = unreadable.length > 0
    ? `Target CI state: ${ciState} (${unreadable.join("; ")})`
    : `Target CI state: ${ciState}`;
  return [
    check("target-commit", commitPresent, commitPresent ? `Target commit ${input.commit} is readable` : `Target commit ${input.commit} is not readable`, input.now),
    check("target-ci", ciState === "success", detail, input.now)
  ];
}

/**
 * Where the Czech article lives on each site.
 *
 * The two differ. DNESKAi serves Czech at the root, because Czech took over the URLs English
 * used to hold and /cs now redirects there; MMA Files keeps its /cs segment. Fetching the
 * redirecting form would still pass — safeFetch follows same-host redirects — but a release
 * proof should read the page rather than the redirect that points at it.
 */
export function czechArticlePath(venture: "caught-up" | "mma-files", slug: string): string {
  return `${venture === "caught-up" ? "" : "/cs"}/articles/${slug}`;
}

async function publicSnapshot(input: {
  venture: "caught-up" | "mma-files";
  slug: string;
  packageHash: string;
  titles: { en?: string; cs: string };
  image: ArticleImage;
  baseUrl: string;
  now: Date;
}): Promise<ReleaseSnapshot> {
  const baseUrl = input.baseUrl.replace(/\/$/u, "");
  const cacheBust = encodeURIComponent(`${input.packageHash.slice(0, 12)}-${input.now.getTime()}`);
  const csUrl = `${baseUrl}${czechArticlePath(input.venture, input.slug)}?boardless_verify=${cacheBust}`;
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
    typeof input.titles.en === "string"
      ? fetchPage("en", `${baseUrl}/en/articles/${input.slug}?boardless_verify=${cacheBust}`)
      : Promise.resolve(undefined),
    fetchPage("cs", csUrl),
    safeFetch(imageUrl, { allowHosts: [host], maxBytes: 1_000_000, timeoutMs: 12_000 }).catch(() => null)
  ]);
  return {
    venture: input.venture,
    slug: input.slug,
    packageHash: input.packageHash,
    titles: input.titles,
    pages: en ? { en, cs } : { cs },
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
  titles: { en?: string; cs: string };
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
