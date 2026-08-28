import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ProviderConnectionBindingSchema,
  ProviderDeliveryReceiptSchema,
  ProviderHealthSchema,
  SocialProviderSchema,
  providerBindingHash,
  providerHealthHash
} from "../src/contracts/social-provider.js";
import { repoRoot } from "../src/paths.js";

const contracts = {
  provider: SocialProviderSchema,
  binding: ProviderConnectionBindingSchema,
  receipt: ProviderDeliveryReceiptSchema,
  health: ProviderHealthSchema
} as const;

async function fixture(kind: "valid" | "poison"): Promise<Record<keyof typeof contracts, unknown>> {
  return JSON.parse(await readFile(
    path.join(repoRoot, `contracts/fixtures/social-provider-contracts.${kind}.json`),
    "utf8"
  )) as Record<keyof typeof contracts, unknown>;
}

describe("Social Distribution provider contracts", () => {
  it("accepts bounded evidence and rejects authority, raw payload and notification publishing", async () => {
    const [valid, poison] = await Promise.all([fixture("valid"), fixture("poison")]);
    for (const key of Object.keys(contracts) as Array<keyof typeof contracts>) {
      expect(contracts[key].safeParse(valid[key]).success, `${key} valid`).toBe(true);
      expect(contracts[key].safeParse(poison[key]).success, `${key} poison`).toBe(false);
    }
    expect(valid.binding).not.toHaveProperty("accessToken");
    expect(valid.receipt).not.toHaveProperty("rawPayload");
    expect(JSON.stringify(valid)).not.toContain("secret-value");
  });

  it("binds immutable binding and health snapshots to deterministic hashes", async () => {
    const valid = await fixture("valid");
    const binding = ProviderConnectionBindingSchema.parse(valid.binding);
    const health = ProviderHealthSchema.parse(valid.health);
    expect(providerBindingHash(binding)).toBe(binding.bindingHash);
    expect(providerHealthHash(health)).toBe(health.snapshotHash);
    expect(ProviderConnectionBindingSchema.safeParse({ ...binding, mode: "retired" }).success).toBe(false);
    expect(ProviderHealthSchema.safeParse({ ...health, state: "healthy" }).success).toBe(false);
  });
});
