import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  applyDoorMoneyRecommendationDecision,
  parseDoorMoneyRecommendation,
  recommendationCarouselSummary,
  type DoorMoneyCopyBlock,
  type DoorMoneyRecommendation
} from "./door-money-recommendations-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture(overrides: Record<string, unknown> = {}): Promise<DoorMoneyRecommendation> {
  const raw = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  const parsed = parseDoorMoneyRecommendation({ ...raw, ...overrides });
  if (!parsed) throw new Error("The shared synthetic recommendation fixture did not parse");
  return parsed;
}

async function stored(recommendation: DoorMoneyRecommendation): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "door-money-decision-"));
  roots.push(root);
  const directory = path.join(root, "state/ventures/door-money/recommendations");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${recommendation.id}.json`), `${JSON.stringify(recommendation, null, 2)}\n`);
  return root;
}

const EDITED: DoorMoneyCopyBlock[] = [
  { kind: "cover", ordinal: 1, text: "The fictional radio broke. The synthetic promise did not." },
  { kind: "body", ordinal: 2, text: "An invented courier kept walking after a made-up errand failed." },
  { kind: "body", ordinal: 3, text: "The synthetic street offered no shortcut and no real-world claim." },
  { kind: "body", ordinal: 4, text: "A fictional neighbor remembered the promise when the object returned." },
  { kind: "outro", ordinal: 5, text: "The rest of the invented story lives in Door Money." }
];

describe("Door Money owner decisions", () => {
  it("approves edited copy, preserves the gated original and writes an English Studio summary", async () => {
    const original = await fixture();
    const root = await stored(original);
    const result = await applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "approve", editedCopyBlocks: EDITED, approvalNote: "Owner tightened the synthetic carousel." },
      now: new Date("2026-08-12T11:00:00.000Z")
    }, root);

    expect(result.changed).toBe(true);
    expect(result.recommendation.status).toBe("approved");
    expect(result.recommendation.copyBlocks).toEqual(original.copyBlocks);
    expect(result.recommendation.owner.editedCopyBlocks).toEqual(EDITED);
    expect(result.summary).toMatchObject({
      venture: "door-money",
      locale: "en",
      coverLine: EDITED[0]!.text,
      closing: EDITED[4]!.text
    });
    expect(result.summary?.passages).toEqual(expect.arrayContaining([EDITED[2]!.text, EDITED[3]!.text]));
    expect(result.summary!.passages.length).toBeGreaterThanOrEqual(3);
    const summaryPath = result.recommendation.designLab.summaryPath!;
    expect(summaryPath).toBe(`state/ventures/carousel-studio/summaries/door-money/${original.date}-${original.id}.json`);
    expect(JSON.parse(await readFile(path.join(root, summaryPath), "utf8"))).toEqual(result.summary);
  });

  it("is retry-idempotent and refuses a different second approval", async () => {
    const original = await fixture();
    const root = await stored(original);
    const first = await applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "approve", editedCopyBlocks: EDITED },
      now: new Date("2026-08-12T11:00:00.000Z")
    }, root);
    const recommendationBytes = await readFile(path.join(root, `state/ventures/door-money/recommendations/${original.id}.json`), "utf8");
    const summaryBytes = await readFile(path.join(root, first.recommendation.designLab.summaryPath!), "utf8");

    const retry = await applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "approve", editedCopyBlocks: EDITED },
      now: new Date("2026-08-12T12:00:00.000Z")
    }, root);
    expect(retry.changed).toBe(false);
    expect(await readFile(path.join(root, `state/ventures/door-money/recommendations/${original.id}.json`), "utf8")).toBe(recommendationBytes);
    expect(await readFile(path.join(root, first.recommendation.designLab.summaryPath!), "utf8")).toBe(summaryBytes);

    await expect(applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "approve", approvalNote: "A conflicting second choice." },
      now: new Date("2026-08-12T12:00:00.000Z")
    }, root)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requires a rejection reason and records it without a Studio summary", async () => {
    const original = await fixture({ id: "fixture-rejected-carousel" });
    const root = await stored(original);
    await expect(applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "reject", reason: "   " },
      now: new Date("2026-08-12T11:00:00.000Z")
    }, root)).rejects.toMatchObject({ code: "CONFLICT" });

    const result = await applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "reject", reason: "The synthetic hook does not earn the carousel." },
      now: new Date("2026-08-12T11:00:00.000Z")
    }, root);
    expect(result.recommendation).toMatchObject({
      status: "rejected",
      owner: { rejectionReason: "The synthetic hook does not earn the carousel.", approvedAt: null }
    });
    expect(result.summary).toBeNull();
  });

  it("records only an HTTPS URL after approval and never contacts it", async () => {
    const original = await fixture({ id: "fixture-posted-carousel" });
    const root = await stored(original);
    await applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "approve" },
      now: new Date("2026-08-12T11:00:00.000Z")
    }, root);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const posted = await applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "posted", postedUrl: "https://example.test/posts/synthetic-radio" },
      now: new Date("2026-08-12T12:00:00.000Z")
    }, root);
    expect(posted.recommendation).toMatchObject({
      status: "posted",
      owner: { postedUrl: "https://example.test/posts/synthetic-radio" }
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    const retry = await applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "posted", postedUrl: "https://example.test/posts/synthetic-radio" },
      now: new Date("2026-08-12T13:00:00.000Z")
    }, root);
    expect(retry.changed).toBe(false);
  });

  it("turns a single-image recommendation into one English poster slide", async () => {
    const original = await fixture({
      id: "fixture-single-image",
      formats: ["single-image"]
    });
    const root = await stored(original);
    const approved = await applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "approve" },
      now: new Date("2026-08-12T11:00:00.000Z")
    }, root);
    expect(approved.summary).toMatchObject({ locale: "en", deckMode: "single-image", passages: [] });

    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    vi.resetModules();
    const { readDesignLab } = await import("./design-lab");
    const [article] = await readDesignLab();
    expect(article).toMatchObject({
      venture: "door-money",
      locale: "en",
      renderable: true,
      recipe: { family: "billboard" }
    });
    expect(article!.slides).toHaveLength(1);
    const { CAROUSEL_BRANDS, articleSlideSlot, recipeTemplate, renderCarouselPng } = await import("@boardlessai/carousel-studio");
    const rendered = await renderCarouselPng({
      template: recipeTemplate(article!.recipe, article!.slides.length),
      payload: { locale: article!.locale, strings: { [articleSlideSlot(0)]: article!.slides[0]!.text } },
      brand: CAROUSEL_BRANDS[article!.venture],
      format: "instagram-portrait"
    });
    expect(rendered).toHaveLength(1);
    expect(rendered[0]!.png.byteLength).toBeGreaterThan(1_000);
  });

  it("refuses forbidden raw text or vectors at the public boundary", async () => {
    const original = await fixture();
    expect(parseDoorMoneyRecommendation({ ...original, fullText: "synthetic but forbidden" })).toBeNull();
    expect(parseDoorMoneyRecommendation({ ...original, evidence: { ...original.evidence, embeddings: [[0.1]] } })).toBeNull();
    expect(JSON.stringify(recommendationCarouselSummary(original))).not.toMatch(/fullText|embedding|private-book:\/\//u);
  });

  it("uses the configured GitHub branch for both approval files and returns their commits", async () => {
    const original = await fixture();
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "fixture-token");
    vi.stubEnv("BOARDLESSAI_GITHUB_BRANCH", "agent/door-money");
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      calls.push({ url, method, body });
      if (method === "GET") {
        if (url.includes("summaries%2Fdoor-money") || url.includes("summaries/door-money")) {
          return new Response(null, { status: 404 });
        }
        return Response.json({
          sha: "1".repeat(40),
          encoding: "base64",
          content: Buffer.from(`${JSON.stringify(original, null, 2)}\n`).toString("base64")
        });
      }
      return Response.json({ commit: { sha: url.includes("summaries") ? "a".repeat(40) : "b".repeat(40) } });
    }));

    const result = await applyDoorMoneyRecommendationDecision({
      id: original.id,
      decision: { action: "approve" },
      now: new Date("2026-08-12T11:00:00.000Z")
    });
    expect(result.commits).toEqual(["aaaaaaa", "bbbbbbb"]);
    expect(calls.filter(({ method }) => method === "PUT")).toHaveLength(2);
    for (const call of calls.filter(({ method }) => method === "PUT")) {
      expect(call.body).toMatchObject({ branch: "agent/door-money" });
    }
  });
});
