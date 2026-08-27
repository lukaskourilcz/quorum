import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readPersonalGrowthAdminInsights } from "./personal-growth-admin-insights";

async function writeJson(root: string, relative: string, value: unknown): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function copyJson(root: string, source: string, destination: string): Promise<void> {
  const repositoryRoot = path.resolve(process.cwd(), "..");
  await writeJson(root, destination, JSON.parse(await readFile(path.join(repositoryRoot, source), "utf8")) as unknown);
}

function result(input: {
  id: string;
  publishedAt: string;
  origin?: "owner-current-life" | "goviral-assisted" | "owner-manual-venture-reference";
  reach?: number | null;
  views?: number | null;
}) {
  const origin = input.origin ?? "owner-current-life";
  const manual = origin === "owner-manual-venture-reference";
  const metrics = [
    { name: "reach", value: input.reach ?? null, unavailableReason: input.reach === null || input.reach === undefined ? "not-returned" : null },
    { name: "views", value: input.views ?? null, unavailableReason: input.views === null || input.views === undefined ? "not-returned" : null },
    { name: "saves", value: 4, unavailableReason: null },
    { name: "shares", value: 2, unavailableReason: null }
  ];
  return {
    schemaVersion: "personal-growth-result/1",
    resultId: `pg-result-${input.id}`,
    platform: "instagram",
    nativePostId: input.id,
    url: `https://www.instagram.com/p/${input.id}/`,
    publishedAt: input.publishedAt,
    format: "photo",
    language: "cs",
    personalPillar: "life-lifestyle",
    contentOrigin: origin,
    collaborator: null,
    publicationRelation: origin === "owner-current-life" ? "okraj" : null,
    reelSeries: null,
    goviralSignalId: origin === "goviral-assisted" ? "pg-gv-0123456789abcdef" : null,
    manualVentureReference: manual ? {
      referenceId: "pg-manual-ref-0123456789abcdef",
      sourceProject: "caught-up",
      publicItemId: "public-1",
      publicUrl: "https://example.test/public-1",
      ownerAuthored: true,
      personalConnectionRecorded: false,
      ownerCommentaryRecorded: true,
      policyCompliantAtRecommendation: true,
      ownerProvenanceRef: "owner-result:manual-1"
    } : null,
    experimentId: null,
    classification: manual ? "owner-manual-venture-led" : "personal-or-personally-authored",
    provenance: {
      entryMode: "manual-and-api",
      ownerEvidenceRefs: [`owner-result:${input.id}`],
      automaticPortfolioLookup: false,
      socialDistributionCampaignRef: null,
      monetizationRef: null
    },
    observations: [{
      schemaVersion: "personal-growth-provider-observation/1",
      observationId: `pg-observation-${input.id}`,
      idempotencyKey: input.id.padEnd(64, "a"),
      platform: "instagram",
      scope: "post",
      ownerAccountAlias: "pg-owner-lukas",
      nativePostId: input.id,
      nativeUrl: `https://www.instagram.com/p/${input.id}/`,
      observedAt: "2026-08-27T07:00:00.000Z",
      publishedAt: input.publishedAt,
      pragueReportingDate: "2026-08-27",
      apiVersion: "v26.0",
      maturityWindow: "24h",
      metrics,
      unavailableReason: "none",
      droppedItemCount: 0,
      snapshotHash: input.id.padEnd(64, "b"),
      credentialMaterialPresent: false,
      audienceIdentityPresent: false
    }],
    ownerRating: 4,
    ownerNote: "Owner supplied a bounded result note.",
    corrections: [],
    updatedAt: "2026-08-27T07:00:00.000Z"
  };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "personal-growth-insights-"));
  await Promise.all([
    copyJson(root, "config/personal-growth.json", "config/personal-growth.json"),
    copyJson(root, "config/personal-growth-content.json", "config/personal-growth-content.json"),
    copyJson(root, "config/personal-growth-providers.json", "config/personal-growth-providers.json"),
    copyJson(root, "state/ventures/personal-growth/experiments.json", "state/ventures/personal-growth/experiments.json"),
    copyJson(root, "contracts/fixtures/personal-growth-baseline.valid.json", "state/ventures/personal-growth/analysis/baseline.json"),
    copyJson(root, "contracts/fixtures/personal-growth-journal-metadata.valid.json", "state/ventures/personal-growth/journal/cs.json")
  ]);
  await writeJson(root, "state/ventures/personal-growth/results/ordinary.json", result({ id: "1111111111111111", publishedAt: "2026-08-26T20:00:00.000Z", reach: 100, views: 200 }));
  await writeJson(root, "state/ventures/personal-growth/results/goviral.json", result({ id: "2222222222222222", publishedAt: "2026-08-10T20:00:00.000Z", origin: "goviral-assisted", reach: null, views: 400 }));
  await writeJson(root, "state/ventures/personal-growth/results/manual.json", result({ id: "3333333333333333", publishedAt: "2026-06-15T20:00:00.000Z", origin: "owner-manual-venture-reference", reach: 80, views: 120 }));
  for (const [index, id] of ["7777777777777777", "8888888888888888", "9999999999999999", "aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"].entries()) {
    await writeJson(root, `state/ventures/personal-growth/results/personal-${index}.json`, result({ id, publishedAt: `2026-06-${String(index + 1).padStart(2, "0")}T20:00:00.000Z`, reach: 50 + index, views: 100 + index }));
  }
  await writeJson(root, "state/ventures/personal-growth/results/automatic-portfolio.json", {
    ...result({ id: "4444444444444444", publishedAt: "2026-08-26T20:00:00.000Z", reach: 1, views: 1 }),
    provenance: {
      ...result({ id: "4444444444444444", publishedAt: "2026-08-26T20:00:00.000Z" }).provenance,
      automaticPortfolioLookup: true
    }
  });
  await writeJson(root, "state/ventures/personal-growth/results/forbidden-venture.json", {
    ...result({ id: "5555555555555555", publishedAt: "2026-08-26T20:00:00.000Z", origin: "owner-manual-venture-reference", reach: 1, views: 1 }),
    manualVentureReference: {
      ...result({ id: "5555555555555555", publishedAt: "2026-08-26T20:00:00.000Z", origin: "owner-manual-venture-reference" }).manualVentureReference,
      sourceProject: "kvorum"
    }
  });
  const privateLeak = result({ id: "6666666666666666", publishedAt: "2026-08-26T20:00:00.000Z", reach: 1, views: 1 });
  privateLeak.observations[0] = { ...privateLeak.observations[0], manuscriptText: "private source fixture" } as typeof privateLeak.observations[number];
  await writeJson(root, "state/ventures/personal-growth/results/private-leak.json", privateLeak);
  await writeJson(root, "state/budget/ledger.json", {
    schemaVersion: 1,
    entries: [
      { ts: "2026-08-20T10:00:00.000Z", ventureId: "personal-growth", provider: "anthropic", kind: "text", usd: 15 },
      { ts: "2026-08-20T11:00:00.000Z", ventureId: "caught-up", provider: "openai", kind: "text", usd: 20 }
    ]
  });
  await mkdir(path.join(root, "state/ventures/goviral"), { recursive: true });
  await writeFile(path.join(root, "state/ventures/goviral/profile.md"), "# Profile\n## Niches and topics I write about\nWriting\n## Voice\nShort sentences\n## Audiences\n## Never write about\n## Platforms I actually use\n");
  return root;
}

describe("Personal Growth Admin insights", () => {
  it("builds honest 7/28/90-day views and drops forbidden analytics", async () => {
    const snapshot = await readPersonalGrowthAdminInsights({
      root: await fixtureRoot(),
      now: new Date("2026-08-27T08:00:00.000Z"),
      timeline: [{ scheduledDate: "2026-08-26", status: "completed" }, { scheduledDate: "2026-08-25", status: "overdue" }]
    });
    expect(snapshot.results.items).toHaveLength(8);
    expect(snapshot.results.windows.map(({ days, resultCount }) => [days, resultCount])).toEqual([[7, 1], [28, 2], [90, 8]]);
    expect(snapshot.results.windows[0]?.metrics.find(({ name }) => name === "reach")?.value).toBe(100);
    expect(snapshot.results.windows[0]?.metrics.find(({ name }) => name === "saves_per_1000_reach")?.value).toBe(40);
    expect(snapshot.results.windows[1]?.metrics.find(({ name }) => name === "non_follower_reach")?.value).toBeNull();
    expect(snapshot.results.windows[1]).toMatchObject({ goviralAssistedCount: 1, ordinaryPersonalCount: 1 });
    expect(snapshot.results.windows[2]?.personalRatio).toBe(0.875);
    expect(snapshot.insightsUnreadable.forbidden).toBe(3);
    expect(JSON.stringify(snapshot).toLowerCase()).not.toContain("kvorum");
    expect(JSON.stringify(snapshot).toLowerCase()).not.toContain("manuscript");
  });

  it("exposes metadata-only voice health, bounded experiments and degraded actual spend", async () => {
    const snapshot = await readPersonalGrowthAdminInsights({ root: await fixtureRoot(), now: new Date("2026-08-27T08:00:00.000Z"), timeline: [] });
    expect(snapshot.voice).toMatchObject({ privateStoreStatus: "partial", profile: { completedSections: 2 }, leakGate: "unavailable" });
    expect(snapshot.voice.journals[0]).toMatchObject({ state: "present", language: "cs", costUsd: 0 });
    expect(snapshot.voice.journals[1]).toMatchObject({ state: "missing", language: "en" });
    expect(snapshot.experiments).toMatchObject({ activeCount: 0, maximumActive: 2 });
    expect(snapshot.experiments.items).toHaveLength(2);
    expect(snapshot.budget).toMatchObject({ monthlyCapUsd: 20, monthlySpendUsd: 15, remainingUsd: 5, companyRecordedSpendUsd: 35, degradation: "low" });
    expect(snapshot.budget.spendByCategory.find(({ label }) => label === "Research receipts")?.usd).toBeNull();
    expect(snapshot.budget.buffer).toMatchObject({ purchaseAuthorized: false, publishingAuthorized: false, subscriptionStatus: "not-assumed" });
  });

  it("keeps absent ledgers and denominators unavailable rather than measured zero", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "personal-growth-insights-empty-"));
    const snapshot = await readPersonalGrowthAdminInsights({ root, now: new Date("2026-08-27T08:00:00.000Z"), timeline: [] });
    expect(snapshot.results.windows[0]?.metrics.find(({ name }) => name === "reach")).toMatchObject({ value: null, unavailableReason: "not-returned" });
    expect(snapshot.budget.monthlySpendUsd).toBeNull();
    expect(snapshot.budget.remainingUsd).toBeNull();
  });
});
