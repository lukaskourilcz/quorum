import { beforeEach, describe, expect, it, vi } from "vitest";
const fetch = vi.hoisted(() => vi.fn());
vi.mock("../src/security/url.js", () => ({ safeFetch: fetch }));
import { fetchApifyMonthlyUsageUsd } from "../src/sources/apify.js";

beforeEach(() => { fetch.mockReset(); });
describe("Apify billing-cycle usage", () => {
  it("reads the documented current total from account limits", async () => {
    fetch.mockResolvedValue({ body: new TextEncoder().encode(JSON.stringify({ data: { limits: { maxMonthlyUsageUsd: 300 }, current: { monthlyUsageUsd: 18.95 } } })) });
    expect(await fetchApifyMonthlyUsageUsd({ token: "test" })).toBe(18.95);
    expect(fetch).toHaveBeenCalledWith("https://api.apify.com/v2/users/me/limits", expect.any(Object));
  });
  it.each([{}, { monthlyUsageUsd: 0 }, { current: { monthlyUsageUsd: -1 } }, { current: { monthlyUsageUsd: "0" } }])("refuses missing or invalid totals: %j", async data => {
    fetch.mockResolvedValue({ body: new TextEncoder().encode(JSON.stringify({ data })) });
    expect(await fetchApifyMonthlyUsageUsd({ token: "test" })).toBeNull();
  });
  it("refuses provider errors without assuming free credit", async () => {
    fetch.mockRejectedValue(new Error("unavailable"));
    expect(await fetchApifyMonthlyUsageUsd({ token: "test" })).toBeNull();
  });
});
