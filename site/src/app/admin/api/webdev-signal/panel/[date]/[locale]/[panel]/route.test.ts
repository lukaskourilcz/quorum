import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { GET } from "./route";

const origin = "https://boardless.example";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const REF = "state/ventures/webdev-signal/design-lab/assets/abc/en/01.png";
let root = "";

function panel(date: string, locale: string, number: string, { auth = true, query = "" } = {}): Promise<Response> {
  const headers: Record<string, string> = auth ? { Cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}` } : {};
  return GET(new Request(`${origin}/admin/api/webdev-signal/panel/${date}/${locale}/${number}${query}`, { headers }), {
    params: Promise.resolve({ date, locale, panel: number })
  });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "webdev-panel-route-"));
  await mkdir(path.join(root, path.dirname(REF)), { recursive: true });
  await writeFile(path.join(root, REF), PNG);
  await mkdir(path.join(root, "state/ventures/webdev-signal/design-lab/receipts"), { recursive: true });
  await writeFile(path.join(root, "state/ventures/webdev-signal/design-lab/receipts/abc-en.json"), JSON.stringify({
    schemaVersion: "webdev-render-receipt/1",
    packageRef: "state/ventures/webdev-signal/packages/2026-09-20-en.json",
    outcome: "success",
    reason: null,
    outputs: [{ panelId: "panel-01", assetRef: REF, pngHash: createHash("sha256").update(PNG).digest("hex") }]
  }));
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("GET /admin/api/webdev-signal/panel/[date]/[locale]/[panel]", () => {
  it("previews a rendered panel inline, addressed by day, locale and number", async () => {
    const response = await panel("2026-09-20", "en", "1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  });

  it("downloads it as an attachment named for the day", async () => {
    const response = await panel("2026-09-20", "en", "1", { query: "?download=1" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="webdev-signal-2026-09-20-en-01.png"');
  });

  it("answers 404 for a panel no receipt names and 409 for a file that changed", async () => {
    expect((await panel("2026-09-20", "en", "2")).status).toBe(404);
    expect((await panel("2026-09-20", "cs", "1")).status).toBe(404);
    expect((await panel("..%2F..", "en", "1")).status).toBe(404);
    await writeFile(path.join(root, REF), "edited by hand");
    expect((await panel("2026-09-20", "en", "1")).status).toBe(409);
  });

  it("is behind the admin session", async () => {
    expect((await panel("2026-09-20", "en", "1", { auth: false })).status).toBe(401);
  });
});
