import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rawRecord } from "./model";
import {
  parseProviderBinding,
  parseProviderDeliveryReceipt,
  parseProviderHealth,
  parseSocialProvider
} from "./provider-model";

const root = path.resolve(process.cwd(), "..");

describe("Social Profiles provider model", () => {
  it("parses the bounded registry without exposing credential values or granting authority", async () => {
    const registry = rawRecord(JSON.parse(await readFile(path.join(root, "config/social-providers.json"), "utf8")) as unknown)!;
    const providers = (registry.providers as unknown[]).map(parseSocialProvider);
    const bindings = (registry.bindings as unknown[]).map(parseProviderBinding);
    expect(providers.every(Boolean)).toBe(true);
    expect(bindings.every(Boolean)).toBe(true);
    expect(providers.map((provider) => provider?.verdict)).toEqual(["enabled", "held", "held", "held", "disabled", "rejected"]);
    expect(bindings).toHaveLength(6);
    expect(bindings.every((binding) => binding?.mode === "held" && binding.authorityGranted === false && binding.publishingAuthorized === false)).toBe(true);
    expect(JSON.stringify(bindings)).not.toContain("secret-value");
  });

  it("rejects notification publishing, raw provider payloads and malformed health", () => {
    const provider = {
      schemaVersion: "social-provider/1", id: "n8n", name: "n8n", role: "notification-webhook", supportedPlatforms: ["threads"], capabilities: ["publish-original"],
      implementationVersion: "held", apiVersion: null, verdict: "held", lastVerifiedDate: "2026-08-27", decisionRef: "GitHub #405",
      cost: { plan: "None", monthlyCostPosture: "Held", exitPath: "Disable.", purchaseAuthorized: false }, healthPolicy: { reverifyBy: "2026-11-27" },
      strategyAuthority: false, contentGenerationAuthority: false
    };
    expect(parseSocialProvider(provider)).toBeNull();
    expect(parseProviderDeliveryReceipt({ schemaVersion: "provider-delivery-receipt/1", rawPayloadExcluded: true, rawPayload: { token: "secret-value" } })).toBeNull();
    expect(parseProviderHealth({ schemaVersion: "provider-health/1", snapshotHash: "not-a-hash" })).toBeNull();
  });
});
