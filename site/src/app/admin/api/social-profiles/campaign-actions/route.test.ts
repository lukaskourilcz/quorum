import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

const origin = "https://boardless.example"; const roots: string[] = [];
function request(body: unknown, options: { auth?: boolean; origin?: string; size?: number } = {}): Request { const raw = JSON.stringify(body); const headers: Record<string, string> = { "Content-Type": "application/json", Origin: options.origin ?? origin, "content-length": String(options.size ?? Buffer.byteLength(raw)) }; if (options.auth !== false) headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}`; return new Request(`${origin}/admin/api/social-profiles/campaign-actions`, { method: "POST", headers, body: raw }); }

let root = "";
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "social-campaign-route-")); roots.push(root); const fixture = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { campaign: unknown };
  await mkdir(path.join(root, "state/social/campaigns"), { recursive: true }); await writeFile(path.join(root, "state/social/campaigns/campaign.json"), `${JSON.stringify(fixture.campaign, null, 2)}\n`);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root); vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", ""); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("ADMIN_USER", "owner"); vi.stubEnv("ADMIN_PASSWORD", "secret");
});
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true }))); });

describe("Social Profiles campaign actions route", () => {
  it("appends one idempotent bounded correction that invalidates approval", async () => {
    const body = { type: "correct-item", campaignId: "social-campaign-door-money-release-001", targetId: null, itemId: "door-money-instagram-001", expectedBindingHash: "4".repeat(64), reason: "Correct the bounded fixture sentence and request a fresh approval.", replacement: { text: "Corrected owner-approved Door Money release fixture.", destination: null, altText: null, notBefore: null, notAfter: null } };
    const response = await POST(request(body)); const retry = await POST(request(body));
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ ok: true, changed: true, event: { action: "correct-item", replacement: { text: body.replacement.text, bindingHash: expect.stringMatching(/^[a-f0-9]{64}$/u) } } });
    expect(retry.status).toBe(200); expect(await retry.json()).toMatchObject({ changed: false });
    expect(response.headers.get("cache-control")).toBe("no-store, private"); expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("lets a stop control win and refuses approval of a held campaign", async () => {
    const hold = { type: "hold", campaignId: "social-campaign-door-money-release-001", targetId: null, itemId: null, expectedBindingHash: null, reason: "Keep all campaign items held under the current owner decision.", replacement: null };
    expect((await POST(request(hold))).status).toBe(201);
    const approve = { ...hold, type: "approve-target", targetId: "door-money-primary", expectedBindingHash: "a".repeat(64), reason: "Attempt to approve while the campaign remains held." };
    expect((await POST(request(approve))).status).toBe(403);
  });

  it("rejects missing auth, cross-origin, oversized, unsafe and authority-broadening input", async () => {
    const body = { type: "hold", campaignId: "social-campaign-door-money-release-001", targetId: null, itemId: null, expectedBindingHash: null, reason: "Hold the campaign for a bounded owner review.", replacement: null };
    expect((await POST(request(body, { auth: false }))).status).toBe(401);
    expect((await POST(request(body, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(body, { size: 8_193 }))).status).toBe(413);
    expect((await POST(request({ ...body, type: "publish-target" }))).status).toBe(422);
    expect((await POST(request({ ...body, contestReferralCode: "forbidden" }))).status).toBe(422);
    expect((await POST(request({ ...body, reason: "Authorization: Bearer ghp_private" }))).status).toBe(422);
  });
});
