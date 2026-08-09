import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

/**
 * What a failed deck-style save tells the panel.
 *
 * "The deck design was not saved" was the whole answer for every cause, so a token that had never
 * been set and a token GitHub had begun refusing read identically — and the second one is a year
 * away and looks like the first. The body carries a machine-readable cause so the panel can show
 * the right warning without parsing prose.
 */

const originalFetch = globalThis.fetch;

function request(style = "editorial"): Request {
  return new Request("https://boardless.example/admin/api/carousel-studio/deck-style", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://boardless.example",
      cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "correct-password")}`
    },
    body: JSON.stringify({ venture: "mma-files", slug: "ufc-fight-night-gamrot-vs-salkilld", style })
  });
}

beforeEach(() => {
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "correct-password");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("the deck-style route's failure body", () => {
  it("names a missing token as its own cause", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    vi.stubEnv("VERCEL", "1");

    const response = await POST(request());
    const body = await response.json() as { error: string; cause: string };

    expect(response.status).toBe(503);
    expect(body.cause).toBe("no-token");
    expect(body.error).toContain("BOARDLESSAI_GITHUB_TOKEN");
  });

  it("names a refused token as a different cause from a missing one", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "expired-token");
    globalThis.fetch = (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;

    const response = await POST(request());
    const body = await response.json() as { error: string; cause: string };

    expect(response.status).toBe(503);
    expect(body.cause).toBe("token-refused");
    expect(body.error).toContain("expired");
  });

  it("rejects an unknown design as a request problem, not a persistence one", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "token");
    const response = await POST(request("no-such-design"));
    const body = await response.json() as { cause: string };

    expect(response.status).toBe(422);
    expect(body.cause).toBe("rejected");
  });

  it("returns the commit reference of a save that worked", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "token");
    globalThis.fetch = (async (_url: string, init?: RequestInit) => init?.method === "PUT"
      ? { ok: true, status: 200, json: async () => ({ commit: { sha: "abcdef1234567" } }) }
      : { ok: true, status: 200, json: async () => ({ sha: "file-sha" }) }) as unknown as typeof fetch;

    const response = await POST(request());
    const body = await response.json() as { ok: boolean; commit: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.commit).toBe("abcdef1");
  });
});
