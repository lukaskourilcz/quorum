import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const ORIGIN = "https://boardless.example";
const AT = "2026-08-14T10:05:00.000Z";
let root = "";
let fixture: Record<string, unknown>;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-feature-route-"));
  fixture = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/booksofhistory-recommendation.valid.json"), "utf8")) as Record<string, unknown>;
  const directory = path.join(root, "state/ventures/booksofhistory/recommendations");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "recommendation.json"), `${JSON.stringify(fixture, null, 2)}\n`);
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state/INBOX.md"), "- [ ] HUMAN_APPROVAL BH-RESULTS-004 — pending\n");
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "correct-password");
  vi.stubEnv("NODE_ENV", "development");
  vi.unstubAllGlobals();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(root, { recursive: true, force: true });
});

function request(body: unknown, options: { authenticated?: boolean; origin?: string; size?: number } = {}): Request {
  const text = JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? ORIGIN,
    "content-length": String(options.size ?? text.length)
  };
  if (options.authenticated) {
    headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "correct-password")}`;
  }
  return new Request(`${ORIGIN}/admin/api/booksofhistory/features`, { method: "POST", headers, body: text });
}

const action = (kind: string, key: string, extra: Record<string, unknown> = {}) => ({
  action: kind,
  recommendationId: "rec-aaaaaaaaaaaaaaaaaaaa",
  idempotencyKey: key,
  at: AT,
  ...extra
});

async function post(body: unknown) {
  return POST(request(body, { authenticated: true }));
}

async function recordedRecommendation() {
  return JSON.parse(await readFile(path.join(root, "state/ventures/booksofhistory/recommendations/recommendation.json"), "utf8")) as {
    status: string;
    payloads: { cs: { headline: string }; en: { headline: string } };
    designLab: { status: string; summaryRefs: { cs: string; en: string } | null };
    owner: { postedUrls: { cs: string | null; en: string | null }; resultRefs: { cs: string[]; en: string[] } };
  };
}

describe("BOOKSOFHISTORY feature actions", () => {
  it("keeps the write behind authentication, origin and size gates", async () => {
    expect((await POST(request(action("approve", "approve-one")))).status).toBe(401);
    expect((await POST(request(action("approve", "approve-one"), { authenticated: true, origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(action("approve", "approve-one"), { authenticated: true, size: 600_000 }))).status).toBe(413);
  });

  it("approves once, records both locale summaries and returns the same receipt on retry", async () => {
    const first = await post(action("approve", "approve-one"));
    const second = await post(action("approve", "approve-one"));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ idempotent: true, status: "approved" });

    const recommendation = await recordedRecommendation();
    expect(recommendation.designLab).toMatchObject({ status: "ready" });
    expect(recommendation.designLab.summaryRefs).not.toBeNull();
    const refs = Object.values(recommendation.designLab.summaryRefs!);
    expect(refs).toHaveLength(2);
    const summaries = await Promise.all(refs.map((ref) => readFile(path.join(root, "state", ref), "utf8")));
    expect(summaries.map((raw) => JSON.parse(raw).locale).sort()).toEqual(["cs", "en"]);
    expect(new Set(summaries.map((raw) => JSON.parse(raw).slug)).size).toBe(1);
  });

  it("preserves the original record when edited packages are approved", async () => {
    const payloads = structuredClone(fixture.payloads) as { cs: { headline: string }; en: { headline: string } };
    payloads.cs.headline = "Upravený příběh vydání knihy";
    payloads.en.headline = "An edited story of the book's publication";
    const response = await post(action("edit-approve", "edit-one", { reason: "Owner tightened both cover lines.", payloads }));
    expect(response.status).toBe(201);
    const recommendation = await recordedRecommendation();
    expect(recommendation.payloads.cs.headline).toBe(payloads.cs.headline);
    const receipt = JSON.parse(await readFile(
      path.join(root, "state/ventures/booksofhistory/feature-actions/rec-aaaaaaaaaaaaaaaaaaaa/edit-one.json"),
      "utf8"
    ));
    expect(receipt.before.payloads.cs.headline).not.toBe(payloads.cs.headline);
    expect(receipt.after.payloads.cs.headline).toBe(payloads.cs.headline);
  });

  it("requires and preserves the owner's rejection reason", async () => {
    expect((await post(action("reject", "reject-missing"))).status).toBe(422);
    const response = await post(action("reject", "reject-one", { reason: "The narrative turn is not strong enough." }));
    expect(response.status).toBe(201);
    expect((await recordedRecommendation()).status).toBe("rejected");
    const receipt = JSON.parse(await readFile(
      path.join(root, "state/ventures/booksofhistory/feature-actions/rec-aaaaaaaaaaaaaaaaaaaa/reject-one.json"),
      "utf8"
    ));
    expect(receipt.action.reason).toBe("The narrative turn is not strong enough.");
  });

  it("records the owner's posted URL independently for each lane and never posts", async () => {
    await post(action("approve", "approve-one"));
    await writeFile(
      path.join(root, "state/ventures/booksofhistory/research-ledger.jsonl"),
      `${JSON.stringify(JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/bh-research-ledger.valid.json"), "utf8")))}\n`
    );
    expect((await post(action("posted", "post-cs", { locale: "cs", url: "https://social.example/cs-post" }))).status).toBe(201);
    expect(JSON.parse((await readFile(path.join(root, "state/ventures/booksofhistory/research-ledger.jsonl"), "utf8")).trim()).used).toBe(true);
    expect((await recordedRecommendation()).status).toBe("approved");
    expect((await post(action("posted", "post-en", { locale: "en", url: "https://social.example/en-post" }))).status).toBe(201);
    const recommendation = await recordedRecommendation();
    expect(recommendation.status).toBe("posted");
    expect(recommendation.owner.postedUrls).toEqual({
      cs: "https://social.example/cs-post",
      en: "https://social.example/en-post"
    });
  });

  it("keeps result references disabled until BH-RESULTS-004 is signed", async () => {
    await post(action("approve", "approve-one"));
    await post(action("posted", "post-cs", { locale: "cs", url: "https://social.example/booksofhistory-cs" }));
    const result = action("result", "result-cs", {
      locale: "cs",
      resultRef: "ventures/booksofhistory/results/result-aaaaaaaaaaaaaaaaaaaa.json"
    });
    expect((await post(result)).status).toBe(409);
    await writeFile(path.join(root, "state/INBOX.md"), "- [x] HUMAN_APPROVAL BH-RESULTS-004 — approved\n");
    const resultPath = path.join(root, "state/ventures/booksofhistory/results/result-aaaaaaaaaaaaaaaaaaaa.json");
    await mkdir(path.dirname(resultPath), { recursive: true });
    const entry = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/owner-result-entry.valid.json"), "utf8"));
    entry.capturedAt = "2026-08-14T10:04:00.000Z";
    entry.recordedAt = AT;
    await writeFile(resultPath, `${JSON.stringify(entry)}\n`);
    expect((await post(result)).status).toBe(201);
    expect((await recordedRecommendation()).owner.resultRefs.cs).toEqual([
      "ventures/booksofhistory/results/result-aaaaaaaaaaaaaaaaaaaa.json"
    ]);
  });
});
