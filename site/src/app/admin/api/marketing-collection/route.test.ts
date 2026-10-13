import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signature, InvalidCollectionQuery } from "@boardlessai/orchestrator/marketing-source";
import { proxy } from "../../../../proxy";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-marketing-collection", () => ({ readAdminMarketingCollection: read }));
import { POST } from "./route";
const secret = "fixture-dneskai-secret-with-at-least-32-bytes";
const query = { action: "collect", sourceIds: ["anthropic-news"], since: "2026-10-12T00:00:00Z", maxItems: 20 };
function request(value: unknown, overrides: Record<string, string> = {}) {
  const body = JSON.stringify(value); const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request("https://quorum.example/admin/api/marketing-collection", { method: "POST", body,
    headers: { Authorization: `Bearer ${secret}`, "X-Marketing-Timestamp": timestamp, "X-Marketing-Signature": signature(secret, timestamp, body), ...overrides } });
}
beforeEach(() => { vi.stubEnv("DNESKAI_MARKETING_SOURCE_SECRET", secret); vi.stubEnv("DNESKAI_COLLECTION_ENABLED", "true"); read.mockReset(); read.mockResolvedValue({ schemaVersion: "dneskai-feed/1", sources: [] }); });
afterEach(() => vi.unstubAllEnvs());
describe("signed free research collection", () => {
  it("accepts only the signed bounded request with private headers", async () => {
    const response = await POST(request(query)); expect(response.status).toBe(200);
    expect(read.mock.calls[0]?.[0]).toEqual(query); expect(response.headers.get("cache-control")).toBe("no-store, private");
  });
  it("rejects invalid credentials and replay timestamps before any configuration or fetch", async () => {
    for (const headers of [{ Authorization: "Bearer foreign" }, { "X-Marketing-Timestamp": "1000000000" }, { "X-Marketing-Signature": "0".repeat(64) }] as Record<string, string>[]) expect((await POST(request(query, headers))).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it("requires its independent enable flag, even if article export is enabled", async () => {
    vi.stubEnv("DNESKAI_COLLECTION_ENABLED", "false"); vi.stubEnv("DNESKAI_MARKETING_SOURCE_ENABLED", "true");
    expect((await POST(request(query))).status).toBe(503); expect(read).not.toHaveBeenCalled();
  });
  it("does not offer approvals and rejects excess query/body bounds", async () => {
    for (const body of [{ ...query, action: "approve" }, { ...query, maxItems: 21 }, { ...query, sourceIds: Array(9).fill("anthropic-news") }, { padding: "x".repeat(9000) }]) expect([400, 413]).toContain((await POST(request(body))).status);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects unknown registry IDs and redacts config failures", async () => {
    read.mockRejectedValueOnce(new InvalidCollectionQuery("Unknown private-source")); expect((await POST(request(query))).status).toBe(400);
    read.mockRejectedValueOnce(new Error("private-key")); const response = await POST(request(query)); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-key");
  });
  it("relaxes the interactive gate for this exact HMAC path only", () => {
    vi.stubEnv("ADMIN_USER", "fixture-owner"); vi.stubEnv("ADMIN_PASSWORD", "fixture-password");
    expect(proxy(new NextRequest("https://quorum.example/admin/api/marketing-collection")).status).toBe(200);
    expect(proxy(new NextRequest("https://quorum.example/admin/api/marketing-collection/other")).status).toBe(401);
  });
});
