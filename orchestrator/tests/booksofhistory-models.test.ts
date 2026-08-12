import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_LIMITS, estimateTextCall } from "../src/budget.js";
import { configRoot } from "../src/paths.js";

interface BookModelRole {
  provider: "anthropic";
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxSearchContentTokens?: number;
  webSearchUses?: number;
}

async function roles(): Promise<Record<string, BookModelRole>> {
  const config = JSON.parse(await readFile(path.join(configRoot, "models.json"), "utf8")) as {
    roles: Record<string, BookModelRole>;
  };
  return config.roles;
}

describe("BOOKSOFHISTORY model routes", () => {
  it("resolves the two judgment seats and three research roles", async () => {
    const configured = await roles();
    expect(configured.FOLIO).toMatchObject({
      provider: "anthropic", model: "claude-sonnet-5", maxInputTokens: 8000, maxOutputTokens: 1200
    });
    expect(configured.PLOT).toMatchObject({
      provider: "anthropic", model: "claude-sonnet-5", maxInputTokens: 8000, maxOutputTokens: 3000
    });
    expect(configured.RESEARCH_GATHER).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      maxInputTokens: 4000,
      maxSearchContentTokens: 20000,
      maxOutputTokens: 4000,
      webSearchUses: 5
    });
    expect(configured.RESEARCH_SYNTH).toMatchObject({
      provider: "anthropic", model: "claude-haiku-4-5-20251001", maxInputTokens: 12000, maxOutputTokens: 3000
    });
    expect(configured.CLAIM_CHECK).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      maxInputTokens: 6000,
      maxSearchContentTokens: 6000,
      maxOutputTokens: 1200,
      webSearchUses: 3
    });
  });

  it("keeps every maximum reservation below the immutable per-call ceiling", async () => {
    const configured = await roles();
    for (const name of ["FOLIO", "PLOT", "RESEARCH_GATHER", "RESEARCH_SYNTH", "CLAIM_CHECK"] as const) {
      const role = configured[name]!;
      const estimate = estimateTextCall({
        provider: role.provider,
        model: role.model,
        promptChars: role.maxInputTokens * 3.5,
        maxOutputTokens: role.maxOutputTokens,
        maxSearchContentTokens: role.maxSearchContentTokens,
        webSearchUses: role.webSearchUses,
        at: new Date("2026-09-01T00:00:00.000Z")
      });
      expect(estimate.estimatedUsd, `${name} reserves ${estimate.estimatedUsd}`).toBeLessThanOrEqual(
        DEFAULT_BUDGET_LIMITS.perTextCallUsd
      );
    }
    expect(configured.RESEARCH_GATHER!.webSearchUses).toBeLessThanOrEqual(8);
    expect(configured.CLAIM_CHECK!.webSearchUses).toBeLessThanOrEqual(3);
  });
});
