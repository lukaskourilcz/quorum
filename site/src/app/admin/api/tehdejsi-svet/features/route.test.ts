import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const ORIGIN = "https://boardless.example";
const AT = "2026-08-15T10:05:00.000Z";
let root = "";
let draft: Record<string, unknown>;

interface RecordedRecommendation {
  status: string;
  humanReviewRequired: boolean;
  humanReviewedAt: string | null;
  payload: { slides: Array<{ cs: string; ua: string }> };
  designLab: { summaryPath: string | null; readyAt: string | null };
  owner: { postedUrls: { cs: string | null; ua: string | null }; rejectionReason: string | null };
}

function asDraft(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    status: "draft",
    humanReviewedAt: null,
    designLab: { summaryPath: null, readyAt: null },
    owner: { postedUrls: { cs: null, ua: null }, rejectionReason: null },
    updatedAt: value.generatedAt
  };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "quorum-ts-feature-route-"));
  const fixture = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation-tehdejsi.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  draft = asDraft(fixture);
  draft.media = (draft.media as Array<{ licence: string }>).filter(({ licence }) => licence === "own-render");
  const directory = path.join(root, "state/ventures/tehdejsi-svet/drafts");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "recommendation.json"), `${JSON.stringify(draft, null, 2)}\n`);
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
  return new Request(`${ORIGIN}/admin/api/tehdejsi-svet/features`, { method: "POST", headers, body: text });
}

const action = (kind: string, key: string, extra: Record<string, unknown> = {}) => ({
  action: kind,
  recommendationId: draft.id,
  idempotencyKey: key,
  at: AT,
  ...extra
});

async function post(body: unknown): Promise<Response> {
  return POST(request(body, { authenticated: true }));
}

async function recordedRecommendation(): Promise<RecordedRecommendation> {
  return JSON.parse(await readFile(
    path.join(root, "state/ventures/tehdejsi-svet/drafts/recommendation.json"),
    "utf8"
  )) as RecordedRecommendation;
}

describe("Tehdejsi svet feature actions", () => {
  it("keeps the writer behind authentication, same-origin and size gates", async () => {
    expect((await POST(request(action("approve", "approve-one")))).status).toBe(401);
    expect((await POST(request(action("approve", "approve-one"), { authenticated: true, origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(action("approve", "approve-one"), { authenticated: true, size: 600_000 }))).status).toBe(413);
  });

  it("approves once, records the Czech-primary summary and returns the receipt on retry", async () => {
    const originalPayload = draft.payload as { captionCs: string; captionUa: string };
    const first = await post(action("approve", "approve-one"));
    const second = await post(action("approve", "approve-one"));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      idempotent: true,
      status: "approved",
      readyToPost: {
        captions: { cs: originalPayload.captionCs, ua: originalPayload.captionUa },
        export: { venture: "tehdejsi-svet", slug: draft.id, date: draft.date }
      }
    });

    const recommendation = await recordedRecommendation();
    expect(recommendation).toMatchObject({
      status: "approved",
      humanReviewedAt: null,
      designLab: { readyAt: AT }
    });
    expect(recommendation.designLab.summaryPath).not.toBeNull();
    const summary = JSON.parse(await readFile(path.join(root, recommendation.designLab.summaryPath!), "utf8"));
    expect(summary).toMatchObject({ venture: "tehdejsi-svet", locale: "cs", slug: draft.id });
    expect(summary.passages).toEqual((draft.payload as { slides: Array<{ cs: string }> }).slides.map(({ cs }) => cs));
  });

  it("blocks tier-2 approval until human review is explicitly completed", async () => {
    draft = {
      ...draft,
      evidence: { ...(draft.evidence as object), sensitivityTier: 2 },
      payload: { ...(draft.payload as object), ctaKind: "none", captionCs: "Citlivý syntetický popis bez účastnické otázky.", captionUa: "Чутливий синтетичний опис без запитання до участі." },
      humanReviewRequired: true
    };
    await writeFile(
      path.join(root, "state/ventures/tehdejsi-svet/drafts/recommendation.json"),
      `${JSON.stringify(draft, null, 2)}\n`
    );

    const blocked = await post(action("approve", "tier-two-blocked"));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ code: "CONFLICT" });
    expect((await recordedRecommendation()).status).toBe("draft");

    const approved = await post(action("approve", "tier-two-reviewed", { humanReviewCompleted: true }));
    expect(approved.status).toBe(201);
    expect(await recordedRecommendation()).toMatchObject({
      status: "approved",
      humanReviewRequired: true,
      humanReviewedAt: AT
    });
  });

  it("preserves the original package in the receipt when edited copy is approved", async () => {
    const payload = structuredClone(draft.payload) as {
      slides: Array<{ ordinal: number; cs: string; ua: string }>;
      captionCs: string;
      captionUa: string;
      ctaKind: string;
    };
    payload.slides[0]!.cs = "Upravený syntetický úvod otevírá rodinnou vzpomínku.";
    payload.slides[0]!.ua = "Відредагований синтетичний вступ відкриває родинний спогад.";
    const response = await post(action("edit-approve", "edit-one", {
      reason: "Owner tightened both synthetic cover lines.",
      payload
    }));
    expect(response.status).toBe(201);
    expect((await recordedRecommendation()).payload.slides[0]!.cs).toBe(payload.slides[0]!.cs);
    const receipt = JSON.parse(await readFile(
      path.join(root, `state/ventures/tehdejsi-svet/feature-actions/${draft.id}/edit-one.json`),
      "utf8"
    ));
    expect(receipt.before.payload.slides[0].cs).not.toBe(payload.slides[0]!.cs);
    expect(receipt.after.payload.slides[0].cs).toBe(payload.slides[0]!.cs);
  });

  it("does not mark a credited photo package ready when its image bytes are absent", async () => {
    draft.media = [
      ...(draft.media as unknown[]),
      {
        slideOrdinal: 2,
        source: "Synthetic archive fixture",
        sourceUrl: "https://example.test/synthetic-photo",
        licence: "cc-by-sa",
        attribution: "Synthetic archive photo · CC BY-SA 4.0"
      }
    ];
    await writeFile(
      path.join(root, "state/ventures/tehdejsi-svet/drafts/recommendation.json"),
      `${JSON.stringify(draft, null, 2)}\n`
    );
    const response = await post(action("approve", "photo-without-bytes"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CONFLICT" });
    expect((await recordedRecommendation()).status).toBe("draft");

    const mediaDirectory = path.join(root, "state/ventures/tehdejsi-svet/media");
    await mkdir(mediaDirectory, { recursive: true });
    await writeFile(
      path.join(mediaDirectory, `${draft.id}.png`),
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
    );
    expect((await post(action("approve", "photo-with-bytes"))).status).toBe(201);
    const ready = await recordedRecommendation();
    expect(ready.status).toBe("approved");
    const summary = JSON.parse(await readFile(path.join(root, ready.designLab.summaryPath!), "utf8"));
    expect(summary).toMatchObject({ hasHero: true, heroCredit: "Synthetic archive photo · CC BY-SA 4.0" });
  });

  it("requires a rejection reason and stores it without a Studio summary", async () => {
    expect((await post(action("reject", "reject-missing"))).status).toBe(422);
    expect((await post(action("reject", "reject-one", { reason: "The synthetic angle is too weak." }))).status).toBe(201);
    expect(await recordedRecommendation()).toMatchObject({
      status: "rejected",
      owner: { rejectionReason: "The synthetic angle is too weak." },
      designLab: { summaryPath: null, readyAt: null }
    });
  });

  it("records each owner-posted URL without contacting either platform", async () => {
    await post(action("approve", "approve-one"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect((await post(action("posted", "post-cs", { locale: "cs", url: "https://social.example/synthetic-cs" }))).status).toBe(201);
    expect((await recordedRecommendation()).status).toBe("approved");
    expect((await post(action("posted", "post-ua", { locale: "ua", url: "https://social.example/synthetic-ua" }))).status).toBe(201);
    expect(await recordedRecommendation()).toMatchObject({
      status: "posted",
      owner: { postedUrls: { cs: "https://social.example/synthetic-cs", ua: "https://social.example/synthetic-ua" } }
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("makes the approved bilingual pack available through the existing PNG and ZIP routes", async () => {
    expect((await post(action("approve", "approve-export"))).status).toBe(201);
    const cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "correct-password")}`;
    const recipe = "tower~a~none~10~0";
    const { GET: preview } = await import("@/app/admin/api/carousel-studio/deck/[venture]/[slug]/[date]/[recipe]/[slide]/route");
    const image = await preview(
      new Request(`${ORIGIN}/preview?format=instagram-portrait`, { headers: { cookie } }),
      { params: Promise.resolve({ venture: "tehdejsi-svet", slug: String(draft.id), date: String(draft.date), recipe, slide: "1" }) }
    );
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(1_000);

    const { GET: exportDeck } = await import("@/app/admin/api/carousel-studio/export/[venture]/[slug]/[date]/[recipe]/route");
    const archive = await exportDeck(
      new Request(`${ORIGIN}/export?format=instagram-portrait`, { headers: { cookie } }),
      { params: Promise.resolve({ venture: "tehdejsi-svet", slug: String(draft.id), date: String(draft.date), recipe }) }
    );
    expect(archive.status).toBe(200);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      "caption-cs.txt",
      "caption-ua.txt",
      "tehdejsi-svet-2026-08-14-slide-01.png",
      "tehdejsi-svet-2026-08-14-slide-02.png",
      "tehdejsi-svet-2026-08-14-slide-03.png"
    ]));
    const decoder = new TextDecoder();
    expect(decoder.decode(files["caption-cs.txt"]!)).toBe(`${(draft.payload as { captionCs: string }).captionCs}\n`);
    expect(decoder.decode(files["caption-ua.txt"]!)).toBe(`${(draft.payload as { captionUa: string }).captionUa}\n`);
  }, 120_000);

  it("leaves result records to TS-23a instead of accepting an early competing action", async () => {
    expect((await post(action("result", "result-one", {
      locale: "cs",
      platform: "instagram",
      metrics: { shares: 3 }
    }))).status).toBe(422);
  });
});
