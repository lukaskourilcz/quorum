import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueFixtureRoot } from "@/lib/admin-queue/fixture-root";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { GET } from "./route";

const origin = "https://boardless.example";
const repository = path.resolve(process.cwd(), "..");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const roots: string[] = [];
let root = "";

function frame(itemId: string, slide: string, auth = true): Promise<Response> {
  const headers: Record<string, string> = auth ? { Cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}` } : {};
  return GET(new Request(`${origin}/admin/api/queue/frame/${itemId}/${slide}`, { headers }), { params: Promise.resolve({ itemId, slide }) });
}

beforeEach(async () => {
  root = await queueFixtureRoot();
  roots.push(root);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("GET /admin/api/queue/frame/[itemId]/[slide]", () => {
  it("serves a committed frame by item and slide, never by path", async () => {
    await mkdir(path.join(root, "site/public/social/devshark/2026-09-26/en"), { recursive: true });
    await writeFile(path.join(root, "site/public/social/devshark/2026-09-26/en/slide-01.png"), PNG);
    const response = await frame("ms-2026-09-26-devshark-en-linkedin", "1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
    expect((await frame("ms-2026-09-26-devshark-en-linkedin", "2")).status).toBe(404);
    expect((await frame("ms-2026-09-26-devshark-en-linkedin", "6")).status).toBe(404);
    expect((await frame("..%2Fqueue", "1")).status).toBe(404);
  });

  it("is behind the admin session", async () => {
    expect((await frame("ms-2026-09-26-devshark-en-linkedin", "1", false)).status).toBe(401);
  });

  it("re-renders a legacy DNESKAi frame from its social pack when none was written", async () => {
    await copyFile(path.join(repository, "state/social/queue/2026-08-05-cs-instagram.json"), path.join(root, "state/social/queue/2026-08-05-cs-instagram.json"));
    await mkdir(path.join(root, "state/social/packs"), { recursive: true });
    await copyFile(path.join(repository, "state/social/packs/2026-08-05.json"), path.join(root, "state/social/packs/2026-08-05.json"));
    const response = await frame("caught-up-2026-08-05-cs-instagram", "1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 8)).toEqual(PNG.subarray(0, 8));
  });
});
