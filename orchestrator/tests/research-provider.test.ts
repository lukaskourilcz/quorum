import { describe, expect, it, vi } from "vitest";
import {
  createResearchProviderRegistry,
  ResearchProviderRegistryError,
  resolveResearchProvider,
  type RawResearch,
  type ResearchProvider
} from "../src/research/provider.js";

function stubProvider(result: RawResearch): ResearchProvider {
  return { researchBook: vi.fn(async () => result) };
}

const rawResearch: RawResearch = {
  response: { sources: ["https://example.com/book"] },
  providerId: "stub",
  model: "fixture-model",
  startedAt: "2026-08-12T10:00:00.000Z",
  completedAt: "2026-08-12T10:00:01.000Z",
  tokensIn: 10,
  tokensOut: 20,
  searchUses: 1,
  usd: 0.01
};

describe("research provider registry", () => {
  it("resolves the provider named by config and forwards a vendor-neutral request", async () => {
    const chosen = stubProvider(rawResearch);
    const unused = stubProvider({ ...rawResearch, providerId: "unused" });
    const chosenFactory = vi.fn(() => chosen);
    const unusedFactory = vi.fn(() => unused);
    const registry = createResearchProviderRegistry([
      ["stub", chosenFactory],
      ["unused", unusedFactory]
    ]);

    const provider = resolveResearchProvider({ providerId: "stub" }, registry);
    const request = {
      bookRef: "ventures/books/seed.json#book-001",
      brief: { objective: "Verify the publication story" },
      envelopeUsd: 0.1
    };

    await expect(provider.researchBook(request)).resolves.toEqual(rawResearch);
    expect(chosenFactory).toHaveBeenCalledOnce();
    expect(unusedFactory).not.toHaveBeenCalled();
    expect(chosen.researchBook).toHaveBeenCalledWith(request);
  });

  it("fails closed when config names an unregistered provider", () => {
    const registry = createResearchProviderRegistry([]);
    expect(() => resolveResearchProvider({ providerId: "missing" }, registry))
      .toThrowError(new ResearchProviderRegistryError("Unknown research provider: missing"));
  });

  it("rejects duplicate ids instead of silently replacing an adapter", () => {
    const provider = stubProvider(rawResearch);
    expect(() => createResearchProviderRegistry([
      ["stub", () => provider],
      ["stub", () => provider]
    ])).toThrowError("Research provider stub is registered more than once");
  });
});
