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
});
