import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The same shim the other server-only modules are tested through: `server-only` throws on import
// outside a React server bundle, and vitest is neither.
vi.mock("server-only", () => ({}));
import { GET } from "./route";

const SECRET = "a-random-string-at-least-sixteen-chars";

interface DispatchCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: DispatchCall[] = [];
let githubStatus = 204;

function call(phase: string, header?: string, headers: Record<string, string> = {}) {
  return GET(
    new Request(`https://boardless-ai.vercel.app/api/cron/${phase}`, {
      headers: { ...(header === undefined ? {} : { authorization: header }), ...headers }
    }),
    { params: Promise.resolve({ phase }) }
  );
}

beforeEach(() => {
  calls = [];
  githubStatus = 204;
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("QUORUM_DISPATCH_TOKEN", "github_pat_test");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body))
    });
    return new Response(githubStatus === 204 ? null : "rejected", { status: githubStatus });
  });
  // 08:00 Prague on 4 August 2026 (CEST), the MMA Files day's own hour. It stands in for the
  // story meeting this case used to name, which is a step of that day now.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T06:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/**
 * This route can start a paid council run, so an unauthenticated caller finding the URL is the
 * primary threat and not a footnote. Every case below is a way in that must not exist.
 */
describe("the cron route refuses anything that is not Vercel's cron", () => {
  it.each([
    ["no Authorization header at all", undefined],
    ["an empty header", ""],
    ["the secret without the Bearer scheme", SECRET],
    ["the wrong scheme", `Basic ${SECRET}`],
    ["a wrong secret of the same length", `Bearer ${"b".repeat(SECRET.length)}`],
    ["a correct prefix that stops short", `Bearer ${SECRET.slice(0, -1)}`],
    ["the secret with something appended", `Bearer ${SECRET}x`],
    ["a lowercased bearer", `bearer ${SECRET}`]
  ])("refuses %s", async (_name, header) => {
    const response = await call("mma-day", header);
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("refuses everything when CRON_SECRET is unset, rather than falling open", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await call("mma-day", `Bearer ${SECRET}`)).status).toBe(401);
    expect((await call("mma-day")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("refuses everything when CRON_SECRET is set to an empty string", async () => {
    vi.stubEnv("CRON_SECRET", "");
    // An empty secret would otherwise make "Bearer " a valid credential.
    expect((await call("mma-day", "Bearer ")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("is not fooled by Vercel's own user agent without the secret", async () => {
    const response = await call("mma-day", undefined, { "user-agent": "vercel-cron/1.0" });
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("says nothing about which part was wrong", async () => {
    const missing = await call("mma-day");
    const wrong = await call("mma-day", "Bearer nope");
    expect(await missing.text()).toBe(await wrong.text());
    expect(missing.status).toBe(wrong.status);
  });

  it("checks the secret before it looks at the phase, so the URL leaks no route map", async () => {
    expect((await call("not-a-phase")).status).toBe(401);
    expect((await call("../../admin")).status).toBe(401);
  });

  /**
   * The only assertion here that reads source rather than behaviour, and deliberately so:
   * constant-time comparison has no observable output that differs from `===`. What the cases
   * above can prove is that a wrong secret of the same length and a wrong secret of a different
   * length are both refused identically and neither throws; what they cannot prove is that the
   * comparison did not return early. So the mechanism is pinned by name.
   */
  it("compares with timingSafeEqual over fixed-length digests", async () => {
    const source = await readFile(path.join(import.meta.dirname, "route.ts"), "utf8");
    expect(source).toContain("timingSafeEqual");
    expect(source).toMatch(/createHash\("sha256"\)/u);
    // No length comparison in front of it: an early return on a length mismatch is itself the
    // leak, because it tells the caller how long the secret is.
    expect(source).not.toMatch(/\.length\s*!==\s*.*\.length/u);
  });
});

describe("the cron route dispatches the slot it was called for", () => {
  it("dispatches the phase in the path as a scheduled firing", async () => {
    const response = await call("mma-day", `Bearer ${SECRET}`);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ dispatched: true, phase: "mma-day" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://api.github.com/repos/lukaskourilcz/quorum/actions/workflows/cycle.yml/dispatches"
    );
    expect(calls[0]!.headers.authorization).toBe("Bearer github_pat_test");
    // Only the two inputs a cron firing is entitled to. `dry` and `delivery_only` are absent, so
    // this route cannot ask for a dry run or for the owner's delivery-only mode.
    expect(calls[0]!.body).toEqual({
      ref: "main",
      inputs: { phase: "mma-day", trigger: "vercel-cron" }
    });
  });

  it("does nothing for the daylight-saving variant that is not in force", async () => {
    // mma-day is the 08:00 Prague slot, so under CEST its live entry is 06:00 UTC. The 07:00 UTC
    // entry exists for winter and fires today too; it must dispatch nothing.
    vi.setSystemTime(new Date("2026-08-04T07:00:00.000Z"));
    const response = await call("mma-day", `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dispatched: false, reason: "inactive-dst-variant" });
    expect(calls).toHaveLength(0);
  });

  it("dispatches from the winter entry once the clocks have gone back", async () => {
    // Same slot, same two entries; in January it is the 07:00 UTC one that is live.
    vi.setSystemTime(new Date("2026-01-04T07:00:00.000Z"));
    expect((await call("mma-day", `Bearer ${SECRET}`)).status).toBe(202);
    expect(calls).toHaveLength(1);
    calls = [];
    vi.setSystemTime(new Date("2026-01-04T06:00:00.000Z"));
    expect((await call("mma-day", `Bearer ${SECRET}`)).status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("dispatches the edition slot at its own hour and again at the retry hour", async () => {
    // Every delivered edition except 6 August needed a second run, and every second run that ran
    // succeeded. The 05:00 Prague slot is DNESKAi's whole day now; the retry is still a second
    // dispatch of the edition room alone, which resumes the one thing the day may have left
    // undone. The run itself decides whether there is anything left to do.
    vi.setSystemTime(new Date("2026-08-04T03:00:00.000Z"));
    expect((await call("cu-day", `Bearer ${SECRET}`)).status).toBe(202);
    expect(calls).toHaveLength(1);

    calls = [];
    vi.setSystemTime(new Date("2026-08-04T07:00:00.000Z"));
    expect((await call("cu-edition", `Bearer ${SECRET}`)).status).toBe(202);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({
      ref: "main",
      inputs: { phase: "cu-edition", trigger: "vercel-cron" }
    });

    // The edition room has no slot of its own any more, so its only live hour is the retry: the
    // day's own 03:00 firing must not reach it, and neither variant's neighbour fires.
    calls = [];
    vi.setSystemTime(new Date("2026-08-04T03:00:00.000Z"));
    expect((await call("cu-edition", `Bearer ${SECRET}`)).status).toBe(200);
    vi.setSystemTime(new Date("2026-08-04T09:00:00.000Z"));
    expect((await call("cu-edition", `Bearer ${SECRET}`)).status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("gives no other phase a retry hour", async () => {
    vi.setSystemTime(new Date("2026-08-04T07:00:00.000Z"));
    expect((await call("morning", `Bearer ${SECRET}`)).status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("refuses a phase that is not scheduled", async () => {
    const response = await call("founding", `Bearer ${SECRET}`);
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("refuses to fire when the dispatch token is missing", async () => {
    vi.stubEnv("QUORUM_DISPATCH_TOKEN", undefined);
    expect((await call("mma-day", `Bearer ${SECRET}`)).status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("reports a dispatch GitHub rejected instead of claiming success", async () => {
    githubStatus = 422;
    const response = await call("mma-day", `Bearer ${SECRET}`);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ dispatched: false, status: 422 });
  });
});

/**
 * The route reads config/ventures.json at request time, from a serverless bundle that contains
 * only what the build traced into it. `outputFileTracingIncludes` is what puts the file there,
 * and a key that stops matching does not fail the build — it produces a route that answers every
 * firing with "registry-unreadable" and dispatches nothing, for as long as nobody looks.
 *
 * Both halves are checked against the modules Next itself uses, because both are easy to get
 * wrong by eye: the route Next derives from the directory is not the URL, and the key is matched
 * as a glob in which `[phase]` is a character class rather than five literal characters.
 */
describe("the registry reaches the deployed function", () => {
  it("keys outputFileTracingIncludes on the route Next actually derives", async () => {
    const { default: config } = await import("../../../../../next.config");
    const includes = config.outputFileTracingIncludes ?? {};
    const { normalizeAppPath } = await import(
      "next/dist/shared/lib/router/utils/app-paths.js"
    ) as { normalizeAppPath: (route: string) => string };
    // Next vendors picomatch without type declarations, so the specifier is held in a variable:
    // a non-literal import gives `any` instead of a resolution error, and using Next's own copy
    // is the point — a differently-versioned matcher would answer a different question.
    const vendored = "next/dist/compiled/picomatch";
    const picomatch = ((await import(vendored)) as { default: unknown }).default as (
      glob: string,
      options: object
    ) => (value: string) => boolean;
    const route = normalizeAppPath("app/api/cron/[phase]/route");
    const matching = Object.entries(includes).filter(([key]) =>
      picomatch(key, { dot: true, contains: true })(route)
    );
    expect(matching.flatMap(([, value]) => value)).toContain("../config/ventures.json");
  });

  it("names a file that exists where the trace glob looks for it", async () => {
    const siteRoot = path.resolve(import.meta.dirname, "../../../../..");
    await expect(readFile(path.join(siteRoot, "../config/ventures.json"), "utf8")).resolves.toContain(
      "venture-registry/1"
    );
  });
});
