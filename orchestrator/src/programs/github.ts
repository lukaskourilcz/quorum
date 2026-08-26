import type {
  ImplementationGitHubEvidence,
  ImplementationManifestRegistry,
  ImplementationWorkItem
} from "../contracts/implementation-program.js";

export interface GitHubReadResponse {
  status: 200 | 304;
  etag: string | null;
  rateRemaining: number | null;
  rateResetAt: string | null;
  body: unknown;
}

export interface GitHubReadClient {
  request(path: string, etag?: string | null): Promise<GitHubReadResponse>;
}

export interface GitHubCacheEntry {
  etag: string | null;
  value: unknown;
}

export interface GitHubEvidenceCache {
  schemaVersion: "implementation-github-cache/1";
  updatedAt: string;
  entries: Record<string, GitHubCacheEntry>;
}

export interface GitHubSynchronizationResult {
  evidence: ReadonlyMap<string, ImplementationGitHubEvidence>;
  cache: GitHubEvidenceCache;
  cacheStatus: "fresh" | "revalidated" | "stale" | "unavailable";
  rateRemaining: number | null;
  rateResetAt: string | null;
  failedItems: number;
  errors: string[];
}

interface SanitizedIssue {
  number: number;
  htmlUrl: string;
  state: "open" | "closed";
  title: string;
  updatedAt: string;
  checklist: { completed: number; total: number };
}

interface SanitizedPullRequest {
  number: number;
  htmlUrl: string;
  state: "open" | "closed";
  merged: boolean;
  headSha: string | null;
  mergeCommitSha: string | null;
  checksPassed: boolean | null;
  updatedAt: string;
  baseRef: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= maximum
    ? value.trim()
    : null;
}

function isoDateTime(value: unknown): string | null {
  const candidate = boundedText(value, 80);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? new Date(candidate).toISOString() : null;
}

function sha(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value) ? value : null;
}

function checklist(body: unknown): { completed: number; total: number } {
  if (typeof body !== "string") return { completed: 0, total: 0 };
  const boxes = [...body.matchAll(/^\s*[-*]\s+\[([ xX])\]/gmu)];
  return { completed: boxes.filter((match) => match[1]?.toLowerCase() === "x").length, total: boxes.length };
}

function parseIssue(value: unknown, expectedNumber: number): SanitizedIssue | null {
  const issue = record(value);
  const number = issue?.number;
  const htmlUrl = boundedText(issue?.html_url ?? issue?.htmlUrl, 2_048);
  const state = issue?.state;
  const title = boundedText(issue?.title, 240);
  const updatedAt = isoDateTime(issue?.updated_at ?? issue?.updatedAt);
  if (number !== expectedNumber || !htmlUrl?.startsWith("https://github.com/") || (state !== "open" && state !== "closed") || !title || !updatedAt) return null;
  const cachedChecklist = record(issue?.checklist);
  const completed = cachedChecklist?.completed;
  const total = cachedChecklist?.total;
  return {
    number,
    htmlUrl,
    state,
    title,
    updatedAt,
    checklist: Number.isInteger(completed) && Number.isInteger(total)
      ? { completed: completed as number, total: total as number }
      : checklist(issue?.body)
  };
}

function closingReference(body: unknown, issueNumber: number): boolean {
  if (typeof body !== "string" || body.length > 100_000) return false;
  return new RegExp(`(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+(?:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#${issueNumber}(?:\\b|$)`, "iu").test(body);
}

function linkedPullRequestNumbers(value: unknown, issueNumber: number): number[] {
  if (!Array.isArray(value)) return [];
  if (value.every((entry) => Number.isInteger(entry) && Number(entry) > 0)) {
    return [...new Set(value as number[])].sort((left, right) => left - right).slice(0, 20);
  }
  const numbers = new Set<number>();
  for (const rawEvent of value.slice(0, 100)) {
    const event = record(rawEvent);
    if (event?.event !== "cross-referenced") continue;
    const source = record(event.source);
    const sourceIssue = record(source?.issue);
    const pull = record(sourceIssue?.pull_request);
    if (!pull || typeof sourceIssue?.number !== "number" || !closingReference(sourceIssue.body, issueNumber)) continue;
    numbers.add(sourceIssue.number);
  }
  return [...numbers].sort((left, right) => left - right).slice(0, 20);
}

function parsePullRequest(value: unknown, expectedNumber: number): SanitizedPullRequest | null {
  const pull = record(value);
  const head = record(pull?.head);
  const base = record(pull?.base);
  const number = pull?.number;
  const htmlUrl = boundedText(pull?.html_url ?? pull?.htmlUrl, 2_048);
  const state = pull?.state;
  const updatedAt = isoDateTime(pull?.updated_at ?? pull?.updatedAt);
  if (number !== expectedNumber || !htmlUrl?.startsWith("https://github.com/") || (state !== "open" && state !== "closed") || !updatedAt) return null;
  return {
    number,
    htmlUrl,
    state,
    merged: pull?.merged === true || typeof pull?.merged_at === "string",
    headSha: sha(head?.sha ?? pull?.headSha),
    mergeCommitSha: sha(pull?.merge_commit_sha ?? pull?.mergeCommitSha),
    checksPassed: typeof pull?.checksPassed === "boolean" ? pull.checksPassed : null,
    updatedAt,
    baseRef: boundedText(base?.ref ?? pull?.baseRef, 200)
  };
}

function parseCombinedStatus(value: unknown): { checksPassed: boolean | null } | null {
  const cached = record(value)?.checksPassed;
  if (typeof cached === "boolean" || cached === null) return { checksPassed: cached };
  const status = record(value)?.state;
  if (status === "success") return { checksPassed: true };
  if (status === "failure" || status === "error") return { checksPassed: false };
  if (status === "pending") return { checksPassed: null };
  return null;
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/gu, " ").slice(0, 300) || "GitHub evidence unavailable";
}

async function mapBounded<T, R>(values: readonly T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]!);
    }
  }));
  return results;
}

export class PublicGitHubReadClient implements GitHubReadClient {
  constructor(
    private readonly token = process.env.GITHUB_TOKEN?.trim() || null,
    private readonly fetchImplementation: typeof fetch = fetch
  ) {}

  async request(path: string, etag?: string | null): Promise<GitHubReadResponse> {
    if (!path.startsWith("/repos/") || path.includes("..") || /[\r\n]/u.test(path)) {
      throw new Error("GitHub path is outside the registered repository API");
    }
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "BoardlessAI-Implementation-Plans/1"
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (etag) headers["If-None-Match"] = etag;
    const response = await this.fetchImplementation(`https://api.github.com${path}`, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });
    const rateRemaining = Number.isInteger(Number(response.headers.get("x-ratelimit-remaining")))
      ? Number(response.headers.get("x-ratelimit-remaining"))
      : null;
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const rateResetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1_000).toISOString() : null;
    if (response.status === 304) return { status: 304, etag: response.headers.get("etag"), rateRemaining, rateResetAt, body: null };
    if (!response.ok) throw new Error(`GitHub GET ${path} returned ${response.status}`);
    return { status: 200, etag: response.headers.get("etag"), rateRemaining, rateResetAt, body: await response.json() as unknown };
  }
}

export async function synchronizeGitHubEvidence(input: {
  registry: ImplementationManifestRegistry;
  client: GitHubReadClient;
  cache?: GitHubEvidenceCache | null;
  now: Date;
  concurrency?: number;
}): Promise<GitHubSynchronizationResult> {
  const now = input.now.toISOString();
  const oldEntries = input.cache?.entries ?? {};
  const entries: Record<string, GitHubCacheEntry> = { ...oldEntries };
  let rateRemaining: number | null = null;
  let rateResetAt: string | null = null;
  let revalidated = false;
  const request = async <T>(path: string, parse: (value: unknown) => T | null): Promise<T> => {
    const cached = oldEntries[path];
    const response = await input.client.request(path, cached?.etag);
    rateRemaining = response.rateRemaining ?? rateRemaining;
    rateResetAt = response.rateResetAt ?? rateResetAt;
    if (response.status === 304) {
      revalidated = true;
      const parsed = parse(cached?.value);
      if (parsed === null) throw new Error(`GitHub cache for ${path} is invalid`);
      return parsed;
    }
    const parsed = parse(response.body);
    if (parsed === null) throw new Error(`GitHub response for ${path} is malformed`);
    entries[path] = { etag: response.etag, value: parsed };
    return parsed;
  };

  const results = await mapBounded(input.registry.workItems, input.concurrency ?? 4, async (item): Promise<{
    item: ImplementationWorkItem;
    evidence: ImplementationGitHubEvidence;
    error: string | null;
  }> => {
    const program = input.registry.programs.find((candidate) => candidate.id === item.primaryProgramId)!;
    const repository = `${program.repository.owner}/${program.repository.name}`;
    const prefix = `/repos/${repository}`;
    const previous = input.cache?.entries[`evidence:${item.id}`]?.value as ImplementationGitHubEvidence | undefined;
    try {
      const issue = await request(`${prefix}/issues/${item.issue.number}`, (value) => parseIssue(value, item.issue.number));
      const prNumbers = await request(`${prefix}/issues/${item.issue.number}/timeline?per_page=100`, (value) => Array.isArray(value) ? linkedPullRequestNumbers(value, item.issue.number) : null);
      const pulls = await mapBounded(prNumbers, 3, async (number) => {
        const pull = await request(`${prefix}/pulls/${number}`, (value) => parsePullRequest(value, number));
        if (pull.headSha) {
          pull.checksPassed = (await request(`${prefix}/commits/${pull.headSha}/status`, parseCombinedStatus)).checksPassed;
        }
        return pull;
      });
      const evidence: ImplementationGitHubEvidence = {
        issue: {
          number: issue.number,
          url: issue.htmlUrl,
          state: issue.state,
          title: issue.title,
          updatedAt: issue.updatedAt,
          checklist: issue.checklist
        },
        pullRequests: pulls.map((pull) => ({
          number: pull.number,
          url: pull.htmlUrl,
          state: pull.state,
          merged: pull.merged,
          headSha: pull.headSha,
          mergeCommitSha: pull.mergeCommitSha,
          checksPassed: pull.checksPassed,
          updatedAt: pull.updatedAt
        })),
        baseBranchContainsMerge: pulls.some((pull) => pull.merged && pull.baseRef === program.repository.baseBranch),
        fetchedAt: now,
        stale: false,
        errors: []
      };
      entries[`evidence:${item.id}`] = { etag: null, value: evidence };
      return { item, evidence, error: null };
    } catch (error) {
      const detail = errorText(error);
      const fallback = previous && previous.issue
        ? { ...previous, stale: true, errors: [...previous.errors, detail].slice(-20) }
        : {
            issue: null,
            pullRequests: [],
            baseBranchContainsMerge: null,
            fetchedAt: now,
            stale: true,
            errors: [detail]
          } satisfies ImplementationGitHubEvidence;
      return { item, evidence: fallback, error: `${item.id}: ${detail}` };
    }
  });
  const failures = results.filter((result) => result.error !== null);
  const evidence = new Map(results.map((result) => [result.item.id, result.evidence]));
  return {
    evidence,
    cache: { schemaVersion: "implementation-github-cache/1", updatedAt: now, entries },
    cacheStatus: failures.length === results.length ? "unavailable" : failures.length ? "stale" : revalidated ? "revalidated" : "fresh",
    rateRemaining,
    rateResetAt,
    failedItems: failures.length,
    errors: failures.map((result) => result.error!).slice(0, 100)
  };
}
