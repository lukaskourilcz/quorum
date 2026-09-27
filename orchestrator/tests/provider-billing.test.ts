import { describe, expect, it, vi } from "vitest";
import { fetchProviderBilling } from "../src/finance/provider-billing.js";

const enabledEnv = { ANTHROPIC_ADMIN_API_KEY: "sk-ant-admin-fixture", PROVIDER_BILLING_ENABLED: "true" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fixtureBody = {
  data: [
    { starting_at: "2026-09-13T00:00:00Z", results: [{ currency: "USD", amount: "0.18" }, { currency: "USD", amount: "0.01" }] },
    { starting_at: "2026-09-14T00:00:00Z", results: [{ currency: "USD", amount: "0.2" }] },
    // Out of the requested month; a bucket that straddles the boundary must not be counted twice.
    { starting_at: "2026-10-01T00:00:00Z", results: [{ currency: "USD", amount: "9.99" }] }
  ],
  has_more: false,
  next_page: null
};

describe("provider billing adapter", () => {
  it("makes no request at all when the flag is off", async () => {
    const fetchImpl = vi.fn();
    const outcome = await fetchProviderBilling({
      month: "2026-09",
      env: { ANTHROPIC_ADMIN_API_KEY: "sk-ant-admin-fixture" },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(outcome.reason).toBe("disabled");
    expect(outcome.billing).toBeNull();
  });

  it("makes no request when the flag is on but no admin key exists", async () => {
    const fetchImpl = vi.fn();
    const outcome = await fetchProviderBilling({
      month: "2026-09",
      env: { PROVIDER_BILLING_ENABLED: "true" },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(outcome.reason).toBe("no-admin-key");
    expect(outcome.detail).toContain("ANTHROPIC_ADMIN_API_KEY");
  });

  it("reads a month of daily buckets and totals only that month", async () => {
    const requested: URL[] = [];
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      requested.push(new URL(String(url)));
      return jsonResponse(fixtureBody);
    });
    const outcome = await fetchProviderBilling({
      month: "2026-09",
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date("2026-09-16T12:00:00.000Z")
    });
    expect(outcome.reason).toBe("ok");
    expect(outcome.billing).toEqual({
      source: "anthropic-cost-report",
      fetchedAt: "2026-09-16T12:00:00.000Z",
      month: "2026-09",
      currency: "USD",
      totalUsd: 0.39,
      days: [{ date: "2026-09-13", usd: 0.19 }, { date: "2026-09-14", usd: 0.2 }]
    });
    const request = requested[0]!;
    expect(request.origin).toBe("https://api.anthropic.com");
    expect(request.searchParams.get("bucket_width")).toBe("1d");
    expect(request.searchParams.get("starting_at")).toBe("2026-09-01T00:00:00.000Z");
    expect(request.searchParams.get("ending_at")).toBe("2026-10-01T00:00:00.000Z");
  });

  it("returns unavailable, never a throw, for a rejected key", async () => {
    const outcome = await fetchProviderBilling({
      month: "2026-09",
      env: enabledEnv,
      fetchImpl: (async () => jsonResponse({ error: "unauthorized" }, 401)) as unknown as typeof fetch
    });
    expect(outcome.billing).toBeNull();
    expect(outcome.reason).toBe("rejected");
    expect(outcome.detail).toContain("401");
  });

  it("returns unavailable, never a throw, for a body it does not recognise", async () => {
    for (const body of [{ buckets: [] }, "not json at all"]) {
      const outcome = await fetchProviderBilling({
        month: "2026-09",
        env: enabledEnv,
        fetchImpl: (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
      });
      expect(outcome.billing).toBeNull();
      expect(outcome.reason).toBe("malformed-response");
    }
  });

  it("returns unavailable, never a throw, when the request itself fails", async () => {
    const outcome = await fetchProviderBilling({
      month: "2026-09",
      env: enabledEnv,
      fetchImpl: (async () => { throw new Error("socket hang up"); }) as unknown as typeof fetch
    });
    expect(outcome.billing).toBeNull();
    expect(outcome.reason).toBe("request-failed");
    expect(outcome.detail).toContain("socket hang up");
  });

  it("refuses a currency it cannot record rather than publishing the number anyway", async () => {
    const outcome = await fetchProviderBilling({
      month: "2026-09",
      env: enabledEnv,
      fetchImpl: (async () => jsonResponse({
        data: [{ starting_at: "2026-09-13T00:00:00Z", results: [{ currency: "EUR", amount: "0.18" }] }]
      })) as unknown as typeof fetch
    });
    expect(outcome.billing).toBeNull();
    expect(outcome.reason).toBe("not-usd");
  });

  it("stops walking pages instead of following them forever", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [{ starting_at: "2026-09-13T00:00:00Z", results: [{ currency: "USD", amount: "0.01" }] }],
      has_more: true,
      next_page: "page-token"
    }));
    const outcome = await fetchProviderBilling({
      month: "2026-09",
      env: enabledEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date("2026-09-16T12:00:00.000Z")
    });
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(8);
    expect(outcome.reason).toBe("ok");
  });
});
