import { describe, expect, it } from "vitest";
import type { PersonalGrowthThreadsCandidate } from "../src/contracts/personal-growth-recommendations.js";
import {
  buildPersonalGrowthThreadsPacket,
  createPersonalGrowthConversationOpportunity,
  loadPersonalGrowthContentConfig
} from "../src/ventures/personal-growth/recommendations.js";
import { personalGrowthHash } from "../src/ventures/personal-growth/planner.js";

const generatedAt = new Date("2026-08-27T21:00:00.000Z");

function candidate(overrides: Partial<PersonalGrowthThreadsCandidate> = {}): PersonalGrowthThreadsCandidate {
  const base = {
    text: "Dnes jsem si při psaní znovu ověřil, že dobrý detail unese celý odstavec.",
    language: "cs" as const,
    topicTag: null,
    sourceLane: "current-life-note" as const,
    personalPillar: "writing-publishing" as const,
    provenanceRefs: ["ventures/personal-growth/owner-inputs/note-1"],
    selectionReason: "Konkrétní dnešní poznámka má vlastní pointu.",
    conversationPurpose: "Sdílet zkušenost z psaní.",
    goviralSignalId: null,
    goviralExpiresAt: null,
    assertedPersonalMemory: true,
    ownerMemoryEvidenceRefs: ["owner-note:2026-08-27"],
    qualityFlags: {
      engagementBait: false,
      manufacturedOutrage: false,
      fakeVulnerability: false,
      unsupportedCertainty: false
    },
    activeExperimentId: null,
    generatedVersion: "deterministic-fixture/1",
    profileVersion: "pg-journal-cs-0123456789abcdef",
    ownerVetoed: false
  };
  const value = { ...base, ...overrides };
  return { ...value, candidateId: `pg-thread-candidate-${personalGrowthHash(value).slice(-16)}` };
}

describe("Personal Growth Threads recommendations", () => {
  it("selects one owner-grounded primary and at most two distinct alternatives", async () => {
    const config = await loadPersonalGrowthContentConfig();
    const packet = buildPersonalGrowthThreadsPacket({
      recommendationDate: "2026-08-28",
      generatedAt,
      config,
      candidates: [
        candidate(),
        candidate({ text: "Praha po dešti mě dnes donutila zpomalit cestou z práce.", personalPillar: "prague" }),
        candidate({ text: "Jedna malá změna v produktu dnes ušetřila tři zbytečné kroky.", sourceLane: "building-note", personalPillar: "software-products" }),
        candidate({ text: "Čtvrtá možnost už se do denního výběru nedostane." })
      ]
    });
    expect(packet.decision).toBe("RECOMMEND");
    expect(packet.primary).toMatchObject({ language: "cs", sourceLane: "current-life-note", similarityVerdict: "pass" });
    expect(packet.primary?.characterCount).toBe([...packet.primary!.text].length);
    expect(packet.alternatives).toHaveLength(2);
    expect(packet.publishingAuthorized).toBe(false);
    expect(packet.repliesAuthorized).toBe(false);
  });

  it("uses private voice only through an original leak-safe suggestion", async () => {
    const config = await loadPersonalGrowthContentConfig();
    const privateSource = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
    const safe = buildPersonalGrowthThreadsPacket({
      recommendationDate: "2026-08-28", generatedAt, config,
      candidates: [candidate({ sourceLane: "private-journal-style", text: "Krátká vlastní věta drží rytmus bez převzaté pasáže." })],
      privateSources: [privateSource]
    });
    expect(safe.primary?.leakAudit.status).toBe("pass");
    const blocked = buildPersonalGrowthThreadsPacket({
      recommendationDate: "2026-08-28", generatedAt, config,
      candidates: [candidate({ sourceLane: "private-journal-style", text: privateSource })],
      privateSources: [privateSource]
    });
    expect(blocked).toMatchObject({ decision: "NO_POST", rejectedCounts: { "manuscript-overlap": 1 } });
  });

  it("keeps accepted GoVIRAL input traceable, expiring and intelligence-only", async () => {
    const config = await loadPersonalGrowthContentConfig();
    const signal = candidate({
      sourceLane: "goviral-intelligence",
      text: "Když se kolem AI nástrojů zvedne vlna, zajímá mě hlavně to, co zůstane užitečné za měsíc.",
      goviralSignalId: "pg-gv-0123456789abcdef",
      goviralExpiresAt: "2026-08-29T21:00:00.000Z",
      provenanceRefs: ["state/ventures/goviral/profile.md", "ventures/personal-growth/intelligence/current.json"],
      assertedPersonalMemory: false,
      ownerMemoryEvidenceRefs: []
    });
    expect(buildPersonalGrowthThreadsPacket({ recommendationDate: "2026-08-28", generatedAt, config, candidates: [signal] }).primary)
      .toMatchObject({ goviralSignalId: signal.goviralSignalId, sourceLane: "goviral-intelligence" });
    expect(buildPersonalGrowthThreadsPacket({
      recommendationDate: "2026-08-30",
      generatedAt: new Date("2026-08-30T21:00:00.000Z"),
      config,
      candidates: [signal]
    })).toMatchObject({ decision: "NO_POST", rejectedCounts: { "expired-signal": 1 } });
  });

  it("returns honest NO_POST for empty, unavailable-English, similar, vetoed and unsafe candidates", async () => {
    const config = await loadPersonalGrowthContentConfig();
    expect(buildPersonalGrowthThreadsPacket({ recommendationDate: "2026-08-28", generatedAt, config, candidates: [] }))
      .toMatchObject({ decision: "NO_POST", noPostReason: "no-useful-candidate" });
    const probes = [
      [candidate({ language: "en", text: "An English lane that has not been configured yet." }), "english-profile"],
      [candidate(), "recent-similarity"],
      [candidate({ assertedPersonalMemory: true, ownerMemoryEvidenceRefs: [] }), "false-memory"],
      [candidate({ ownerVetoed: true }), "owner-veto"],
      [candidate({ provenanceRefs: ["state/ventures/kvorum/recommendations/claim.json"] }), "forbidden-provenance"],
      [candidate({ provenanceRefs: ["portfolio-item:auto-123"] }), "forbidden-provenance"],
      [candidate({ qualityFlags: { engagementBait: true, manufacturedOutrage: false, fakeVulnerability: false, unsupportedCertainty: false } }), "quality"]
    ] as const;
    for (const [value, reason] of probes) {
      const packet = buildPersonalGrowthThreadsPacket({
        recommendationDate: "2026-08-28", generatedAt, config, candidates: [value],
        recentPosts: reason === "recent-similarity" ? [value.text] : []
      });
      expect(packet.decision).toBe("NO_POST");
      expect(packet.rejectedCounts[reason]).toBe(1);
    }
  });

  it("keeps public conversation discovery manual and independently unavailable", async () => {
    const config = await loadPersonalGrowthContentConfig();
    const opportunity = createPersonalGrowthConversationOpportunity({
      provider: "official-threads-search",
      publicUrl: "https://www.threads.net/@public/post/example",
      observedAt: generatedAt.toISOString(),
      expiresAt: "2026-08-28T21:00:00.000Z",
      evidenceRefs: ["meta-search:public:example"],
      purpose: "Owner may choose to reply manually.",
      manualReplyOnly: true
    });
    const unavailable = buildPersonalGrowthThreadsPacket({
      recommendationDate: "2026-08-28", generatedAt, config, candidates: [candidate()], conversationCandidates: [opportunity]
    });
    expect(unavailable).toMatchObject({ conversationStatus: "unavailable", conversationOpportunities: [] });
    const available = buildPersonalGrowthThreadsPacket({
      recommendationDate: "2026-08-28", generatedAt, config, candidates: [candidate()], conversationCandidates: [opportunity], officialSearchEnabled: true
    });
    expect(available.conversationOpportunities).toEqual([expect.objectContaining({ manualReplyOnly: true })]);
    expect(buildPersonalGrowthThreadsPacket({
      recommendationDate: "2026-08-28", generatedAt, config, candidates: [candidate()], recommendationAuthority: false
    })).toMatchObject({ decision: "HELD", noPostReason: "authority-held", primary: null });
  });
});
