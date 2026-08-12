import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BhDossierSchema, type BhDossier } from "../src/contracts/bh-dossier.js";
import { repoRoot } from "../src/paths.js";
import type { RawResearch, ResearchProvider } from "../src/research/provider.js";
import { atomicWriteJson } from "../src/state.js";
import { BH_RESEARCH_LEDGER_PATH, bhDossierPath, parseBhResearchLedgerJsonl } from "../src/ventures/booksofhistory/research.js";
import {
  bhDossierSupplementPath,
  runBhDossierSupplement
} from "../src/ventures/booksofhistory/supplements.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function dossier(updatedAt = "2026-04-01T10:00:00.000Z"): Promise<BhDossier> {
  const fixture = JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/bh-dossier.valid.json"),
    "utf8"
  )) as BhDossier;
  return BhDossierSchema.parse({ ...fixture, updatedAt });
}

function rawSupplement(): RawResearch {
  return {
    response: {
      findings: [{
        claimRef: "claim-publication-context",
        status: "confirmed",
        summary: "The time-sensitive catalogue status remains confirmed as of the requested date.",
        sources: ["https://example.com/archive/current"]
      }]
    },
    providerId: "anthropic-web-search",
    model: "claude-haiku-4-5-20251001",
    startedAt: "2026-08-12T10:20:00.000Z",
    completedAt: "2026-08-12T10:20:01.000Z",
    tokensIn: 300,
    tokensOut: 100,
    searchUses: 2,
    usd: 0.04
  };
}

function provider(raw = rawSupplement()) {
  const researchBook = vi.fn(async (_input: Parameters<ResearchProvider["researchBook"]>[0]) => raw);
  return { value: { researchBook } satisfies ResearchProvider, researchBook };
}

function args(root: string, stored: BhDossier, researchProvider: ResearchProvider) {
  return {
    root,
    dossier: stored,
    selectedStoryId: "story-serial-to-book",
    timeSensitiveClaimRefs: ["claim-publication-context"],
    date: "2026-08-12",
    now: new Date("2026-08-12T10:20:02.000Z"),
    provider: researchProvider,
    envelopeUsd: 0.05,
    cycleId: "bh-20260812-001",
    cycleEnvelopeUsd: 0.5,
    monthlyCeilingUsd: 5,
    requestingMeetingRef: "meetings/2026-08-12-bh-desk.json"
  };
}

describe("BOOKSOFHISTORY dossier supplements", () => {
  it("refreshes only the requested time-sensitive layer and leaves stable dossier bytes untouched", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-supplement-"));
    roots.push(root);
    const stored = await dossier();
    await atomicWriteJson(root, bhDossierPath(stored.bookId), stored);
    const before = await readFile(path.join(root, bhDossierPath(stored.bookId)), "utf8");
    const research = provider();

    const result = await runBhDossierSupplement(args(root, stored, research.value));

    expect(result.status).toBe("refreshed");
    if (result.status !== "refreshed") throw new Error("old dossier must receive a supplement");
    expect(research.researchBook).toHaveBeenCalledOnce();
    expect(research.researchBook).toHaveBeenCalledWith(expect.objectContaining({ envelopeUsd: 0.05 }));
    const providerBrief = research.researchBook.mock.calls[0]![0].brief as {
      claims: Array<{ claimId: string }>;
      avoid: string;
    };
    expect(providerBrief.claims).toEqual([expect.objectContaining({ claimId: "claim-publication-context" })]);
    expect(providerBrief.avoid).toContain("Do not re-research or rewrite stable historical claims");
    expect(await readFile(path.join(root, bhDossierPath(stored.bookId)), "utf8")).toBe(before);
    expect(JSON.parse(await readFile(path.join(root, result.supplementRef), "utf8"))).toEqual(result.supplement);
    const ledger = parseBhResearchLedgerJsonl(await readFile(path.join(root, BH_RESEARCH_LEDGER_PATH), "utf8"));
    expect(ledger).toEqual([
      expect.objectContaining({ step: "supplement", reason: "supplemental-freshness", costUsd: 0.04, searches: 2 })
    ]);

    const retryProvider = provider();
    const retry = await runBhDossierSupplement(args(root, stored, retryProvider.value));
    expect(retry.status).toBe("already-supplemented");
    expect(retryProvider.researchBook).not.toHaveBeenCalled();
  });

  it("does nothing at exactly 90 days and refuses an envelope above five cents before a call", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-supplement-cap-"));
    roots.push(root);
    const now = new Date("2026-08-12T10:20:02.000Z");
    const exactlyNinety = await dossier(new Date(now.getTime() - 90 * 86_400_000).toISOString());
    const freshProvider = provider();
    const fresh = await runBhDossierSupplement({
      ...args(root, exactlyNinety, freshProvider.value),
      now
    });
    expect(fresh.status).toBe("not-needed");
    expect(freshProvider.researchBook).not.toHaveBeenCalled();

    const old = await dossier();
    const expensiveProvider = provider();
    await expect(runBhDossierSupplement({
      ...args(root, old, expensiveProvider.value),
      envelopeUsd: 0.051
    })).rejects.toThrow("at most $0.05");
    expect(expensiveProvider.researchBook).not.toHaveBeenCalled();
    await expect(readFile(path.join(root, bhDossierSupplementPath(old.bookId, "2026-08-12")), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});
