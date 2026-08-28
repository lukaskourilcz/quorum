import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WebDevCandidateSchema,
  WebDevEditionPackageSchema,
  WebDevEvidenceBriefSchema,
  WebDevRecordSchema,
  WebDevSelectionSchema,
  WebDevSourceSchema,
  parseWebDevCandidates,
  validateWebDevBilingualParity,
  validateWebDevEditionAgainstBrief
} from "../src/contracts/webdev-signal.js";
import { repoRoot } from "../src/paths.js";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures", name), "utf8")) as unknown;
}

describe("WebDev Signal contracts", () => {
  it("parses the audited source and keeps authority, limits and exact capability explicit", async () => {
    const source = WebDevSourceSchema.parse(await fixture("webdev-source.valid.json"));
    expect(source).toMatchObject({
      schemaVersion: "webdev-source/1",
      authority: "official-advisory",
      state: "enabled",
      canonicalHost: "api.github.com",
      access: { publicLoggedOut: true, authEnvironmentName: null }
    });
    expect(source.capabilityRefs).toEqual(["official-source-to-webdev-signal:webdev-candidate/1"]);
    expect(WebDevSourceSchema.safeParse({ ...source, endpoint: "https://example.org/advisories" }).success).toBe(false);
    expect(WebDevSourceSchema.safeParse({ ...source, capabilityRefs: ["portfolio-read:any/1"] }).success).toBe(false);
  });

  it("parses or drops candidates one item at a time and rejects raw source bodies", async () => {
    const valid = await fixture("webdev-candidate.valid.json");
    const poison = await fixture("webdev-candidate.poison.json");
    const result = parseWebDevCandidates([valid, poison, valid]);
    expect(result).toMatchObject({ dropped: 1 });
    expect(result.candidates).toHaveLength(2);
    expect(WebDevCandidateSchema.safeParse(poison).success).toBe(false);
    expect(JSON.stringify(result.candidates)).not.toContain("rawBody");
  });

  it("requires official, scoped evidence for canonical security and breaking records", async () => {
    const base = {
      schemaVersion: "webdev-record/1",
      id: "wds_aaaaaaaaaaaaaaaaaaaaaaaa",
      canonicalUrl: "https://example.org/releases/4.2.1",
      sourceIds: ["official-advisory"],
      candidateIds: ["candidate:one"],
      evidenceRefs: ["fixture:advisory:one"],
      project: "Invented Parser",
      topic: "security",
      changeKind: "security-advisory",
      impactScope: "specific-version-configuration",
      authority: "official-advisory",
      title: "Invented Parser security update",
      sourceSummary: "An official advisory identifies the affected and fixed versions.",
      publishedAt: "2026-08-28T06:00:00+02:00",
      updatedAt: null,
      versionRefs: ["4.2.1"],
      affectedVersions: ["<4.2.1"],
      fixedVersions: ["4.2.1"],
      affectedConfigurations: [],
      developerImpact: {
        summary: "Projects using an affected version should update.",
        audienceIds: ["audience:invented-parser-users"],
        confidence: 1,
        evidenceRefs: ["fixture:advisory:one"]
      },
      safeActions: [{ id: "action:update", action: "Update to 4.2.1.", urgency: "act-now", evidenceRefs: ["fixture:advisory:one"] }],
      security: { severity: "critical", advisoryIds: ["GHSA-invented-0001"] },
      releaseStability: "stable",
      agreement: { status: "single-official", agreeingSourceIds: ["official-advisory"], conflictRefs: [] },
      firstSeenAt: "2026-08-28T06:05:00+02:00",
      lastSeenAt: "2026-08-28T06:05:00+02:00",
      extractionVersion: "1.0.0",
      scoringVersion: "1.0.0",
      recentEditionSimilarity: 0,
      historyRefs: [],
      lifecycle: "new"
    } as const;
    expect(WebDevRecordSchema.safeParse(base).success).toBe(true);
    expect(WebDevRecordSchema.safeParse({ ...base, authority: "secondary-discovery" }).success).toBe(false);
    expect(WebDevRecordSchema.safeParse({ ...base, fixedVersions: [] }).success).toBe(false);
    expect(WebDevRecordSchema.safeParse({ ...base, affectedVersions: [], affectedConfigurations: [] }).success).toBe(false);
  });

  it("supports a typed NO_EDITION decision and keeps stale GoVIRAL at zero", async () => {
    const selection = WebDevSelectionSchema.parse(await fixture("webdev-selection.no-edition.json"));
    expect(selection).toMatchObject({ outcome: "NO_EDITION", selectedRecordId: null, goviral: { status: "stale", contribution: 0 } });
    expect(WebDevSelectionSchema.safeParse({ ...selection, selectedRecordId: "wds_aaaaaaaaaaaaaaaaaaaaaaaa" }).success).toBe(false);
    expect(WebDevSelectionSchema.safeParse({ ...selection, goviral: { ...selection.goviral, contribution: 1 } }).success).toBe(false);
  });

  it("accepts independently written Czech and English packages with claim parity", async () => {
    const brief = WebDevEvidenceBriefSchema.parse(await fixture("webdev-evidence-brief.valid.json"));
    const cs = WebDevEditionPackageSchema.parse(await fixture("webdev-edition.cs.valid.json"));
    const en = WebDevEditionPackageSchema.parse(await fixture("webdev-edition.en.valid.json"));
    expect(validateWebDevEditionAgainstBrief({ brief, edition: cs })).toEqual([]);
    expect(validateWebDevEditionAgainstBrief({ brief, edition: en })).toEqual([]);
    expect(validateWebDevBilingualParity({ brief, cs, en })).toEqual([]);
    expect(JSON.stringify(cs)).not.toMatch(/credential|providerToken|publishAuthorized/u);
  });

  it("rejects literal cloning, claim drift, unsupported facts and provider authority", async () => {
    const brief = WebDevEvidenceBriefSchema.parse(await fixture("webdev-evidence-brief.valid.json"));
    const cs = WebDevEditionPackageSchema.parse(await fixture("webdev-edition.cs.valid.json"));
    const en = WebDevEditionPackageSchema.parse(await fixture("webdev-edition.en.valid.json"));
    const clone = structuredClone(cs);
    clone.headline = en.headline;
    clone.deck = en.deck;
    clone.explanation = en.explanation;
    clone.threads.primary = en.threads.primary;
    expect(validateWebDevBilingualParity({ brief, cs: clone, en })).toContain("literal-translation-or-clone");

    const drift = structuredClone(en);
    drift.claimIdsUsed = ["claim:fix", "claim:action", "claim:invented-benchmark"];
    expect(validateWebDevBilingualParity({ brief, cs, en: drift })).toEqual(expect.arrayContaining([
      "en:unsupported-claim", "en:missing-core-claim", "claim-drift"
    ]));
    expect(WebDevEditionPackageSchema.safeParse({ ...en, providerToken: "secret" }).success).toBe(false);
    expect(WebDevEditionPackageSchema.safeParse({ ...en, capabilityRefs: ["caught-up-to-webdev-signal:portfolio-read:any/1"] }).success).toBe(false);
  });

  it("keeps the full deterministic poison and edge-case catalog", async () => {
    const catalog = await fixture("webdev-signal.cases.json") as { cases: Array<{ id: string }> };
    expect(catalog.cases.map(({ id }) => id)).toEqual([
      "browser-stable-feature", "framework-major-release", "critical-security-affected-fixed",
      "beta-preview", "duplicate-official-sources", "secondary-plus-official", "unsupported-rumor",
      "minor-package-release", "conflicting-version-evidence", "valid-cs-en-native",
      "literal-translation", "claim-drift", "no-edition", "stale-goviral",
      "denied-cross-venture", "malformed-item"
    ]);
  });
});
