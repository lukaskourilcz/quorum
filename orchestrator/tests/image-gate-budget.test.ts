import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERATED_GATE_ESTIMATE_USD,
  IMAGE_GATE_ARTICLE_CAP_USD,
  IMAGE_GATE_PHASE,
  IMAGE_PROGRAM_DAY_CAP_USD,
  ImageProgramBudget,
  readImageProgramSpendToday
} from "../src/images/budget.js";
import { guardedVisionCall } from "../src/llm/vision.js";
import { atomicWriteJson } from "../src/state.js";
import type { AnthropicVisionRequest, VisionProviderResponse } from "../src/llm/anthropic.js";

const MODEL = "claude-haiku-4-5-20251001";

function fakeClient(
  reply: unknown,
  calls: AnthropicVisionRequest[],
  options: { truncated?: boolean; tokensOut?: number } = {}
) {
  return {
    generate: async (request: AnthropicVisionRequest): Promise<VisionProviderResponse> => {
      calls.push(request);
      return {
        value: reply,
        model: MODEL,
        tokensIn: 1_200,
        tokensOut: options.tokensOut ?? 200,
        cachedTokensIn: 0,
        cacheWriteTokensIn: 0,
        truncated: options.truncated ?? false
      };
    }
  };
}

/** A client that fails the test if anything reaches it. An over-cap call must not open a socket. */
const forbiddenClient = {
  generate: async (): Promise<VisionProviderResponse> => {
    throw new Error("an over-cap gate request reached the provider");
  }
};

function request(root: string, budget: ImageProgramBudget, client: {
  generate: (request: AnthropicVisionRequest) => Promise<VisionProviderResponse>;
}) {
  return {
    stateRoot: root,
    cycleId: "cycle-test",
    phase: IMAGE_GATE_PHASE,
    ventureId: "caught-up",
    agent: "IMAGE_GATE",
    model: MODEL,
    system: "You look at pictures.",
    input: "Which of these fits?",
    images: [
      { mediaType: "image/webp" as const, base64: "AAAA", label: "candidate 0" },
      { mediaType: "image/webp" as const, base64: "BBBB", label: "candidate 1" }
    ],
    maxOutputTokens: 1_200,
    tool: { name: "emit_verdict", description: "The verdict", inputSchema: { type: "object" } },
    parse: (value: unknown) => value as { verdicts: unknown[] },
    budget,
    client
  };
}

describe("the image programme's caps", () => {
  it("refuses an over-cap gate request locally and tells the caller to descend", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "image-gate-"));
    // The article has already spent its whole allowance, which is what a second or third gate
    // call on one article looks like. Nothing may reach a provider from here.
    const budget = new ImageProgramBudget({ usd: 0.005, generatedImages: 0 });
    budget.record(IMAGE_GATE_ARTICLE_CAP_USD);
    const result = await guardedVisionCall(request(root, budget, forbiddenClient));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("cap:article-cap");
    expect(result.usd).toBe(0);
  });

  it("refuses when the day's whole image programme is spent, whatever this article has cost", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "image-gate-"));
    const budget = new ImageProgramBudget({ usd: IMAGE_PROGRAM_DAY_CAP_USD, generatedImages: 0 });
    const result = await guardedVisionCall(request(root, budget, forbiddenClient));

    expect(result.ok === false && result.reason).toBe("cap:day-cap");
    expect(budget.articleSpent()).toBe(0);
  });

  it("bills a call that did happen, under the programme's own phase", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "image-gate-"));
    const budget = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    const calls: AnthropicVisionRequest[] = [];
    const result = await guardedVisionCall(
      request(root, budget, fakeClient({ verdicts: [] }, calls))
    );

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    // Every label is followed by its own picture, so a verdict list cannot drift by one.
    expect(calls[0]!.images.map((image) => image.label)).toEqual(["candidate 0", "candidate 1"]);
    const ledger = JSON.parse(
      await readFile(path.join(root, "budget", "ledger.json"), "utf8")
    ) as { entries: Array<{ phase: string; agent: string; ventureId: string; usd: number; kind: string }> };
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]!.phase).toBe(IMAGE_GATE_PHASE);
    expect(ledger.entries[0]!.agent).toBe("IMAGE_GATE");
    expect(ledger.entries[0]!.ventureId).toBe("caught-up");
    expect(ledger.entries[0]!.kind).toBe("text");
    expect(ledger.entries[0]!.usd).toBeGreaterThan(0);
    expect(budget.articleSpent()).toBe(ledger.entries[0]!.usd);
  });

  it("closes the budget on a reply that was billed and could not be read", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "image-gate-"));
    const budget = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    const calls: AnthropicVisionRequest[] = [];
    const result = await guardedVisionCall({
      ...request(root, budget, fakeClient({ nonsense: true }, calls)),
      parse: () => {
        throw new Error("verdict does not match the contract");
      }
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason.startsWith("unparsable:")).toBe(true);
    // The provider billed for it, so it is on the ledger and against the article's allowance.
    expect(result.usd).toBeGreaterThan(0);
    expect(budget.articleSpent()).toBe(result.usd);
  });

  it("makes no paid call in a dry cycle", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "image-gate-"));
    const budget = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    const result = await guardedVisionCall({
      ...request(root, budget, forbiddenClient),
      dry: true
    });

    expect(result.ok === false && result.reason).toBe("dry_run");
  });

  it("reads the day's spend from the ledger, so three slots share one cap", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "image-gate-"));
    const at = new Date("2026-08-08T18:00:00.000Z");
    await atomicWriteJson(root, "budget/ledger.json", {
      schemaVersion: 1,
      entries: [
        {
          ts: "2026-08-08T04:00:00.000Z",
          cycleId: "morning",
          requestHash: "a".repeat(16),
          phase: IMAGE_GATE_PHASE,
          ventureId: "caught-up",
          agent: "IMAGE_GATE",
          provider: "anthropic",
          model: MODEL,
          serviceTier: "default",
          tokensIn: 900,
          cachedTokensIn: 0,
          tokensOut: 120,
          toolUses: 1,
          usd: 0.004,
          kind: "text"
        },
        {
          ts: "2026-08-08T12:00:00.000Z",
          cycleId: "afternoon",
          requestHash: "b".repeat(16),
          phase: "article_illustration",
          ventureId: "mma-files",
          agent: "ARTICLE_ILLUSTRATION",
          provider: "anthropic",
          model: MODEL,
          serviceTier: "default",
          tokensIn: 0,
          cachedTokensIn: 0,
          tokensOut: 0,
          toolUses: 0,
          usd: 0.003,
          kind: "image"
        },
        {
          // Yesterday, and a different programme besides. Neither belongs in today's figure.
          ts: "2026-08-07T12:00:00.000Z",
          cycleId: "yesterday",
          requestHash: "c".repeat(16),
          phase: IMAGE_GATE_PHASE,
          ventureId: "caught-up",
          agent: "IMAGE_GATE",
          provider: "anthropic",
          model: MODEL,
          serviceTier: "default",
          tokensIn: 900,
          cachedTokensIn: 0,
          tokensOut: 120,
          toolUses: 1,
          usd: 0.09,
          kind: "text"
        },
        {
          ts: "2026-08-08T05:00:00.000Z",
          cycleId: "morning",
          requestHash: "d".repeat(16),
          phase: "cu-edition",
          ventureId: "caught-up",
          agent: "HERALD",
          provider: "anthropic",
          model: MODEL,
          serviceTier: "default",
          tokensIn: 9_000,
          cachedTokensIn: 0,
          tokensOut: 900,
          toolUses: 1,
          usd: 0.05,
          kind: "text"
        }
      ]
    });

    const spend = await readImageProgramSpendToday(root, at);
    expect(spend.usd).toBe(0.007);
    expect(spend.generatedImages).toBe(1);
  });
});

describe("a verdict that did not fit its output budget", () => {
  it("reports truncation, records the spend, and does not call it malformed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gate-truncated-"));
    const budget = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    const calls: AnthropicVisionRequest[] = [];
    // What the provider actually returns when a twelve-candidate list runs past the ceiling: a
    // tool payload with its array half written, and stop_reason max_tokens. The three DNESKAi
    // editions that fell to the plate on 14, 18 and 28 August each look exactly like this.
    const result = await guardedVisionCall(
      request(root, budget, fakeClient({}, calls, { truncated: true, tokensOut: 1_200 }))
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("a truncated verdict must not be accepted");
    expect(result.reason).toMatch(/^truncated:1200-of-1200$/u);
    // Not "unparsable". Blaming the schema for our own ceiling is what hid this for three weeks.
    expect(result.reason).not.toContain("unparsable");
    // The provider billed for the tokens it did produce, so the ledger and the budget must agree
    // that they were spent. A cut-off answer is not a free call.
    expect(result.usd).toBeGreaterThan(0);
    expect(budget.articleSpent()).toBe(result.usd);
    const ledger = JSON.parse(await readFile(path.join(root, "budget/ledger.json"), "utf8")) as {
      entries: Array<{ phase: string; usd: number }>;
    };
    expect(ledger.entries.filter((entry) => entry.phase === IMAGE_GATE_PHASE)).toHaveLength(1);
  });

  it("reserves what the answer is expected to cost, not the ceiling that bounds it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gate-reserve-"));
    const calls: AnthropicVisionRequest[] = [];
    // A one-candidate curated look. Its real verdict is about 130 output tokens; the ceiling that
    // stops a runaway is many times that, and charging the ceiling is what closed the article cap
    // before the ladder had finished descending.
    const generous = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    const reserved = await guardedVisionCall({
      ...request(root, generous, fakeClient({ verdicts: [] }, calls)),
      maxOutputTokens: 1_200,
      expectedOutputTokens: 170
    });
    expect(reserved.ok).toBe(true);

    // The same call, against a budget with only enough room for the expected cost. Reserving the
    // ceiling would refuse it; reserving the estimate lets the rung run.
    const tight = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    tight.record(IMAGE_GATE_ARTICLE_CAP_USD - 0.004);
    const fitted = await guardedVisionCall({
      ...request(await mkdtemp(path.join(tmpdir(), "gate-reserve-2-")), tight, fakeClient({ verdicts: [] }, calls)),
      maxOutputTokens: 1_200,
      expectedOutputTokens: 170
    });
    expect(fitted.ok).toBe(true);
  });
});

describe("a render and the verdict that judges it", () => {
  it("refuses both together rather than paying for one and refusing the other", () => {
    const budget = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    // The 21 August shape: the article has already spent most of its cap on a search and three
    // curated looks, and what is left covers the render but not the verdict.
    budget.record(0.0175);
    expect(budget.reserveGeneratedImage(0.004, GENERATED_GATE_ESTIMATE_USD)).toBe("article-cap");
    // The day figure alone is untouched and would still have allowed it — which is exactly what
    // the old check consulted, and why the $0.004 was spent before the gate refused it. Exactly
    // one fal render exists in the ledger and it shipped nothing.
    expect(budget.spent().usd).toBeLessThan(IMAGE_PROGRAM_DAY_CAP_USD);
  });

  it("still allows the rung when the whole sequence fits", () => {
    const budget = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
    budget.record(0.008);
    expect(budget.reserveGeneratedImage(0.004, GENERATED_GATE_ESTIMATE_USD)).toBeNull();
  });

  it("keeps the day limit a count, whatever the money says", () => {
    const budget = new ImageProgramBudget({ usd: 0.02, generatedImages: 2 });
    expect(budget.reserveGeneratedImage(0.004, GENERATED_GATE_ESTIMATE_USD)).toBe("generation-day-limit");
  });
});
