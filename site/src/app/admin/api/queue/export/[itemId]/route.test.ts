import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueFixtureRoot } from "@/lib/admin-queue/fixture-root";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { GET } from "./route";

const origin = "https://boardless.example";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const roots: string[] = [];
let root = "";

function exportItem(itemId: string, auth = true): Promise<Response> {
  const headers: Record<string, string> = auth ? { Cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}` } : {};
  return GET(new Request(`${origin}/admin/api/queue/export/${itemId}`, { headers }), { params: Promise.resolve({ itemId }) });
}

beforeEach(async () => {
  root = await queueFixtureRoot();
  roots.push(root);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("GET /admin/api/queue/export/[itemId]", () => {
  it("downloads one item as a ZIP for manual posting", async () => {
    await mkdir(path.join(root, "site/public/social/devshark/2026-09-26/en"), { recursive: true });
    await writeFile(path.join(root, "site/public/social/devshark/2026-09-26/en/slide-01.png"), PNG);
    const response = await exportItem("ms-2026-09-26-devshark-en-linkedin");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="ms-2026-09-26-devshark-en-linkedin.zip"');
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["frame-01.png", "caption.txt", "manifest.json"]));
  });

  it("answers 404 for an unknown or malformed id", async () => {
    expect((await exportItem("ms-2026-01-01-devshark-en-threads")).status).toBe(404);
    expect((await exportItem("..%2Fqueue")).status).toBe(404);
  });

  it("is behind the admin session", async () => {
    expect((await exportItem("ms-2026-09-26-devshark-en-linkedin", false)).status).toBe(401);
  });

  it("has the committed frames traced into its deployed bundle", async () => {
    const { default: config } = await import("../../../../../../../next.config");
    const { normalizeAppPath } = await import("next/dist/shared/lib/router/utils/app-paths.js") as { normalizeAppPath: (route: string) => string };
    const vendored = "next/dist/compiled/picomatch";
    const picomatch = ((await import(vendored)) as { default: unknown }).default as (glob: string, options: object) => (value: string) => boolean;
    const route = normalizeAppPath("app/admin/api/queue/export/[itemId]/route");
    const traced = Object.entries(config.outputFileTracingIncludes ?? {})
      .filter(([key]) => picomatch(key, { dot: true, contains: true })(route))
      .flatMap(([, files]) => files);
    expect(traced).toContain("./public/social/**/*");
  });
});
