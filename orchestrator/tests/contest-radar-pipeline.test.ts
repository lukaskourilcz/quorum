import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runContestAdapter } from "../src/ventures/contest-radar/adapters.js";
import {
  canonicalizeUrl,
  clusterCandidates,
  comparableTitle,
  prefilterCandidates
} from "../src/ventures/contest-radar/canonical.js";
import { extractContestRecord, parseContestDate, parsePrize } from "../src/ventures/contest-radar/extract.js";
import { rankContestRecord, rankContestRecords } from "../src/ventures/contest-radar/rank.js";
import { loadContestSourceRegistry } from "../src/ventures/contest-radar/sources.js";
import type { ContestCandidate, ContestRecord } from "../src/contracts/contest-radar.js";
import { repoRoot } from "../src/paths.js";

const AT = "2026-08-30T12:00:00.000Z";
const TODAY = "2026-08-30";

async function candidatesFromFixtures(): Promise<ContestCandidate[]> {
  const registry = await loadContestSourceRegistry();
  const out: ContestCandidate[] = [];
  for (const [id, file] of [
    ["devpost", "devpost.json"],
    ["esutaze-sk", "esutaze.xml"],
    ["chcemesoutezit-cz", "chcemesoutezit.json"]
  ] as const) {
    const source = registry.sources.find((candidate) => candidate.id === id)!;
    const body = await readFile(path.join(repoRoot, "orchestrator/tests/fixtures/contest-radar", file), "utf8");
    out.push(...runContestAdapter({ source, body, observedAt: AT }).candidates);
  }
  return out;
}

describe("canonicalizing and clustering", () => {
  it("treats tracking parameters, www and a trailing slash as the same page", () => {
    expect(canonicalizeUrl("https://www.esutaze.sk/vyhrajte/?utm_source=fb&fbclid=x"))
      .toBe(canonicalizeUrl("https://esutaze.sk/vyhrajte"));
  });

  it("folds diacritics and case so two spellings of one title compare", () => {
    expect(comparableTitle("Soutěž o iPhone 17!")).toBe(comparableTitle("SOUTEZ O IPHONE 17"));
  });

  /*
   * Over-merging hides a contest; duplicating one only annoys. So a merge needs the same host as
   * well as a near-identical title: three organizers running an iPhone giveaway are three
   * opportunities, and collapsing them would silently cost the owner two.
   */
  it("refuses to merge identical titles from different hosts", () => {
    const base = {
      schemaVersion: "contest-candidate/1" as const,
      sourceItemId: "1",
      targetUrl: null,
      rulesUrl: null,
      snippet: null,
      organizer: null,
      hints: { track: "consumer" as const, kind: null, language: null, location: null, prizeText: null, deadlineText: null, mechanics: [] },
      observedAt: AT,
      contentHash: "a".repeat(64)
    };
    const clusters = clusterCandidates([
      { ...base, sourceId: "a", listingUrl: "https://one.test/soutez-o-iphone", title: "Soutěž o iPhone 17" },
      { ...base, sourceId: "b", listingUrl: "https://two.test/soutez-o-iphone", title: "Soutěž o iPhone 17" }
    ]);

    expect(clusters).toHaveLength(2);
  });

  it("merges the same contest listed twice on one host", () => {
    const base = {
      schemaVersion: "contest-candidate/1" as const,
      sourceItemId: "1",
      targetUrl: null,
      rulesUrl: null,
      snippet: null,
      organizer: null,
      hints: { track: "consumer" as const, kind: null, language: null, location: null, prizeText: null, deadlineText: null, mechanics: [] },
      observedAt: AT,
      contentHash: "a".repeat(64)
    };
    const clusters = clusterCandidates([
      { ...base, sourceId: "a", listingUrl: "https://one.test/x?utm_source=fb", title: "Vyhrajte značkový zmrzlinovač Ninja" },
      { ...base, sourceId: "b", listingUrl: "https://www.one.test/x", title: "Vyhrajte značkový zmrzlinovač Ninja 7v1" }
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members).toHaveLength(2);
  });

  it("drops a rules or results page without dropping a contest", async () => {
    const candidates = await candidatesFromFixtures();
    const result = prefilterCandidates([
      ...candidates,
      { ...candidates[0]!, sourceItemId: "rules", title: "Pravidla soutěže a obchodní podmínky" }
    ]);

    expect(result.dropCounts["not-an-opportunity"]).toBe(1);
    expect(result.kept).toHaveLength(candidates.length);
  });
});

describe("deterministic extraction", () => {
  it("reads Czech, dotted and ISO dates", () => {
    expect(parseContestDate("do 15. září 2026", 2026)).toBe("2026-09-15");
    expect(parseContestDate("31.12.2026", 2026)).toBe("2026-12-31");
    expect(parseContestDate("2026-10-01", 2026)).toBe("2026-10-01");
    expect(parseContestDate("someday soon", 2026)).toBeNull();
  });

  it("reads a prize only where an amount and a currency appear together", () => {
    expect(parsePrize("Vyhrajte 10 000 Kč")).toEqual({ amount: 10000, currency: "CZK" });
    expect(parsePrize("až 10 000 €")).toEqual({ amount: 10000, currency: "EUR" });
    expect(parsePrize("skvělé ceny")).toBeNull();
  });

  it("builds records from real fixture bytes and keeps the adapter's own kind", async () => {
    const clusters = clusterCandidates(prefilterCandidates(await candidatesFromFixtures()).kept);
    const records = clusters
      .map((cluster) => extractContestRecord({ cluster, now: AT }))
      .filter((record): record is ContestRecord => record !== null);

    expect(records.length).toBe(clusters.length);
    // Devpost's endpoint says an item is a hackathon by being the hackathons endpoint; re-guessing
    // from the title threw that away, because "RevenueCat Shipaton" contains no keyword.
    expect(records.some((record) => record.kind === "hackathon")).toBe(true);
  });

  /*
   * Absence of the word "nákup" is not evidence that a contest is free. Recording only the
   * positive signal is what stops the owner buying something to enter.
   */
  it("never concludes a contest is free from silence", async () => {
    const clusters = clusterCandidates(prefilterCandidates(await candidatesFromFixtures()).kept);
    const records = clusters
      .map((cluster) => extractContestRecord({ cluster, now: AT }))
      .filter((record): record is ContestRecord => record !== null);

    for (const record of records) {
      expect(record.cost.purchaseRequired.value === false).toBe(false);
      if (record.cost.purchaseRequired.value === null) {
        expect(record.cost.purchaseRequired.unavailableReason).toBe("requires-owner-check");
      }
    }
  });

  it("leaves eligibility to the rules page rather than inferring it", async () => {
    const clusters = clusterCandidates(prefilterCandidates(await candidatesFromFixtures()).kept);
    const record = extractContestRecord({ cluster: clusters[0]!, now: AT })!;

    expect(record.eligibility.minimumAge.value).toBeNull();
    expect(record.eligibility.minimumAge.unavailableReason).toBe("requires-owner-check");
    expect(record.legitimacy.state).toBe("unverified");
  });
});

describe("ranking", () => {
  function record(over: Partial<ContestRecord> = {}): ContestRecord {
    const measured = <T>(value: T) => ({ value, confidence: "derived" as const, unavailableReason: null, evidenceRefs: [] });
    const absent = { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] };
    return {
      schemaVersion: "contest-record/1",
      id: "cr-0000000000000001",
      canonicalUrl: "https://one.test/x",
      sourceRefs: [{ sourceId: "esutaze-sk", sourceItemId: "1", listingUrl: "https://one.test/x" }],
      title: "A contest",
      organizer: null,
      track: "consumer",
      kind: "sweepstakes",
      categories: [],
      language: "cs",
      eligibility: { facts: [], minimumAge: absent, residency: absent },
      dates: { registrationOpens: absent, submissionCloses: absent, eventStarts: absent, deadline: measured("2026-09-01"), resultsAnnounced: absent },
      prize: { description: absent, valueAmount: measured(50_000), currency: measured("CZK") },
      cost: { purchaseRequired: absent, entryFee: absent },
      mechanics: ["like"],
      repeatHints: [],
      judging: absent,
      participation: absent,
      effort: { tier: "minutes", minutes: absent, basis: "One mechanic." },
      legitimacy: { state: "unverified", reasons: ["Not checked."] },
      readiness: "needs-detail",
      readinessReasons: ["Rules page unread."],
      conflicts: [],
      rankingRefs: [],
      preparationRefs: [],
      firstSeenAt: AT,
      lastSeenAt: AT,
      lifecycle: "discovered",
      staleAfter: null,
      versions: { source: "1.0.0", extraction: "1.0.0", enrichment: null, ranking: null },
      lockedFields: [],
      supersedesRef: null,
      ...over
    } as ContestRecord;
  }

  /*
   * The founding decision's rule is structural, not a heavy weight. A purchase-required contest
   * with a huge prize closing tomorrow still sorts below a free one, because the system will not
   * buy the required product and so the two are different categories of thing.
   */
  it("sorts every purchase-required contest below every free one", () => {
    const free = record({ id: "cr-free", prize: { description: { value: null, confidence: null, unavailableReason: "not-stated", evidenceRefs: [] }, valueAmount: { value: 500, confidence: "derived", unavailableReason: null, evidenceRefs: [] }, currency: { value: "CZK", confidence: "derived", unavailableReason: null, evidenceRefs: [] } } } as Partial<ContestRecord>);
    const paid = record({
      id: "cr-paid",
      dates: { ...record().dates, deadline: { value: "2026-08-31", confidence: "derived", unavailableReason: null, evidenceRefs: [] } },
      cost: { purchaseRequired: { value: true, confidence: "inferred", unavailableReason: null, evidenceRefs: [] }, entryFee: { value: null, confidence: null, unavailableReason: "not-stated", evidenceRefs: [] } }
    } as Partial<ContestRecord>);

    const ranked = rankContestRecords([paid, free], TODAY);

    expect(ranked[0]?.contestId).toBe("cr-free");
    expect(ranked[1]?.band).toBe("purchase-required");
  });

  it("does not rank a closed record at all", () => {
    const rank = rankContestRecord(record({ lifecycle: "closed" }), TODAY);

    // Null rather than zero: it is not a bad opportunity, it is not an opportunity.
    expect(rank.score).toBeNull();
    expect(rank.band).toBe("not-ranked");
  });

  it("scores an unmeasured fact neutrally rather than as a zero", () => {
    const absent = { value: null, confidence: null, unavailableReason: "not-stated" as const, evidenceRefs: [] };
    const terse = record({ prize: { description: absent, valueAmount: absent, currency: absent } } as Partial<ContestRecord>);

    const component = rankContestRecord(terse, TODAY).components.find(({ id }) => id === "value");

    // A terse listing should sit mid-list, not last. Zero would bury every contest whose page
    // happened to be short.
    expect(component?.score).toBe(0.5);
    expect(component?.reason).toContain("No readable prize");
  });

  it("explains every component so a reader can argue with the order", () => {
    const rank = rankContestRecord(record(), TODAY);

    expect(rank.components).toHaveLength(5);
    for (const component of rank.components) expect(component.reason.length).toBeGreaterThan(0);
  });
});
