import { describe, expect, it } from "vitest";
import { backfillTehdejsiResearchUsage } from "./tehdejsi-research-ledger";

const purchase = {
  schemaVersion: "ts-research-ledger/1",
  kind: "purchase",
  topicKey: "synthetic-music-gap",
  briefHash: "a".repeat(64),
  cycleId: "synthetic-cycle",
  provider: "fixture-provider",
  model: "fixture-model",
  startedAt: "2026-08-14T10:00:00.000Z",
  completedAt: "2026-08-14T10:01:00.000Z",
  tokensIn: 100,
  tokensOut: 80,
  searches: 1,
  costUsd: 0.1,
  dossierRef: "state/ventures/tehdejsi-svet/dossiers/synthetic-music.json"
};

describe("Tehdejsi svet research usage backfill", () => {
  it("appends one immutable use receipt at posting and is idempotent", () => {
    const raw = `${JSON.stringify(purchase)}\n`;
    const first = backfillTehdejsiResearchUsage({
      raw,
      dossierRefs: [purchase.dossierRef],
      recommendationId: "ts-synthetic-feature",
      at: "2026-08-20T12:00:00.000Z"
    });
    expect(first).toMatchObject({ changed: 1, matched: 1, unmatchedDossierRefs: [] });
    expect(first.text.startsWith(raw)).toBe(true);
    expect(first.text.split("\n").filter(Boolean).map((line) => JSON.parse(line))).toEqual([
      purchase,
      expect.objectContaining({ kind: "use", recommendationId: "ts-synthetic-feature", topicKey: purchase.topicKey })
    ]);

    const second = backfillTehdejsiResearchUsage({
      raw: first.text,
      dossierRefs: [purchase.dossierRef],
      recommendationId: "ts-synthetic-feature",
      at: "2026-08-20T12:00:00.000Z"
    });
    expect(second).toMatchObject({ changed: 0, matched: 1, text: first.text });
  });

  it("reports a cited dossier with no purchase and rejects a malformed ledger", () => {
    expect(backfillTehdejsiResearchUsage({
      raw: `${JSON.stringify(purchase)}\n`,
      dossierRefs: ["state/ventures/tehdejsi-svet/dossiers/missing.json"],
      recommendationId: "ts-synthetic-feature",
      at: "2026-08-20T12:00:00.000Z"
    }).unmatchedDossierRefs).toEqual(["state/ventures/tehdejsi-svet/dossiers/missing.json"]);
    expect(() => backfillTehdejsiResearchUsage({
      raw: "not-json\n",
      dossierRefs: [purchase.dossierRef],
      recommendationId: "ts-synthetic-feature",
      at: "2026-08-20T12:00:00.000Z"
    })).toThrow(/line 1/u);
  });
});
