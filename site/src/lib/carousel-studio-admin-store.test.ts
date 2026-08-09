import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CarouselStudioPersistenceError,
  matchDeckStyleOverride,
  setDeckStyleOverride,
  type DeckStyleOverride
} from "./carousel-studio-admin-store";

/**
 * The GitHub write path, exercised through the one caller that reaches it.
 *
 * The bug this covers shipped twice. First a token scoped to the wrong permission, then a writer
 * that could only update a file that already existed — which meant every new state document had
 * to be committed to main by hand before the admin could touch it. Both failed as one
 * indistinguishable "not saved", so the branches are separated here by what the caller can read
 * back: a create sends no `sha`, an update sends one, and a refusal says which token problem it is.
 */

interface Call { url: string; init?: RequestInit }

function githubFetch(reads: Array<{ status: number; sha?: string }>, writes: Array<{ status: number; commit?: string }>) {
  const calls: Call[] = [];
  let readIndex = 0;
  let writeIndex = 0;
  const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    if (init?.method === "PUT") {
      const write = writes[Math.min(writeIndex, writes.length - 1)]!;
      writeIndex += 1;
      return {
        ok: write.status >= 200 && write.status < 300,
        status: write.status,
        json: async () => (write.commit ? { commit: { sha: write.commit } } : {})
      } as unknown as Response;
    }
    const read = reads[Math.min(readIndex, reads.length - 1)]!;
    readIndex += 1;
    return {
      ok: read.status >= 200 && read.status < 300,
      status: read.status,
      json: async () => (read.sha ? { sha: read.sha } : {})
    } as unknown as Response;
  });
  return { calls, fetcher };
}

const request = {
  venture: "mma-files" as const,
  slug: "ufc-fight-night-gamrot-vs-salkilld",
  date: "2026-08-06",
  style: "editorial",
  styles: ["mesh", "editorial", "spotlight", "contrast", "aurora"],
  now: new Date("2026-08-09T09:00:00.000Z")
};

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

describe("the Studio's GitHub writer", () => {
  const original = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "token-for-the-test");
  });

  afterEach(() => {
    globalThis.fetch = original;
    vi.unstubAllEnvs();
  });

  it("updates an existing file by sending its sha", async () => {
    const { calls, fetcher } = githubFetch([{ status: 200, sha: "abc123" }], [{ status: 200, commit: "1234567890abcdef" }]);
    globalThis.fetch = fetcher as unknown as typeof fetch;

    const result = await setDeckStyleOverride(request);

    const put = calls.find((call) => call.init?.method === "PUT")!;
    expect(bodyOf(put).sha).toBe("abc123");
    expect(result.commit).toBe("1234567");
    expect(result.overrides[0]).toMatchObject({ venture: "mma-files", style: "editorial" });
  });

  it("creates a file that does not exist yet, with no sha at all", async () => {
    const { calls, fetcher } = githubFetch([{ status: 404 }], [{ status: 201, commit: "fedcba9876543210" }]);
    globalThis.fetch = fetcher as unknown as typeof fetch;

    const result = await setDeckStyleOverride(request);

    const put = calls.find((call) => call.init?.method === "PUT")!;
    expect(bodyOf(put)).not.toHaveProperty("sha");
    expect(result.commit).toBe("fedcba9");
  });

  it("treats any read failure that is not a 404 as a failure, and never overwrites blind", async () => {
    const { calls, fetcher } = githubFetch([{ status: 500 }], [{ status: 200 }]);
    globalThis.fetch = fetcher as unknown as typeof fetch;

    await expect(setDeckStyleOverride(request)).rejects.toThrow(/read failed with 500/u);
    expect(calls.some((call) => call.init?.method === "PUT")).toBe(false);
  });

  it("names an expired or under-scoped token rather than saying nothing saved", async () => {
    const { fetcher } = githubFetch([{ status: 403 }], [{ status: 200 }]);
    globalThis.fetch = fetcher as unknown as typeof fetch;

    const error = await setDeckStyleOverride(request).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(CarouselStudioPersistenceError);
    expect((error as CarouselStudioPersistenceError).code).toBe("REFUSED");
    expect((error as Error).message).toContain("BOARDLESSAI_GITHUB_TOKEN");
  });

  it("retries a create that lost the race, because 422 there means the file appeared", async () => {
    const { calls, fetcher } = githubFetch(
      [{ status: 404 }, { status: 200, sha: "raced" }],
      [{ status: 422 }, { status: 200, commit: "0f0f0f0f" }]
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;

    const result = await setDeckStyleOverride(request);

    expect(result.commit).toBe("0f0f0f0");
    expect(bodyOf(calls.filter((call) => call.init?.method === "PUT")[1]!).sha).toBe("raced");
  });

  it("says the deployment has no token, distinctly from a token GitHub refused", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    vi.stubEnv("VERCEL", "1");

    const error = await setDeckStyleOverride(request).catch((cause: unknown) => cause);
    expect((error as CarouselStudioPersistenceError).code).toBe("UNCONFIGURED");
    expect((error as Error).message).toContain("BOARDLESSAI_GITHUB_TOKEN");
  });

  it("records the date, and replaces only the record for that one article", async () => {
    const { fetcher } = githubFetch([{ status: 404 }], [{ status: 201, commit: "aaaaaaa1" }]);
    globalThis.fetch = fetcher as unknown as typeof fetch;

    const { overrides } = await setDeckStyleOverride(request);
    expect(overrides[0]).toMatchObject({ slug: request.slug, date: "2026-08-06", style: "editorial" });
  });

  it("refuses a save that does not say which article it is for", async () => {
    const error = await setDeckStyleOverride({ ...request, date: "not-a-date" }).catch((cause: unknown) => cause);
    expect((error as CarouselStudioPersistenceError).code).toBe("CONFLICT");
  });
});

/**
 * Three MMA redeliveries of one event share a slug, so a slug is not an identity.
 *
 * The records already on main carry no date and have to go on binding, which is why the exact
 * match is preferred and the undated one is the fallback rather than the other way round.
 */
describe("matching an owner's recorded design to an article", () => {
  const dated: DeckStyleOverride = {
    venture: "mma-files", slug: "gamrot", date: "2026-08-06", style: "contrast", changedAt: "2026-08-08T00:00:00.000Z"
  };
  const undated: DeckStyleOverride = {
    venture: "mma-files", slug: "gamrot", style: "aurora", changedAt: "2026-08-07T00:00:00.000Z"
  };

  it("prefers the record written for that exact date", () => {
    expect(matchDeckStyleOverride([undated, dated], "mma-files", "gamrot", "2026-08-06")?.style).toBe("contrast");
  });

  it("falls back to an undated record for the other redeliveries", () => {
    expect(matchDeckStyleOverride([undated, dated], "mma-files", "gamrot", "2026-08-05")?.style).toBe("aurora");
  });

  it("binds nothing when only another date is recorded", () => {
    expect(matchDeckStyleOverride([dated], "mma-files", "gamrot", "2026-08-05")).toBeUndefined();
  });

  it("never crosses ventures", () => {
    expect(matchDeckStyleOverride([undated], "caught-up", "gamrot", "2026-08-06")).toBeUndefined();
  });
});
