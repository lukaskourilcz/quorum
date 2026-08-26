import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PersonalGrowthGoViralPacketSchema } from "../src/contracts/personal-growth.js";
import {
  buildPersonalGrowthGoViralPacket,
  personalGrowthGoViralFeedback,
  readPersonalGrowthGoViralPacket,
  reusablePersonalGrowthGoViralPacket,
  writePersonalGrowthGoViralPacket,
  type SavedGoViralBrief,
  type SavedGoViralPersonalCandidate
} from "../src/ventures/personal-growth/goviral.js";
import { runPersonalGrowthDesk } from "../src/ventures/personal-growth/room.js";

function candidate(id: string, overrides: Partial<SavedGoViralPersonalCandidate> = {}): SavedGoViralPersonalCandidate {
  return {
    candidateId: id,
    topic: "owner-writing",
    evidenceRefs: [`state/ventures/goviral/evidence/${id}.json`],
    sourceRefs: [`state/ventures/goviral/sources/${id}.json`],
    evidenceStatus: "verified",
    velocity: 42,
    relevance: 0.8,
    pillar: "craft",
    expiresAt: "2026-09-01T00:00:00.000Z",
    format: "threads",
    fit: "strong",
    risk: "low",
    overload: "clear",
    ...overrides
  };
}

function brief(candidates: SavedGoViralPersonalCandidate[]): SavedGoViralBrief {
  return {
    briefId: "gv-brief-2026-08-24",
    briefHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    weekOf: "2026-08-24",
    generatedAt: "2026-08-24T11:00:00.000Z",
    expiresAt: "2026-09-01T00:00:00.000Z",
    sourceHealth: "healthy",
    quota: "available",
    agendaRef: "state/meeting-agendas/queue.json",
    candidates
  };
}

describe("Personal Growth GoVIRAL intelligence packet", () => {
  it("reuses the saved Monday brief and deterministically caps accepted opportunities at three", () => {
    const packet = buildPersonalGrowthGoViralPacket({
      brief: brief([
        candidate("one", { relevance: 0.7 }),
        candidate("two", { relevance: 0.9 }),
        candidate("three", { relevance: 0.8 }),
        candidate("four", { relevance: 0.6 })
      ]),
      personalGrowthRunAt: new Date("2026-08-24T21:00:00.000Z")
    });
    expect(PersonalGrowthGoViralPacketSchema.safeParse(packet).success).toBe(true);
    expect(packet.opportunities).toHaveLength(3);
    expect(packet.opportunities.map(({ relevance }) => relevance)).toEqual([0.9, 0.8, 0.7]);
    expect(packet).toMatchObject({
      reusedWeeklyBrief: true,
      providerRerun: false,
      incrementalCostUsd: 0,
      retrieval: { threadsKeywordMode: "bounded-public-actor", accountCredentialsUsed: false, apifyUpgradeRequired: false }
    });
  });

  it("never calls missing evidence a trend and accepts an empty packet as healthy", () => {
    const packet = buildPersonalGrowthGoViralPacket({
      brief: brief([
        candidate("weak", { evidenceStatus: "insufficient" }),
        candidate("empty", { evidenceRefs: [] })
      ]),
      personalGrowthRunAt: new Date("2026-08-24T21:00:00.000Z")
    });
    expect(packet.opportunities).toEqual([]);
    expect(packet.sourceHealth).toBe("healthy");
  });

  it("degrades on exhausted quota without requesting an upgrade or credentials", () => {
    const source = brief([candidate("one")]);
    source.quota = "exhausted";
    source.sourceHealth = "degraded";
    const packet = buildPersonalGrowthGoViralPacket({ brief: source, personalGrowthRunAt: new Date("2026-08-24T21:00:00.000Z") });
    expect(packet.opportunities).toEqual([]);
    expect(packet.retrieval).toEqual({
      threadsKeywordMode: "bounded-public-actor",
      accountCredentialsUsed: false,
      apifyUpgradeRequired: false
    });
  });

  it("reuses one packet and one agenda through expiry without another run or charge", () => {
    const first = buildPersonalGrowthGoViralPacket({ brief: brief([candidate("one")]), personalGrowthRunAt: new Date("2026-08-24T21:00:00.000Z") });
    const replay = buildPersonalGrowthGoViralPacket({
      brief: brief([candidate("changed")]),
      personalGrowthRunAt: new Date("2026-08-25T21:00:00.000Z"),
      existing: first
    });
    expect(replay).toEqual(first);
    expect(reusablePersonalGrowthGoViralPacket(first, new Date("2026-08-31T12:00:00.000Z"))).toEqual(first);
    expect(reusablePersonalGrowthGoViralPacket(first, new Date("2026-09-01T00:00:00.000Z"))).toBeNull();
  });

  it("persists one bounded current packet for the desk and replays the same input", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pg-goviral-"));
    try {
      const packet = buildPersonalGrowthGoViralPacket({ brief: brief([candidate("one")]), personalGrowthRunAt: new Date("2026-08-24T21:00:00.000Z") });
      expect(await writePersonalGrowthGoViralPacket(root, packet)).toMatchObject({ created: true });
      expect(await writePersonalGrowthGoViralPacket(root, packet)).toMatchObject({ created: false });
      expect(await readPersonalGrowthGoViralPacket(root, new Date("2026-08-25T12:00:00.000Z"))).toEqual(packet);
      const desk = await runPersonalGrowthDesk({
        root,
        now: new Date("2026-08-25T21:00:00.000Z"),
        dry: true
      });
      expect(desk.brief?.optionalInputs.goviral).toBe("available");
      expect(desk.brief?.inputHash).not.toBe(packet.inputHash);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records feedback beside the immutable packet and never weakens its evidence gates", () => {
    const packet = buildPersonalGrowthGoViralPacket({ brief: brief([candidate("one")]), personalGrowthRunAt: new Date("2026-08-24T21:00:00.000Z") });
    const snapshot = structuredClone(packet);
    const feedback = personalGrowthGoViralFeedback({
      packet,
      opportunityId: packet.opportunities[0]!.opportunityId,
      outcome: "rejected",
      recordedAt: new Date("2026-08-25T08:00:00.000Z")
    });
    expect(feedback.outcome).toBe("rejected");
    expect(packet).toEqual(snapshot);
    expect(packet.opportunities[0]!.evidenceStatus).toBe("verified");
  });

  it("keeps official Threads search as a future preference seam and rejects non-Monday ordering", () => {
    const official = buildPersonalGrowthGoViralPacket({
      brief: brief([]),
      personalGrowthRunAt: new Date("2026-08-24T21:00:00.000Z"),
      threadsMode: "official-future-seam"
    });
    expect(official.retrieval.threadsKeywordMode).toBe("official-future-seam");
    const wrongDay = brief([]);
    wrongDay.generatedAt = "2026-08-25T11:00:00.000Z";
    expect(() => buildPersonalGrowthGoViralPacket({ brief: wrongDay, personalGrowthRunAt: new Date("2026-08-25T21:00:00.000Z") }))
      .toThrow("Monday GoVIRAL brief");
  });
});
