import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAdminTehdejsiSvet } from "@/lib/admin-tehdejsi-svet";
import { TehdejsiSvetLibraryPanel } from "./tehdejsi-svet-library-panel";

const roots: string[] = [];
const fixtures = path.resolve(process.cwd(), "../contracts/fixtures");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixtures, name), "utf8");
}

async function put(root: string, relative: string, contents: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function fixtureSnapshot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-library-panel-"));
  roots.push(root);
  const facts = JSON.parse(await fixture("tehdejsi-facts.valid.json")) as { facts: unknown[]; contentHash: string };
  facts.contentHash = createHash("sha256").update(canonicalJson(facts.facts)).digest("hex");
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
  await Promise.all([
    put(root, "state/ventures/tehdejsi-svet/facts.json", `${JSON.stringify(facts)}\n`),
    put(root, "state/ventures/tehdejsi-svet/research-ledger.jsonl", `${JSON.stringify(purchase)}\n${JSON.stringify(use)}\n`)
  ]);
  return readAdminTehdejsiSvet(root);
}

describe("Tehdejsi svet library panel", () => {
  it("renders the fixture facts index, filters, source age, research shelf and measured efficiency", async () => {
    const html = renderToStaticMarkup(
      <TehdejsiSvetLibraryPanel now="2026-08-20T18:00:00.000Z" snapshot={await fixtureSnapshot()} />
    );

    expect(html).toContain("Facts-file status");
    expect(html).toContain('data-admin-metrics="true"');
    expect(html).toContain("8 days old");
    expect(html).toContain("Envelope hash");
    expect(html).toContain("Product drift is not measured automatically");
    expect(html).toContain("Country");
    expect(html).toContain("Place");
    expect(html).toContain("Decade");
    expect(html).toContain("Pillar");
    expect(html).toContain("brno-1975-tram-fare");
    expect(html).toContain("lviv-1975-cinema-evening");
    expect(html).toContain("Synthetic contract fixture source");
    expect(html).toContain("Research shelf");
    expect(html).toContain("100%");
    expect(html).toContain("fixture-provider · fixture-model");
    expect(html).toContain("ts-fixture-feature");
    expect(html).not.toContain("sourceCommit");
    expect(html).not.toContain("dossierRef");
    expect(html).not.toContain("state/ventures");
  });

  it("keeps efficiency absent and facts empty when their records do not exist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-library-empty-"));
    roots.push(root);
    const html = renderToStaticMarkup(
      <TehdejsiSvetLibraryPanel now="2026-08-20T18:00:00.000Z" snapshot={await readAdminTehdejsiSvet(root)} />
    );

    expect(html).toContain("No committed facts file is available.");
    expect(html).toContain("Not available");
    expect(html).toContain("No paid research denominator exists");
    expect(html).toContain("No research dossier purchase is recorded.");
  });
});
