import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readAdminBooksofhistory } from "./admin-booksofhistory";

const roots: string[] = [];
const fixtureRoot = path.resolve(process.cwd(), "../contracts/fixtures");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), name));
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

describe("BOOKSOFHISTORY admin loader", () => {
  it("reports absent stores without inventing records or efficiency", async () => {
    const root = await temporaryRoot("bh-admin-missing-");

    const snapshot = await readAdminBooksofhistory(root);

    expect(snapshot.stores).toEqual({
      seed: "missing",
      shortlists: "missing",
      briefs: "missing",
      cycle: "missing",
      dossiers: "missing",
      ledger: "missing",
      features: "missing"
    });
    expect(snapshot.unreadable).toEqual({
      seed: 0,
      shortlists: 0,
      briefs: 0,
      cycle: 0,
      dossiers: 0,
      ledger: 0,
      features: 0,
      total: 0
    });
    expect(snapshot).toMatchObject({
      seedBooks: null,
      shortlist: null,
      brief: null,
      cycle: null,
      dossiers: [],
      ledger: [],
      researchEfficiency: null,
      features: []
    });
  });

  it("projects valid fixture state, drops poison records, and counts each unreadable", async () => {
    const root = await temporaryRoot("bh-admin-present-");
    await Promise.all([
      put(root, "state/ventures/booksofhistory/seed/library.json", await fixture("bh-seed.valid.json")),
      put(root, "state/ventures/booksofhistory/shortlists/2026-08-12.json", await fixture("bh-shortlist.valid.json")),
      put(root, "state/ventures/booksofhistory/shortlists/poison.json", await fixture("bh-shortlist.poison.json")),
      put(root, "state/ventures/booksofhistory/briefs/2026-08-12.json", await fixture("bh-research-brief.valid.json")),
      put(root, "state/ventures/booksofhistory/briefs/poison.json", await fixture("bh-research-brief.poison.json")),
      put(root, "state/ventures/booksofhistory/cycle.json", await fixture("bh-cycle.valid.json")),
      put(root, "state/ventures/booksofhistory/dossiers/war-with-the-newts/dossier.json", await fixture("bh-dossier.valid.json")),
      put(root, "state/ventures/booksofhistory/dossiers/poison/dossier.json", await fixture("bh-dossier.poison.json")),
      put(root, "state/ventures/booksofhistory/research-ledger.jsonl", `${JSON.stringify(JSON.parse(await fixture("bh-research-ledger.valid.json")))}\nnot-json\n`),
      put(root, "state/ventures/booksofhistory/recommendations/feature.json", await fixture("venture-recommendation.valid.json")),
      put(root, "state/ventures/booksofhistory/recommendations/poison.json", await fixture("venture-recommendation.poison.json"))
    ]);

    const snapshot = await readAdminBooksofhistory(root);

    expect(snapshot.stores).toEqual({
      seed: "present",
      shortlists: "present",
      briefs: "present",
      cycle: "present",
      dossiers: "present",
      ledger: "present",
      features: "present"
    });
    expect(snapshot.unreadable).toEqual({
      seed: 0,
      shortlists: 1,
      briefs: 1,
      cycle: 0,
      dossiers: 1,
      ledger: 1,
      features: 1,
      total: 5
    });
    expect(snapshot.seedBooks).toBe(1);
    expect(snapshot.shortlist?.entries[0]).toMatchObject({
      rank: 1,
      bookId: "war-with-the-newts",
      totalScore: 91.4,
      factors: {
        priors: { score: 91.4 },
        anniversary: { multiplier: 1, strength: 0 },
        trendCrossover: { multiplier: 1, strength: 0, signalCount: 0 },
        lanePerformance: { multiplier: 1, lanes: { cs: 1, en: 1 } }
      }
    });
    expect(snapshot.brief).toMatchObject({
      meetingId: "2026-08-12-bh-desk",
      maximumCandidates: 3
    });
    expect(snapshot.brief?.selections[0]).toMatchObject({ bookId: "war-with-the-newts", shortlistRank: 1 });
    expect(snapshot.cycle).toMatchObject({ cycleId: "bh-2026-08-12-001", phase: "production" });
    expect(snapshot.dossiers[0]).toMatchObject({
      bookId: "war-with-the-newts",
      claims: [{ verificationState: "verified", publicationSuitable: true }],
      quotes: [{ attribution: "Archive catalogue" }]
    });
    expect(snapshot.ledger).toEqual([
      expect.objectContaining({ bookId: "war-with-the-newts", requestingMeetingId: "2026-08-12-bh-desk", costUsd: 0.04, used: false })
    ]);
    expect(snapshot.researchEfficiency).toBe(0);
    expect(snapshot.features[0]).toMatchObject({
      recommendationId: "rec-aaaaaaaaaaaaaaaaaaaa",
      dossierId: "war-with-the-newts",
      storyId: "story-serial-to-book",
      postedUrls: { cs: null, en: null },
      resultCounts: { cs: 0, en: 0 }
    });
    const publicProjection = JSON.stringify(snapshot);
    expect(publicProjection).not.toContain("state/");
    expect(publicProjection).not.toContain("ventures/booksofhistory/");
    expect(publicProjection).not.toContain(".json");
  });

  it("distinguishes an unreadable singleton from a missing one", async () => {
    const root = await temporaryRoot("bh-admin-unreadable-");
    await put(root, "state/ventures/booksofhistory/cycle.json", "{not-json");

    const snapshot = await readAdminBooksofhistory(root);

    expect(snapshot.stores.cycle).toBe("unreadable");
    expect(snapshot.unreadable).toMatchObject({ cycle: 1, total: 1 });
    expect(snapshot.cycle).toBeNull();
  });
});
