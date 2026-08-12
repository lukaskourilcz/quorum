import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeAutonomySnapshot,
  evaluateFeatureCadence,
  evaluateResearchEfficiency
} from "../src/autonomy/signals.js";
import { repoRoot } from "../src/paths.js";

async function json(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

describe("zero-model operating signals", () => {
  it("treats NO_EDITION as neutral and never exposes audience metrics", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-signals-"));
    await json(path.join(stateRoot, "edition/deliveries/one.json"), { status: "delivered", editionStatus: "edition" });
    await json(path.join(stateRoot, "edition/deliveries/two.json"), { status: "delivered", editionStatus: "no_edition" });
    await json(path.join(stateRoot, "edition/deliveries/three.json"), { status: "needs_reconciliation", editionStatus: "edition" });
    const snapshot = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-01T04:00:00.000Z") });
    const caughtUp = snapshot.growth.find((venture) => venture.venture === "caught-up");
    expect(caughtUp?.signals.find((entry) => entry.id === "edition-cadence")?.value).toBe(0.5);
    expect(snapshot.metricsIngestionEnabled).toBe(false);
    expect(JSON.stringify(snapshot)).not.toMatch(/visitor|reader|views|likes|engagement/i);
  });

  it("records what every rate was divided by", async () => {
    // `ratio()` has to return 0 for an empty denominator, and that 0 is indistinguishable from a
    // measured one — the admin read "Releases that passed 0%" on a week with no releases at all.
    // Writing the denominator is what lets a reader tell a failure from an absence.
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-denominators-"));
    const snapshot = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-01T04:00:00.000Z") });
    expect(snapshot.quality.denominators).toEqual({ meetings: 0, proofs: 0, fighterFields: 0 });
    expect(snapshot.quality.verifierPassRate).toBe(0);
  });

  it("counts at most one feature per completed BOOKSOFHISTORY cycle", () => {
    expect(evaluateFeatureCadence({
      completedCycleIds: ["bh-1", "bh-2", "bh-2"],
      featuredCycleIds: ["bh-1", "bh-1", "unfinished"]
    })).toBe(0.5);
    expect(evaluateFeatureCadence({ completedCycleIds: [], featuredCycleIds: ["bh-1"] })).toBeNull();
  });

  it("counts distinct used paid dossiers and keeps no denominator null", () => {
    expect(evaluateResearchEfficiency({
      paidDossierIds: ["dossier-1", "dossier-2", "dossier-2"],
      usedDossierIds: ["dossier-2", "dossier-2", "unpaid-dossier"]
    })).toBe(0.5);
    expect(evaluateResearchEfficiency({ paidDossierIds: [], usedDossierIds: ["dossier-1"] })).toBeNull();
  });

  it("publishes null rather than a fabricated zero before BOOKSOFHISTORY has state", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-booksofhistory-signals-"));
    const snapshot = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-01T04:00:00.000Z") });
    const books = snapshot.growth.find((venture) => venture.venture === "booksofhistory");
    expect(books?.signals.map((entry) => [entry.id, entry.value])).toEqual([
      ["feature-cadence", null],
      ["research-efficiency", null]
    ]);
  });

  it("publishes used paid dossiers from the recorded research ledger", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-booksofhistory-efficiency-"));
    const first = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/bh-research-ledger.valid.json"), "utf8"));
    const firstSynthesis = { ...first, step: "synth", searches: 0, costUsd: 0.02, used: true };
    const second = {
      ...first,
      bookId: "second-book",
      dossierRef: "ventures/booksofhistory/dossiers/second-book/dossier.json",
      rawRef: "ventures/booksofhistory/dossiers/second-book/raw/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
      used: false
    };
    const ledger = path.join(stateRoot, "ventures/booksofhistory/research-ledger.jsonl");
    await mkdir(path.dirname(ledger), { recursive: true });
    await writeFile(ledger, `${JSON.stringify(first)}\n${JSON.stringify(firstSynthesis)}\n${JSON.stringify(second)}\nnot-json\n`);

    const snapshot = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-21T12:00:00.000Z") });
    const signal = snapshot.growth.find((venture) => venture.venture === "booksofhistory")?.signals
      .find((entry) => entry.id === "research-efficiency");

    expect(signal).toMatchObject({ value: 0.5, unit: "ratio" });
    expect(signal?.detail).toContain("1 of 2 paid dossiers");
    expect(signal?.detail).toContain("1 unreadable ledger line was excluded");
  });

  it("keeps action completion null until an owner action is issued", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-action-empty-"));
    const snapshot = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-12T04:00:00.000Z") });
    const signal = snapshot.growth
      .find((venture) => venture.venture === "door-money")
      ?.signals.find((entry) => entry.id === "action-completion");
    expect(signal).toMatchObject({ value: null, unit: "ratio" });
    expect(signal?.detail).toMatch(/not measured/i);
  });

  it("divides owner-recorded completions by issued actions", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-action-rate-"));
    await json(path.join(stateRoot, "ventures/door-money/actions/2026-08-13.json"), {
      schemaVersion: "action-packet/1",
      ventureId: "door-money",
      tasks: [
        { id: "dm-action-1", completion: { completedAt: "2026-08-14T12:00:00.000Z", outcome: "Sent by the owner." } },
        { id: "dm-action-2", completion: null },
        { id: "dm-action-3", completion: { completedAt: "2026-08-15T12:00:00.000Z", outcome: "Recorded by the owner." } }
      ]
    });
    const snapshot = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-16T04:00:00.000Z") });
    const signal = snapshot.growth
      .find((venture) => venture.venture === "door-money")
      ?.signals.find((entry) => entry.id === "action-completion");
    expect(signal).toMatchObject({ value: 0.6667, unit: "ratio" });
    expect(signal?.detail).toContain("2 of 3");
  });

  it("does not report marketingShark packages as Door Money cadence", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-package-cadence-"));
    await json(path.join(stateRoot, "ventures/marketingshark/packages/2026-08-12/devshark/package.json"), {
      carousels: { cs: {}, en: {} },
      render: { summaryPaths: ["one.json"] }
    });
    await json(path.join(stateRoot, "ventures/door-money/recommendations/one.json"), {
      schemaVersion: "venture-recommendation/1",
      id: "dm-rec-1",
      ventureId: "door-money"
    });
    const snapshot = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-12T04:00:00.000Z") });
    const packageCadence = (ventureId: string) => snapshot.growth
      .find((venture) => venture.venture === ventureId)
      ?.signals.find((entry) => entry.id === "package-cadence")?.value;
    expect(packageCadence("marketingshark")).toBe(1);
    expect(packageCadence("door-money")).toBe(1);

    await json(path.join(stateRoot, "ventures/marketingshark/packages/2026-08-13/devshark/package.json"), {
      carousels: { cs: {}, en: {} },
      render: { summaryPaths: ["two.json"] }
    });
    const updated = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-13T04:00:00.000Z") });
    expect(updated.growth.find((venture) => venture.venture === "marketingshark")?.signals.find((entry) => entry.id === "package-cadence")?.value).toBe(2);
    expect(updated.growth.find((venture) => venture.venture === "door-money")?.signals.find((entry) => entry.id === "package-cadence")?.value).toBe(1);
  });
});
