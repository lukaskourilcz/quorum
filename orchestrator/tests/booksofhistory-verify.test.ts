import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BhDossierSchema, type BhDossierClaim } from "../src/contracts/bh-dossier.js";
import { repoRoot } from "../src/paths.js";
import type { guardedJsonCall } from "../src/llm/call.js";
import {
  publicationModeForBhClaim,
  triageBhClaim,
  triageBhDossier,
  verifyBhDossierClaims,
  type BhClaimCheckCallConfig
} from "../src/ventures/booksofhistory/verify.js";

async function claim(text: string, sourceHosts = ["archive.example"]): Promise<BhDossierClaim> {
  const dossier = BhDossierSchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/bh-dossier.valid.json"),
    "utf8"
  )));
  return {
    ...dossier.claims[0]!,
    text,
    sources: sourceHosts.map((host, index) => ({
      url: `https://${host}/source-${index}`,
      title: `Source ${index}`,
      category: index === 0 ? "archive" : "scholarship"
    })),
    corroboration: sourceHosts.length
  };
}

describe("BOOKSOFHISTORY deterministic claim triage", () => {
  it("flags a precise rejection hook while leaving a plain publication year ordinary", async () => {
    const rejected = triageBhClaim(await claim("The manuscript was rejected 27 times before publication.", [
      "archive.example", "study.example", "newspaper.example"
    ]));
    expect(rejected).toMatchObject({
      strength: "sensational",
      requiredIndependentSources: 3,
      corroborationSufficient: true,
      escalate: true
    });
    expect(rejected.signals).toEqual(expect.arrayContaining(["precise-dramatic-number", "ban-or-rejection"]));

    const date = triageBhClaim(await claim("The documented book edition was published in 1936."));
    expect(date).toMatchObject({
      strength: "ordinary",
      signals: [],
      requiredIndependentSources: 1,
      corroborationSufficient: true,
      escalate: false
    });
  });

  it("requires stronger independent corroboration for superlative, ban and burning claims", async () => {
    for (const text of [
      "It was the first novel ever to expose the practice.",
      "Authorities banned the edition after release.",
      "Officials burned the remaining copies."
    ]) {
      const triage = triageBhClaim(await claim(text, ["same.example", "same.example"]));
      expect(triage.strength).toBe("sensational");
      expect(triage.independentSources).toBe(1);
      expect(triage.requiredIndependentSources).toBe(3);
      expect(triage.corroborationSufficient).toBe(false);
      expect(triage.escalate).toBe(true);
    }
  });

  it("derives publication behavior from every verification state", async () => {
    expect(["verified", "probable", "single-source", "legend", "rejected"].map((state) =>
      publicationModeForBhClaim(state as BhDossierClaim["verificationState"])
    )).toEqual(["plain", "plain", "framed", "legend-label-required", "prohibited"]);
    const dossier = BhDossierSchema.parse(JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/bh-dossier.valid.json"),
      "utf8"
    )));
    expect(triageBhDossier(dossier)).toHaveLength(dossier.claims.length);
  });

  it("checks escalated claims only under QUILL with at most three searches and records transitions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-claim-check-"));
    try {
      const fixture = BhDossierSchema.parse(JSON.parse(await readFile(
        path.join(repoRoot, "contracts/fixtures/bh-dossier.valid.json"),
        "utf8"
      )));
      const dossier = BhDossierSchema.parse({
        ...fixture,
        claims: fixture.claims.map((entry) => ({
          ...entry,
          text: "The manuscript was rejected 27 times before publication.",
          verificationState: "single-source",
          publicationSuitable: true
        }))
      });
      const call = vi.fn(async (request: Parameters<typeof guardedJsonCall>[0]) => ({
        value: request.parse(JSON.stringify({
          claimId: dossier.claims[0]!.claimId,
          nextState: "legend",
          reason: "The exact rejection count remains a repeated anecdote without independent archival corroboration.",
          sourceUrls: ["https://example.com/archive"]
        })),
        cached: false,
        usd: 0.02
      })) as unknown as typeof guardedJsonCall & ReturnType<typeof vi.fn>;
      const config: BhClaimCheckCallConfig = {
        stateRoot: root,
        cycleId: "bh-claim-check",
        phase: "bh-research",
        ventureId: "booksofhistory",
        agent: "QUILL",
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        system: "Check one claim.",
        maxOutputTokens: 1_200,
        webSearch: { maxUses: 3, maxSearchContentTokens: 6_000 },
        budgetContext: {
          now: new Date("2026-08-12T10:30:00.000Z"),
          cycleId: "bh-claim-check",
          stage: "VALIDATION",
          ledger: [],
          allInNonApiSpentUsd: 0,
          allInCommittedUsd: 0,
          knownMonthlyForecastUsd: 0,
          remainingScheduledCycles: 1
        }
      };

      const result = await verifyBhDossierClaims({
        root,
        dossier,
        checkedAt: new Date("2026-08-12T10:30:01.000Z"),
        callConfig: config,
        call
      });
      expect(result.calls).toBe(1);
      expect(result.transitions).toEqual([expect.objectContaining({
        from: "single-source",
        to: "legend",
        actor: "QUILL",
        reason: expect.stringContaining("rejection count")
      })]);
      expect(result.dossier.claims[0]).toMatchObject({
        verificationState: "legend",
        publicationSuitable: true
      });
      expect(publicationModeForBhClaim(result.dossier.claims[0]!.verificationState))
        .toBe("legend-label-required");
      expect(call).toHaveBeenCalledWith(expect.objectContaining({
        agent: "QUILL",
        webSearch: { maxUses: 3, maxSearchContentTokens: 6_000 }
      }));
      const stored = BhDossierSchema.parse(JSON.parse(await readFile(
        path.join(root, "ventures/booksofhistory/dossiers", dossier.bookId, "dossier.json"),
        "utf8"
      )));
      expect(stored.verificationTransitions).toEqual(result.transitions);

      await expect(verifyBhDossierClaims({
        root,
        dossier,
        checkedAt: new Date("2026-08-12T10:30:01.000Z"),
        callConfig: { ...config, agent: "FOLIO" },
        call
      })).rejects.toThrow("only under QUILL");
      await expect(verifyBhDossierClaims({
        root,
        dossier,
        checkedAt: new Date("2026-08-12T10:30:01.000Z"),
        callConfig: { ...config, webSearch: { maxUses: 4, maxSearchContentTokens: 6_000 } },
        call
      })).rejects.toThrow("one to three");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
