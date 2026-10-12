import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signature } from "@boardlessai/orchestrator/marketing-source";
import { proxy } from "../../../../proxy";

const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-marketing-source", async importOriginal => ({ ...await importOriginal<object>(), readAdminMarketingSources: read }));
import { POST } from "./route";
const secret = "fixture-dneskai-secret-with-at-least-32-bytes";
const id = "2026-10-12-fixture-approved-article";
beforeEach(() => {
  vi.stubEnv("DNESKAI_MARKETING_SOURCE_SECRET", secret);
  vi.stubEnv("DNESKAI_MARKETING_SOURCE_ENABLED", "true");
  read.mockReset(); read.mockResolvedValue({ schemaVersion: "marketing-source-query/1", brand: "dneskai", sources: [] });
});
afterEach(() => vi.unstubAllEnvs());
function request(value: unknown, overrides: Record<string, string> = {}) {
  const body = JSON.stringify(value);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request("https://quorum.example/admin/api/marketing-source", { method: "POST", body,
    headers: { Authorization: `Bearer ${secret}`, "X-Marketing-Timestamp": timestamp,
      "X-Marketing-Signature": signature(secret, timestamp, body), ...overrides } });
}
describe("brand-bound source reader", () => {
  it("allows a valid narrow signed lookup and preserves private response headers", async () => {
    const response = await POST(request({ action: "sources", sourceIds: [id] }));
    expect(response.status).toBe(200);
    expect(read.mock.calls[0]?.[0]).toEqual({ action: "sources", sourceIds: [id] });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("refuses unsigned requests, foreign credentials and stale signatures before reading state", async () => {
    expect((await POST(new Request("https://quorum.example/admin/api/marketing-source", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await POST(request({ action: "sources", sourceIds: [id] }, { Authorization: "Bearer foreign-integration" }))).status).toBe(401);
    expect((await POST(request({ action: "sources", sourceIds: [id] }, { "X-Marketing-Timestamp": "1000000000" }))).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it("refuses unbounded queries and grants no article approval operation", async () => {
    expect((await POST(request({ action: "sources", sourceIds: Array(21).fill(id) }))).status).toBe(400);
    expect((await POST(request({ action: "approve", sourceIds: [id] }))).status).toBe(400);
    expect((await POST(request({ action: "sources", sourceIds: [id], brand: "devshark" }))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });
  it("fails closed on switch or authoritative read failures", async () => {
    vi.stubEnv("DNESKAI_MARKETING_SOURCE_ENABLED", "false");
    expect((await POST(request({ action: "sources", sourceIds: [id] }))).status).toBe(503);
    vi.stubEnv("DNESKAI_MARKETING_SOURCE_ENABLED", "true"); read.mockRejectedValue(new Error("fixture-auth-secret-never-returned"));
    const response = await POST(request({ action: "sources", sourceIds: [id] }));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("fixture-auth-secret");
  });
  it("delegates only the exact integration route to its HMAC gate", () => {
    vi.stubEnv("ADMIN_USER", "fixture-owner"); vi.stubEnv("ADMIN_PASSWORD", "fixture-password");
    expect(proxy(new NextRequest("https://quorum.example/admin/api/marketing-source")).status).toBe(200);
    expect(proxy(new NextRequest("https://quorum.example/admin/api/marketing-source/other")).status).toBe(401);
    expect(proxy(new NextRequest("https://quorum.example/admin/api/queue/articles")).status).toBe(401);
  });
});
