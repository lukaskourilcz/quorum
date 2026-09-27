import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { parseMarketingCalendarAction } from "@/lib/admin-marketing-calendar-store";
import { POST } from "./route";

const ORIGIN = "https://boardless.example";
const relative = "state/marketing-calendar/marketingshark.json";
const now = new Date("2026-10-01T08:00:00.000Z");
let root = "";
let fixture: Record<string, unknown>;

function request(body: unknown, options: { auth?: boolean; origin?: string; size?: number; raw?: string } = {}): Request {
  const raw = options.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? ORIGIN,
    "content-length": String(options.size ?? Buffer.byteLength(raw))
  };
  if (options.auth !== false) headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret", now.getTime())}`;
  return new Request(`${ORIGIN}/admin/api/marketing-calendar`, { method: "POST", headers, body: raw });
}

async function stored(): Promise<{ entries: Array<Record<string, unknown>>; prelaunch: Array<Record<string, unknown>> }> {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "boardless-marketing-calendar-"));
  fixture = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/marketing-calendar.valid.json"), "utf8"));
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(root, { recursive: true, force: true });
});

describe("POST /admin/api/marketing-calendar", () => {
  it("refuses an unauthenticated request", async () => {
    const response = await POST(request({ venture: "marketingshark", action: "entry", id: "ds-001", status: "drafted" }, { auth: false }));
    expect(response.status).toBe(401);
  });

  it("refuses a cross-origin write", async () => {
    const response = await POST(request({ venture: "marketingshark", action: "entry", id: "ds-001", status: "drafted" }, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect((await stored()).entries[0]!.status).toBe("planned");
  });

  it("refuses an oversized body with 413", async () => {
    const response = await POST(request(null, { raw: JSON.stringify({ venture: "marketingshark", action: "entry", id: "ds-001", note: "x".repeat(20_000) }) }));
    expect(response.status).toBe(413);
  });

  it("refuses statuses the Queue owns and anything else it does not write", async () => {
    for (const body of [
      { venture: "marketingshark", action: "entry", id: "ds-001", status: "published" },
      { venture: "marketingshark", action: "entry", id: "ds-001", status: "queued" },
      { venture: "marketingshark", action: "entry", id: "ds-001", title: "Renamed" },
      { venture: "marketingshark", action: "entry", id: "ds-001" },
      { venture: "goviral", action: "entry", id: "ds-001", status: "drafted" },
      { venture: "marketingshark", action: "entry", id: "../x", status: "drafted" },
      { venture: "marketingshark", action: "entry", id: "ds-001", note: "x".repeat(501) },
      { venture: "marketingshark", action: "prelaunch", id: "ds-pre-01", done: "yes" }
    ]) {
      expect((await POST(request(body))).status, JSON.stringify(body)).toBe(422);
    }
    expect((await POST(request(null, { raw: "{not json" }))).status).toBe(400);
  });

  it("writes an entry's status and note and leaves the rest of the file as it was", async () => {
    const response = await POST(request({ venture: "marketingshark", action: "entry", id: "ds-001", status: "drafted", note: "  Draft in Notes  " }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(await response.json()).toMatchObject({ ok: true, persistence: "filesystem", id: "ds-001", status: "drafted", note: "Draft in Notes" });
    const next = await stored();
    expect(next.entries[0]).toEqual({ ...(fixture.entries as Array<Record<string, unknown>>)[0], status: "drafted", note: "Draft in Notes" });
    expect({ ...next, entries: null }).toEqual({ ...fixture, entries: null });
  });

  it("clears a note and asks for a reason before blocking", async () => {
    await POST(request({ venture: "marketingshark", action: "entry", id: "ds-001", note: "temporary" }));
    await POST(request({ venture: "marketingshark", action: "entry", id: "ds-001", note: null }));
    expect((await stored()).entries[0]).not.toHaveProperty("note");
    expect((await POST(request({ venture: "marketingshark", action: "entry", id: "ds-001", status: "blocked" }))).status).toBe(422);
    expect((await POST(request({ venture: "marketingshark", action: "entry", id: "ds-001", status: "blocked", note: "Threads profile missing" }))).status).toBe(200);
  });

  it("ticks and unticks a pre-launch item", async () => {
    expect((await POST(request({ venture: "marketingshark", action: "prelaunch", id: "ds-pre-01", done: true }))).status).toBe(200);
    expect((await stored()).prelaunch[0]!.status).toBe("done");
    expect((await POST(request({ venture: "marketingshark", action: "prelaunch", id: "ds-pre-01", done: false }))).status).toBe(200);
    expect((await stored()).prelaunch[0]!.status).toBe("planned");
  });

  it("answers 404 for an id the plan does not hold", async () => {
    expect((await POST(request({ venture: "marketingshark", action: "entry", id: "ds-999", status: "skipped" }))).status).toBe(404);
  });

  it("is read-only in production without a GitHub token", async () => {
    vi.stubEnv("VERCEL", "1");
    const response = await POST(request({ venture: "marketingshark", action: "entry", id: "ds-001", status: "skipped" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "UNAVAILABLE" });
  });

  it("commits through the GitHub Contents API and retries a sha conflict", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "test-token");
    const content = Buffer.from(JSON.stringify(fixture)).toString("base64");
    const puts: Array<{ message: string; content: string }> = [];
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return Response.json({ encoding: "base64", content, sha: `sha-${attempt}` });
      attempt += 1;
      puts.push(JSON.parse(String(init.body)));
      return new Response(null, { status: attempt === 1 ? 409 : 200 });
    }));
    const response = await POST(request({ venture: "marketingshark", action: "entry", id: "ds-002", status: "skipped" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ persistence: "github", status: "skipped" });
    expect(puts).toHaveLength(2);
    expect(puts[1]!.message).toBe("admin: marketing calendar marketingshark ds-002 skipped");
    const written = JSON.parse(Buffer.from(puts[1]!.content, "base64").toString("utf8"));
    expect(written.entries[1].status).toBe("skipped");
  });
});

describe("parseMarketingCalendarAction", () => {
  it("normalises a blank note to null", () => {
    expect(parseMarketingCalendarAction({ venture: "caught-up", action: "entry", id: "dn-001", note: "   " })).toEqual({ venture: "caught-up", action: "entry", id: "dn-001", note: null });
  });
});
