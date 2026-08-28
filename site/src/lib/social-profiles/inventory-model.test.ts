import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseSocialInventoryCandidate,
  parseSocialInventoryIncident,
  parseSocialInventoryReceipt,
  parseSocialProfileInventory,
  parseSocialProfileStrategy
} from "./inventory-model";

const repositoryRoot = path.resolve(process.cwd(), "..");

describe("Social content inventory admin parsers", () => {
  it("accepts every canonical profile strategy and the valid inventory fixture", async () => {
    const registry = JSON.parse(await readFile(path.join(repositoryRoot, "config/social-profile-strategies.json"), "utf8")) as { strategies: unknown[] };
    const fixture = JSON.parse(await readFile(path.join(repositoryRoot, "contracts/fixtures/social-inventory-contracts.valid.json"), "utf8")) as { candidate: unknown; inventory: unknown; receipt: unknown };

    expect(registry.strategies.map(parseSocialProfileStrategy)).toHaveLength(6);
    expect(registry.strategies.map(parseSocialProfileStrategy).every(Boolean)).toBe(true);
    expect(parseSocialInventoryCandidate(fixture.candidate)).toMatchObject({ finalCopy: false, queueAuthorized: false, publishingAuthorized: false });
    expect(parseSocialProfileInventory(fixture.inventory)).toMatchObject({ state: "no-candidate", candidates: [], queueAuthorized: false, publishingAuthorized: false });
    expect(parseSocialInventoryReceipt(fixture.receipt)).toMatchObject({ status: "no-candidate", actualCostUsd: 0, authorityGranted: false });
  });

  it("rejects invented authority and accepts bounded incident evidence", async () => {
    const fixture = JSON.parse(await readFile(path.join(repositoryRoot, "contracts/fixtures/social-inventory-contracts.valid.json"), "utf8")) as { candidate: Record<string, unknown>; receipt: Record<string, unknown> };
    expect(parseSocialInventoryCandidate({ ...fixture.candidate, finalCopy: true })).toBeNull();
    expect(parseSocialInventoryCandidate({ ...fixture.candidate, queueAuthorized: true })).toBeNull();
    expect(parseSocialInventoryReceipt({ ...fixture.receipt, publishingAuthorized: true })).toBeNull();
    expect(parseSocialInventoryIncident({
      schemaVersion: "social-inventory-incident/1",
      id: "social-inventory-incident-aaaaaaaaaaaaaaaaaaaa",
      profileId: "social-profile-caught-up",
      code: "NO_CANDIDATE",
      reason: "No useful evidence-backed candidate exists; no post was forced.",
      detectedAt: "2026-08-28T07:00:00.000Z",
      recoveryPerformed: false,
      authorityGranted: false
    })).toMatchObject({ code: "NO_CANDIDATE", recoveryPerformed: false, authorityGranted: false });
  });
});
