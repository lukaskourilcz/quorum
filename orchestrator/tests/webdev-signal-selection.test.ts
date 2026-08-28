import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WebDevCandidateSchema, type WebDevCandidate } from "../src/contracts/webdev-signal.js";
import { loadWebDevSelectionConfig, WebDevSelectionConfigSchema } from "../src/ventures/webdev-signal/selection/config.js";
import {
  canonicalizeWebDevProject,
  canonicalizeWebDevUrl,
  explicitWebDevIdentifier,
  normalizeWebDevVersion,
  stableWebDevRecordId
} from "../src/ventures/webdev-signal/selection/canonical.js";
import { buildWebDevRecords } from "../src/ventures/webdev-signal/selection/records.js";
import { decideWebDevEdition } from "../src/ventures/webdev-signal/selection/decision.js";

const fixtureRoot = path.join(import.meta.dirname, "fixtures", "webdev-signal");
const NOW = "2026-08-28T08:00:00.000Z";

function candidate(overrides: Partial<WebDevCandidate> = {}): WebDevCandidate {
  return WebDevCandidateSchema.parse({
    schemaVersion: "webdev-candidate/1",
    sourceId: "react-releases",
    sourceItemId: "release-20",
    listingUrl: "https://api.github.com/repos/facebook/react/releases",
    targetUrl: "https://github.com/facebook/react/releases/tag/v20.0.0",
    canonicalProjectUrl: "https://github.com/facebook/react",
    title: "React 20.0.0 stable release",
    summary: "The React team published a stable major release with an explicit migration guide for framework projects.",
    author: "React team",
    project: "React",
    publishedAt: "2026-08-28T06:00:00.000Z",
    updatedAt: null,
    versionText: "v20.0.0",
    securityText: null,
    topicHints: ["frontend-framework"],
    changeKindHints: ["stable-release"],
    language: "en",
    contentHash: "a".repeat(64),
    provenance: {
      authority: "official-primary",
      parserId: "github-releases",
      parserVersion: "1.0.0",
      fetchedAt: "2026-08-28T06:05:00.000Z",
      evidenceRefs: ["fixture:react:20"],
      fixture: true
    },
    ...overrides
  });
}

function advisoryCandidate(overrides: Partial<WebDevCandidate> = {}): WebDevCandidate {
  return candidate({
    sourceId: "github-npm-advisories",
    sourceItemId: "GHSA-xxxx-yyyy-zzzz",
    targetUrl: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz",
    canonicalProjectUrl: "https://github.com/advisories",
    title: "Critical fixture package advisory GHSA-xxxx-yyyy-zzzz",
    summary: "The official advisory identifies a critical traversal flaw affecting projects using fixture-package.",
    project: "fixture-package",
    versionText: "affected >= 1.0.0, < 1.2.3 fixed 1.2.3",
    securityText: "critical; GHSA-xxxx-yyyy-zzzz",
    topicHints: ["security", "package-manager"],
    changeKindHints: ["security-advisory"],
    provenance: {
      authority: "official-advisory",
      parserId: "github-advisories",
      parserVersion: "1.0.0",
      fetchedAt: "2026-08-28T06:05:00.000Z",
      evidenceRefs: ["fixture:advisory:exact"],
      fixture: true
    },
    ...overrides
  });
}

describe("WebDev Signal pure canonicalization", () => {
  it("uses one validated versioned configuration", async () => {
    const config = await loadWebDevSelectionConfig();
    expect(config).toMatchObject({ canonicalizationVersion: "1.0.0", scoringVersion: "1.0.0" });
    expect(Object.keys(config.weights)).toHaveLength(12);
  });

  it("normalizes official blog, release, advisory and documentation URLs without losing semantic parameters", async () => {
    const config = await loadWebDevSelectionConfig();
    const fixtures = JSON.parse(await readFile(path.join(fixtureRoot, "canonicalization.json"), "utf8")) as Array<{ input: string; expected: string }>;
    for (const fixture of fixtures) expect(canonicalizeWebDevUrl(fixture.input, config)).toBe(fixture.expected);
  });

  it("unwraps only an exact configured redirect wrapper", async () => {
    const base = await loadWebDevSelectionConfig();
    const config = WebDevSelectionConfigSchema.parse({
      ...base,
      redirectWrappers: [{ host: "redirect.example", path: "/out", targetParameter: "target" }]
    });
    expect(canonicalizeWebDevUrl("https://redirect.example/out?target=https%3A%2F%2Fweb.dev%2Ffeature%3Fversion%3D2", config)).toBe("https://web.dev/feature?version=2");
    expect(canonicalizeWebDevUrl("https://redirect.example/other?target=https%3A%2F%2Fweb.dev%2Ffeature", config)).toContain("redirect.example/other");
  });

  it("normalizes project aliases and explicit versions or advisory ids", async () => {
    const config = await loadWebDevSelectionConfig();
    expect(canonicalizeWebDevProject("ReactJS", config)).toBe("React");
    expect(canonicalizeWebDevProject("Node.js", config)).toBe("Node.js");
    expect(normalizeWebDevVersion("version v20.01.0-beta.1")).toBe("20.01.0-beta.1");
    expect(explicitWebDevIdentifier("fixed by GHSA-ABCD-1234-EFGH")).toBe("ghsa-abcd-1234-efgh");
    expect(explicitWebDevIdentifier("release v20.0.0")).toBe("20.0.0");
  });

  it("derives stable collision-resistant ids from canonical inputs", async () => {
    const config = await loadWebDevSelectionConfig();
    const left = stableWebDevRecordId({ canonicalUrl: "https://github.com/facebook/react/releases/tag/v20.0.0?utm_source=x", project: "ReactJS", explicitIdentifier: "20.0.0", config });
    const right = stableWebDevRecordId({ canonicalUrl: "https://github.com/facebook/react/releases/tag/v20.0.0#notes", project: "React", explicitIdentifier: "20.0.0", config });
    const distinct = stableWebDevRecordId({ canonicalUrl: "https://github.com/facebook/react/releases/tag/v20.1.0", project: "React", explicitIdentifier: "20.1.0", config });
    expect(left).toBe(right);
    expect(left).toMatch(/^wds_[a-f0-9]{24}$/u);
    expect(distinct).not.toBe(left);
  });
});

describe("WebDev Signal prefilter, clustering and source-backed records", () => {
  it("clusters official release and documentation variants by project plus explicit version", async () => {
    const config = await loadWebDevSelectionConfig();
    const documentation = candidate({
      sourceId: "react-blog",
      sourceItemId: "docs-20",
      targetUrl: "https://react.dev/blog/2026/08/28/react-20",
      title: "React 20 is now stable",
      provenance: {
        authority: "official-primary",
        parserId: "webdev-feed",
        parserVersion: "1.0.0",
        fetchedAt: "2026-08-28T06:06:00.000Z",
        evidenceRefs: ["fixture:react:docs-20"],
        fixture: true
      }
    });
    const result = buildWebDevRecords({ candidates: [documentation, candidate()], now: NOW, config });
    expect(result.records).toHaveLength(1);
    expect(result.exactClusters).toBe(1);
    expect(result.records[0]?.record).toMatchObject({
      project: "React",
      sourceIds: ["react-blog", "react-releases"],
      agreement: { status: "corroborated" }
    });
  });

  it("keeps explicit version conflicts visible and hard-gated", async () => {
    const config = await loadWebDevSelectionConfig();
    const conflicting = candidate({ sourceId: "react-blog", sourceItemId: "conflict", versionText: "v21.0.0", title: "React 21.0.0 stable release" });
    const result = buildWebDevRecords({ candidates: [candidate(), conflicting], now: NOW, config });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ gateHint: "conflicted" });
    expect(result.records[0]?.gateReasons.join(" ")).toContain("conflicting-identifiers");
    expect(result.records[0]?.record.agreement).toMatchObject({ status: "conflicted" });
  });

  it("drops promotional, stale, generic AI and minor patch noise before records", async () => {
    const config = await loadWebDevSelectionConfig();
    const inputs = [
      candidate({ sourceItemId: "promo", title: "Register now for our sponsored launch" }),
      candidate({ sourceItemId: "old", publishedAt: "2026-07-01T06:00:00.000Z" }),
      candidate({ sourceItemId: "ai", title: "AI model launch", summary: "A generic LLM announcement without developer consequences." }),
      candidate({ sourceItemId: "patch", versionText: "v20.0.1", title: "React v20.0.1 patch", summary: "Maintenance bug fixes only." })
    ];
    const result = buildWebDevRecords({ candidates: inputs, now: NOW, config });
    expect(result.records).toHaveLength(0);
    expect(result.drops.map(({ gate }) => gate).sort()).toEqual(["minor-no-material-impact", "out-of-scope", "promotional", "stale"]);
  });

  it("uses secondary leads only when clustered with official confirmation", async () => {
    const config = await loadWebDevSelectionConfig();
    const secondary = candidate({
      sourceId: "secondary-magazine",
      sourceItemId: "lead-20",
      targetUrl: "https://secondary.example/react-20",
      changeKindHints: ["lead-only"],
      provenance: {
        authority: "secondary-discovery",
        parserId: "secondary-feed",
        parserVersion: "1.0.0",
        fetchedAt: "2026-08-28T06:04:00.000Z",
        evidenceRefs: ["fixture:secondary:lead"],
        fixture: true
      }
    });
    const confirmed = buildWebDevRecords({ candidates: [secondary, candidate()], now: NOW, config });
    expect(confirmed.records).toHaveLength(1);
    expect(confirmed.records[0]?.record.authority).toBe("official-primary");
    const unconfirmed = buildWebDevRecords({ candidates: [secondary], now: NOW, config });
    expect(unconfirmed.records).toHaveLength(0);
    expect(unconfirmed.drops[0]).toMatchObject({ gate: "needs-official-confirmation" });
  });

  it("extracts exact affected and fixed advisory scope and safe action", async () => {
    const config = await loadWebDevSelectionConfig();
    const advisory = advisoryCandidate();
    const result = buildWebDevRecords({ candidates: [advisory], now: NOW, config });
    expect(result.records[0]).toMatchObject({ gateHint: "eligible" });
    expect(result.records[0]?.record).toMatchObject({
      changeKind: "security-advisory",
      affectedVersions: [">= 1.0.0, < 1.2.3"],
      fixedVersions: ["1.2.3"],
      security: { severity: "critical", advisoryIds: ["GHSA-xxxx-yyyy-zzzz"] }
    });
    expect(result.records[0]?.record.safeActions[0]?.urgency).toBe("act-now");
  });

  it("holds high-risk items missing exact scope and applies cooldown with a security exception", async () => {
    const config = await loadWebDevSelectionConfig();
    const unscoped = candidate({
      sourceItemId: "security-no-scope",
      title: "React security update",
      securityText: "high security update",
      changeKindHints: ["security-advisory"]
    });
    expect(buildWebDevRecords({ candidates: [unscoped], now: NOW, config }).records[0]).toMatchObject({ gateHint: "high-risk-factual-review" });

    const history = [{ recordId: "wds_aaaaaaaaaaaaaaaaaaaaaaaa", canonicalUrl: "https://example.org/older", project: "React", topic: "frontend-framework" as const, selectedAt: "2026-08-27T06:00:00.000Z" }];
    expect(buildWebDevRecords({ candidates: [candidate()], now: NOW, config, history }).records[0]).toMatchObject({ gateHint: "duplicate-recent-edition" });
    const scoped = candidate({
      sourceItemId: "security-scoped",
      title: "React critical advisory GHSA-aaaa-bbbb-cccc",
      versionText: "affected < 20.0.1 fixed 20.0.1",
      securityText: "critical GHSA-aaaa-bbbb-cccc",
      changeKindHints: ["security-advisory"]
    });
    expect(buildWebDevRecords({ candidates: [scoped], now: NOW, config, history }).records[0]).toMatchObject({ gateHint: "eligible" });
  });
});

describe("WebDev Signal explainable one-winner decision", () => {
  it("selects a material stable framework release with no GoVIRAL input", async () => {
    const config = await loadWebDevSelectionConfig();
    const result = decideWebDevEdition({ candidates: [candidate()], pragueDate: "2026-08-28", now: NOW, config });
    expect(result.selection).toMatchObject({ outcome: "selected", goviral: { status: "unavailable", contribution: 0, actorRerun: false, duplicateChargeUsd: 0 } });
    expect(result.selection.selectedRecordId).toBe(result.records[0]?.id);
    const score = result.selection.candidates[0]!;
    expect(score.gate).toBe("eligible");
    expect(score.baseScore).toBeGreaterThanOrEqual(config.thresholds.minimumBaseScore);
    expect(score.components).toHaveLength(12);
    expect(result.metrics).toMatchObject({ outcome: "selected", networkCalls: 0, modelCalls: 0, providerCostUsd: 0 });
  });

  it("keeps beta previews below threshold and records NO_EDITION", async () => {
    const config = await loadWebDevSelectionConfig();
    const beta = candidate({
      sourceItemId: "release-21-beta",
      targetUrl: "https://github.com/facebook/react/releases/tag/v21.0.0-beta.1",
      title: "React 21.0.0 beta preview",
      summary: "The React team published a beta preview for testing before stable availability.",
      versionText: "v21.0.0-beta.1",
      changeKindHints: ["beta-preview"]
    });
    const result = decideWebDevEdition({ candidates: [beta], pragueDate: "2026-08-28", now: NOW, config });
    expect(result.selection).toMatchObject({ outcome: "NO_EDITION", selectedRecordId: null });
    expect(result.selection.candidates[0]?.baseScore).toBeLessThan(config.thresholds.minimumBaseScore);
    expect(result.selection.noEditionReason).toContain("base materiality");
  });

  it("selects an exact critical advisory and never needs a popularity override", async () => {
    const config = await loadWebDevSelectionConfig();
    const result = decideWebDevEdition({ candidates: [advisoryCandidate()], pragueDate: "2026-08-28", now: NOW, config });
    expect(result.selection).toMatchObject({ outcome: "selected", urgencyOverride: { used: false } });
    expect(result.records[0]).toMatchObject({ changeKind: "security-advisory", security: { severity: "critical" } });
    expect(result.selection.candidates[0]?.components.find(({ name }) => name === "urgency")?.rawValue).toBe(1);
  });

  it("caps GoVIRAL and cannot let high momentum rescue weak base materiality", async () => {
    const config = await loadWebDevSelectionConfig();
    const beta = candidate({
      sourceItemId: "release-21-beta",
      targetUrl: "https://github.com/facebook/react/releases/tag/v21.0.0-beta.1",
      title: "React 21 beta preview",
      summary: "The React team published a beta preview for testing before stable availability.",
      versionText: "v21.0.0-beta.1",
      changeKindHints: ["beta-preview"]
    });
    const packet = {
      schemaVersion: "goviral-intelligence-packet/1",
      topic: "React",
      measuredAt: "2026-08-28T05:00:00.000Z",
      expiresAt: "2026-08-29T05:00:00.000Z",
      velocity: 100,
      evidenceRefs: ["state/ventures/goviral/react.json"]
    };
    const result = decideWebDevEdition({
      candidates: [beta],
      pragueDate: "2026-08-28",
      now: NOW,
      config,
      goviralPacket: packet,
      goviralCapabilityDecision: "allowed"
    });
    const scored = result.selection.candidates[0]!;
    expect(scored.components.find(({ name }) => name === "goviral-momentum")?.contribution).toBe(5);
    expect(scored.baseScore).toBeLessThan(config.thresholds.minimumBaseScore);
    expect(result.selection).toMatchObject({ outcome: "NO_EDITION", goviral: { status: "available-unused", contribution: 0, actorRerun: false, duplicateChargeUsd: 0 } });
  });

  it.each([
    ["stale" as const, "allowed" as const, "2026-08-27T05:00:00.000Z"],
    ["denied" as const, "denied" as const, "2026-08-29T05:00:00.000Z"]
  ])("keeps %s GoVIRAL visible at zero", async (status, capabilityDecision, expiresAt) => {
    const config = await loadWebDevSelectionConfig();
    const result = decideWebDevEdition({
      candidates: [candidate()],
      pragueDate: "2026-08-28",
      now: NOW,
      config,
      goviralPacket: {
        schemaVersion: "goviral-intelligence-packet/1",
        topic: "React",
        measuredAt: "2026-08-26T05:00:00.000Z",
        expiresAt,
        velocity: 100,
        evidenceRefs: ["state/ventures/goviral/react.json"]
      },
      goviralCapabilityDecision: capabilityDecision
    });
    expect(result.selection.goviral).toMatchObject({ status, contribution: 0, actorRerun: false, duplicateChargeUsd: 0 });
    expect(result.selection.outcome).toBe("selected");
  });

  it("uses a stable tie break for ordering but records NO_EDITION below the winner margin", async () => {
    const config = await loadWebDevSelectionConfig();
    const vue = candidate({
      sourceId: "vue-blog",
      sourceItemId: "vue-20",
      targetUrl: "https://github.com/vuejs/core/releases/tag/v20.0.0",
      canonicalProjectUrl: "https://github.com/vuejs/core",
      title: "Vue 20.0.0 stable release",
      summary: "The Vue team published a stable major release with an explicit migration guide for framework projects.",
      project: "Vue"
    });
    const forward = decideWebDevEdition({ candidates: [candidate(), vue], pragueDate: "2026-08-28", now: NOW, config });
    const reverse = decideWebDevEdition({ candidates: [vue, candidate()], pragueDate: "2026-08-28", now: NOW, config });
    expect(forward.selection).toMatchObject({ outcome: "NO_EDITION", selectedRecordId: null });
    expect(forward.selection.noEditionReason).toContain("winner margin");
    expect(forward.selection.candidates).toEqual(reverse.selection.candidates);
    expect(forward.selection.idempotencyHash).toBe(reverse.selection.idempotencyHash);
  });

  it("preserves owner correction and supersession references in deterministic history", async () => {
    const config = await loadWebDevSelectionConfig();
    const base = decideWebDevEdition({ candidates: [candidate()], pragueDate: "2026-08-28", now: NOW, config });
    const corrected = decideWebDevEdition({
      candidates: [candidate()],
      pragueDate: "2026-08-28",
      now: NOW,
      config,
      ownerCorrectionRef: "owner-correction:2026-08-28",
      supersedesRef: `selection:${base.selection.idempotencyHash}`
    });
    expect(corrected.selection).toMatchObject({ ownerCorrectionRef: "owner-correction:2026-08-28", supersedesRef: `selection:${base.selection.idempotencyHash}` });
    expect(corrected.selection.idempotencyHash).not.toBe(base.selection.idempotencyHash);
  });

  it("records exact prefilter and gate metrics on a NO_EDITION day", async () => {
    const config = await loadWebDevSelectionConfig();
    const result = decideWebDevEdition({
      candidates: [candidate({ sourceItemId: "promo", title: "Register now for our sponsored launch" })],
      pragueDate: "2026-08-28",
      now: NOW,
      config,
      cacheReused: 2,
      callsAvoided: 3
    });
    expect(result.selection.outcome).toBe("NO_EDITION");
    expect(result.metrics).toMatchObject({
      fetchedCandidates: 1,
      prefilterDrops: 1,
      dropCounts: { promotional: 1 },
      canonicalRecords: 0,
      eligible: 0,
      scored: 0,
      cacheReused: 2,
      callsAvoided: 3,
      networkCalls: 0,
      modelCalls: 0,
      providerCostUsd: 0
    });
  });
});
