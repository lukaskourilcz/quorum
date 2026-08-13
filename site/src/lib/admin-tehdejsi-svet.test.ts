import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAdminTehdejsiSvet } from "./admin-tehdejsi-svet";

const roots: string[] = [];
const fixtureRoot = path.resolve(process.cwd(), "../contracts/fixtures");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "admin-tehdejsi-"));
  roots.push(root);
  return root;
}

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixtureRoot, name), "utf8");
}

async function put(root: string, relative: string, contents: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function factsFixture(): Promise<string> {
  const value = JSON.parse(await fixture("tehdejsi-facts.valid.json")) as { facts: unknown[]; contentHash: string };
  value.contentHash = createHash("sha256").update(canonicalJson(value.facts)).digest("hex");
  return `${JSON.stringify(value)}\n`;
}

describe("Tehdejsi svet admin loader", () => {
  it("reports absent stores without inventing state or an efficiency denominator", async () => {
    const snapshot = await readAdminTehdejsiSvet(await temporaryRoot());

    expect(snapshot.stores).toEqual({ facts: "missing", shortlists: "missing", cycle: "missing", ledger: "missing", features: "missing", ratings: "missing", results: "missing", signals: "missing", insights: "missing" });
    expect(snapshot.unreadable).toEqual({ facts: 0, shortlists: 0, cycle: 0, ledger: 0, features: 0, ratings: 0, results: 0, signals: 0, insights: 0, total: 0 });
    expect(snapshot).toMatchObject({ facts: null, shortlist: null, cycle: null, research: [], researchEfficiency: null, features: [], signalHarvests: [], signalDigests: [], productInsights: [] });
  });

  it("projects valid fixture state, drops poison records, and counts each unreadable", async () => {
    const root = await temporaryRoot();
    const purchase = {
      schemaVersion: "ts-research-ledger/1", kind: "purchase", topicKey: "era-music", briefHash: "a".repeat(64),
      cycleId: "ts-2026-08-12", provider: "fixture-provider", model: "fixture-model",
      startedAt: "2026-08-12T18:00:00.000Z", completedAt: "2026-08-12T18:01:00.000Z",
      tokensIn: 120, tokensOut: 80, searches: 1, costUsd: 0.2,
      dossierRef: "state/ventures/tehdejsi-svet/dossiers/era-music.json"
    };
    const use = {
      schemaVersion: "ts-research-ledger/1", kind: "use", topicKey: "era-music", briefHash: "a".repeat(64),
      at: "2026-08-14T18:00:00.000Z", recommendationId: "ts-fixture-feature"
    };
    const rating = {
      schemaVersion: "rating/1", id: "r-2026-08-14-abcd", ventureId: "tehdejsi-svet", objectKind: "recommendation",
      objectRef: { id: "ts-2026-08-14-vecernicek", contentHash: "sha256:aaaaaaaaaaaa" },
      rating: "good", ratedAt: "2026-08-14T19:00:00.000Z"
    };
    const result = JSON.parse(await fixture("tehdejsi-owner-result-entry.valid.json")) as Record<string, unknown>;
    result.recommendationId = "ts-2026-08-14-vecernicek";
    await Promise.all([
      put(root, "state/ventures/tehdejsi-svet/facts.json", await factsFixture()),
      put(root, "state/ventures/tehdejsi-svet/shortlists/2026-08-12.json", await fixture("tehdejsi-shortlist.valid.json")),
      put(root, "state/ventures/tehdejsi-svet/shortlists/poison.json", await fixture("tehdejsi-shortlist.poison.json")),
      put(root, "state/ventures/tehdejsi-svet/cycle.json", await fixture("tehdejsi-cycle.valid.json")),
      put(root, "state/ventures/tehdejsi-svet/research-ledger.jsonl", `${JSON.stringify(purchase)}\nnot-json\n${JSON.stringify(use)}\n`),
      put(root, "state/ventures/tehdejsi-svet/drafts/feature.json", await fixture("venture-recommendation-tehdejsi.valid.json")),
      put(root, "state/ventures/tehdejsi-svet/drafts/poison.json", await fixture("venture-recommendation-tehdejsi.poison.json")),
      put(root, "state/ratings/tehdejsi-svet/ledger.jsonl", `${JSON.stringify(rating)}\n`),
      put(root, `state/ventures/tehdejsi-svet/results/${result.resultId}.json`, `${JSON.stringify(result)}\n`),
      put(root, "state/ventures/tehdejsi-svet/results/poison.json", await fixture("tehdejsi-owner-result-entry.poison.json")),
      put(root, "state/ventures/tehdejsi-svet/signals/digests/ts-signal-digest-2026-08-16-a1b2c3d4e5f6.json", await fixture("tehdejsi-signal.valid.json")),
      put(root, "state/ventures/tehdejsi-svet/signals/digests/poison.json", await fixture("tehdejsi-signal.poison.json")),
      put(root, "state/ventures/tehdejsi-svet/product-insights/ts-insight-synthetic-gap.json", await fixture("tehdejsi-product-insight.valid.json")),
      put(root, "state/ventures/tehdejsi-svet/product-insights/poison.json", await fixture("tehdejsi-product-insight.poison.json"))
    ]);

    const snapshot = await readAdminTehdejsiSvet(root);

    expect(snapshot.stores).toEqual({ facts: "present", shortlists: "present", cycle: "present", ledger: "present", features: "present", ratings: "present", results: "present", signals: "present", insights: "present" });
    expect(snapshot.unreadable).toEqual({ facts: 0, shortlists: 1, cycle: 0, ledger: 1, features: 1, ratings: 0, results: 1, signals: 1, insights: 1, total: 6 });
    expect(snapshot.facts?.copiedAt).toBe("2026-08-12T18:00:00.000Z");
    expect(snapshot.facts?.facts[0]).toMatchObject({ id: "brno-1975-tram-fare" });
    expect(snapshot.shortlist?.entries[0]).toMatchObject({ rank: 1, factId: "cs-1970s-vecernicek", factors: { askability: 8 } });
    expect(snapshot.cycle).toMatchObject({ phase: "production", chosenFactIds: ["cs-1970s-vecernicek"] });
    expect(snapshot.research).toEqual([expect.objectContaining({ topicKey: "era-music", costUsd: 0.2, usedBy: ["ts-fixture-feature"] })]);
    expect(snapshot.researchEfficiency).toBe(1);
    expect(snapshot.features[0]).toMatchObject({
      id: "ts-2026-08-14-vecernicek", status: "approved", sensitivityTier: 0, designLab: { ready: true },
      ratings: [{ rating: "good" }], results: [{ enteredBy: "owner", metrics: { sends: 17, saves: 23 } }]
    });
    expect(snapshot.signalDigests[0]).toMatchObject({ kind: "sunday-digest", recollections: [{ classification: "recollection-not-fact" }] });
    expect(snapshot.productInsights[0]).toMatchObject({ id: "ts-insight-synthetic-gap", status: "proposed" });
    const publicProjection = JSON.stringify(snapshot);
    expect(publicProjection).not.toContain("dossierRef");
    expect(publicProjection).not.toContain("shortlistRef");
    expect(publicProjection).not.toContain("summaryPath");
    expect(publicProjection).not.toContain("state/ventures/");
  });

  it("marks a hash-mismatched facts file unreadable instead of serving edited claims", async () => {
    const root = await temporaryRoot();
    await put(root, "state/ventures/tehdejsi-svet/facts.json", await fixture("tehdejsi-facts.valid.json"));

    const snapshot = await readAdminTehdejsiSvet(root);

    expect(snapshot.stores.facts).toBe("unreadable");
    expect(snapshot.unreadable.facts).toBe(1);
    expect(snapshot.facts).toBeNull();
  });

  it("keeps research efficiency null until a paid purchase exists", async () => {
    const root = await temporaryRoot();
    const free = {
      schemaVersion: "ts-research-ledger/1", kind: "purchase", topicKey: "free-fixture", briefHash: "b".repeat(64),
      cycleId: "ts-2026-08-12", provider: "fixture-provider", model: "fixture-model",
      startedAt: "2026-08-12T18:00:00.000Z", completedAt: "2026-08-12T18:00:01.000Z",
      tokensIn: 0, tokensOut: 0, searches: 0, costUsd: 0,
      dossierRef: "state/ventures/tehdejsi-svet/dossiers/free-fixture.json"
    };
    await put(root, "state/ventures/tehdejsi-svet/research-ledger.jsonl", `${JSON.stringify(free)}\n`);

    expect((await readAdminTehdejsiSvet(root)).researchEfficiency).toBeNull();
  });
});
