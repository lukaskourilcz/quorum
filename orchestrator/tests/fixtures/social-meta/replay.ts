import { expect, vi } from "vitest";

/** One Graph request and its answer, as the fixture files under this folder record them. */
export interface MetaExchange {
  request: { method: "GET" | "POST"; url: string; params: Record<string, string> };
  response: { status: number; body: unknown } | { networkError: string };
}

function substitute<T>(value: T, substitutions: Record<string, string>): T {
  let text = JSON.stringify(value);
  for (const [key, replacement] of Object.entries(substitutions)) text = text.split(`{${key}}`).join(replacement);
  return JSON.parse(text) as T;
}

/**
 * A fetch that answers Meta Graph requests from a fixture, strictly in order.
 *
 * Each request must match the next exchange exactly: method, URL without its query, and every
 * query or form parameter. The access token must be the one the test configured; it is checked
 * and then removed so no fixture ever carries it. A request the fixture does not expect fails the
 * test, and `remaining()` tells a test whether every recorded exchange was used.
 */
export function replayMeta(exchanges: readonly MetaExchange[], options: { accessToken: string; substitutions?: Record<string, string> }) {
  const queue = substitute([...exchanges], options.substitutions ?? {});
  const seen: Array<MetaExchange["request"]> = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? "GET") as "GET" | "POST";
    const params = method === "POST"
      ? Object.fromEntries(new URLSearchParams(String(init?.body ?? "")))
      : Object.fromEntries(url.searchParams);
    expect(params.access_token, `${method} ${url.pathname} carries the configured token`).toBe(options.accessToken);
    delete params.access_token;
    const request = { method, url: `${url.origin}${url.pathname}`, params };
    seen.push(request);
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected Meta request: ${method} ${request.url}`);
    expect(request).toEqual(next.request);
    if ("networkError" in next.response) throw new DOMException(next.response.networkError, "TimeoutError");
    return new Response(JSON.stringify(next.response.body), {
      status: next.response.status,
      headers: { "content-type": "application/json; charset=UTF-8" }
    });
  });
  return { fetchImpl, seen, remaining: () => queue.length };
}
