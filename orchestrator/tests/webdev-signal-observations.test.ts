import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWebDevBaseline,
  buildWebDevObservation,
  evaluateWebDevLearning,
  WEBDEV_LEARNABLE_KNOBS,
  type WebDevEditionObservationInput
} from "../src/ventures/webdev-signal/observations.js";
import {
  readWebDevObservations,
  writeWebDevObservation
} from "../src/ventures/webdev-signal/observation-store.js";
import type { WebDevSelectionMetrics } from "../src/ventures/webdev-signal/selection/decision.js";
import type { WebDevSourceHealth } from "../src/ventures/webdev-signal/sources/collect.js";

function metrics(over: Partial<WebDevSelectionMetrics> = {}): WebDevSelectionMetrics {
  return {
    schemaVersion: "webdev-selection-metrics/1",
    fetchedCandidates: 40,
    prefilterDrops: 12,
    dropCounts: {},
    exactClusters: 3,
    fuzzyClusters: 1,
    conflicts: 0,
    canonicalRecords: 20,
    eligible: 6,
    scored: 6,
    outcome: "selected",
    reason: "One material change crossed the threshold.",
    goviralStatus: "unavailable",
    cacheReused: 8,
    callsAvoided: 2,
    networkCalls: 0,
    modelCalls: 0,
    providerCostUsd: 0,
    ...over
  } as WebDevSelectionMetrics;
}

function health(over: Partial<WebDevSourceHealth> = {}): WebDevSourceHealth {
  return {
    schemaVersion: "webdev-source-health/1",
    sourceId: "chrome-release-notes",
    configuredState: "enabled",
    runtimeState: "healthy",
    lastAttemptAt: "2026-08-12T05:00:00.000Z",
    lastSuccessAt: "2026-08-12T05:00:00.000Z",
    lastNonEmptySuccessAt: "2026-08-12T05:00:00.000Z",
    itemsFetched: 10,
    itemsKept: 4,
    malformedItems: 0,
    filteredItems: 6,
    consecutiveFailures: 0,
    layoutFingerprint: "a".repeat(64),
    layoutChanged: false,
    retryAfterAt: null,
    reason: "Fetched and parsed.",
    verificationDueAt: "2026-09-12",
    requestCount: 1,
    modelCalls: 0,
    ...over
  } as WebDevSourceHealth;
}

const BOTH_VALID: WebDevEditionObservationInput[] = [
  { locale: "cs", state: "valid", claimParity: "pass", accessibility: "pass", renderState: "rendered", deliveryState: "held" },
  { locale: "en", state: "valid", claimParity: "pass", accessibility: "pass", renderState: "rendered", deliveryState: "held" }
];

function observationFor(date: string, over: Parameters<typeof buildWebDevObservation>[0] extends infer T ? Partial<T> : never = {}) {
  return buildWebDevObservation({
    date,
    now: `${date}T06:00:00.000Z`,
    provenance: "fixture",
    metrics: metrics(),
    health: [health()],
    editions: BOTH_VALID,
    scoreMargin: 0.2,
    confidence: 0.8,
    ...over
  });
}

/**
 * The rule everything here follows is that a missing number stays missing. NO_EDITION is the
 * product working, and a baseline that averaged it into a publish rate would manufacture a
 * decline the venture never had.
 */
describe("a WebDev Signal day's observation", () => {
  it("references the canonical records rather than copying them", () => {
    const observation = observationFor("2026-08-12", {
      refs: {
        runRef: "state/ventures/webdev-signal/runs/2026-08-12.json",
        selectionRef: "state/ventures/webdev-signal/selections/2026-08-12.json",
        evidenceBriefRef: "state/ventures/webdev-signal/briefs/2026-08-12.json",
        packageRefs: ["state/ventures/webdev-signal/packages/2026-08-12-cs.json"],
        renderReceiptRefs: [],
        profileRefs: [],
        sourceHealthRefs: []
      }
    });

    expect(observation.refs.runRef).toContain("runs/2026-08-12");
    expect(observation.candidates.fetched).toBe(40);
    expect(observation.candidates.afterPrefilter).toBe(28);
    expect(observation.candidates.duplicatesCollapsed).toBe(4);
    // The hash covers the record, so two builds of the same day agree and a changed day does not.
    expect(observation.snapshotHash).toHaveLength(64);
    expect(observationFor("2026-08-12").snapshotHash).not.toBe(observation.snapshotHash);
  });

  it("marks a NO_EDITION day's audience windows unavailable rather than zero", () => {
    const observation = observationFor("2026-08-13", {
      metrics: metrics({ outcome: "NO_EDITION", reason: "No candidate crossed the threshold.", eligible: 0 }),
      editions: [],
      scoreMargin: null,
      confidence: null
    });

    expect(observation.decision.outcome).toBe("NO_EDITION");
    expect(observation.decision.scoreMargin).toEqual({ value: null, unavailableReason: "no-edition-day" });
    for (const window of observation.outcomes) {
      expect(window.reach.value).toBeNull();
      expect(window.reach.unavailableReason).toBe("no-edition-day");
    }
  });

  it("says a day that never ran did not run, which is not the same as finding nothing", () => {
    const observation = observationFor("2026-08-14", { metrics: null, editions: [] });

    expect(observation.decision.outcome).toBe("not-run");
    expect(observation.decision.reason).toContain("did not run");
  });
});

describe("the 28-day baseline", () => {
  function windowOf(days: number, selectedDays: number) {
    return Array.from({ length: days }, (_, index) => {
      const date = `2026-08-${String(index + 1).padStart(2, "0")}`;
      return index < selectedDays
        ? observationFor(date)
        : observationFor(date, {
            metrics: metrics({ outcome: "NO_EDITION", reason: "No candidate crossed the threshold.", eligible: 0 }),
            editions: [],
            scoreMargin: null,
            confidence: null
          });
    });
  }

  it("refuses a verdict until the window is actually full", () => {
    const baseline = buildWebDevBaseline({
      observations: windowOf(10, 6),
      startsOn: "2026-08-01",
      endsOn: "2026-08-28"
    });

    expect(baseline.verdict).toBe("INSUFFICIENT_DATA");
    expect(baseline.verdictReason).toContain("10 scanned days of 28");
  });

  it("gives each rate the denominator that belongs to it", () => {
    const baseline = buildWebDevBaseline({
      observations: windowOf(28, 20),
      startsOn: "2026-08-01",
      endsOn: "2026-08-28"
    });

    expect(baseline.verdict).toBe("CONTINUE");
    // Eligible-story rate is over scanned days.
    expect(baseline.editorial.eligibleStoryRate).toMatchObject({ numerator: 20, denominator: 28 });
    // Parity is over judged editions, so the eight NO_EDITION days are not in it.
    expect(baseline.editionQuality.claimParityRate.denominator).toBe(40);
    // Publish reliability is over editions that were valid, never over days.
    expect(baseline.publishing.verifiedPublishRate.denominator).toBe(40);
    expect(baseline.publishing.verifiedPublishRate.rate).toBe(0);
  });

  it("reports no rate at all when nothing was tried", () => {
    const baseline = buildWebDevBaseline({
      observations: windowOf(28, 0),
      startsOn: "2026-08-01",
      endsOn: "2026-08-28"
    });

    // Zero would say every edition failed to publish. None was ever offered.
    expect(baseline.editionQuality.claimParityRate.rate).toBeNull();
    expect(baseline.publishing.costPerAcceptedEditionUsd).toEqual({ value: null, unavailableReason: "denominator-empty" });
    expect(baseline.verdict).toBe("PAUSE");
  });

  it("calls a window with a factual incident NARROW rather than CONTINUE", () => {
    const observations = windowOf(28, 20);
    observations[0] = observationFor("2026-08-01", { corrections: { factualIncidents: 1 } });

    const baseline = buildWebDevBaseline({ observations, startsOn: "2026-08-01", endsOn: "2026-08-28" });

    expect(baseline.verdict).toBe("NARROW");
    expect(baseline.editorial.factualIncidents).toBe(1);
  });
});

describe("the bounded weekly evaluator", () => {
  const full = Array.from({ length: 28 }, (_, index) =>
    observationFor(`2026-08-${String(index + 1).padStart(2, "0")}`));

  it("proposes nothing while the window is short", () => {
    const baseline = buildWebDevBaseline({ observations: full.slice(0, 5), startsOn: "2026-08-01", endsOn: "2026-08-28" });

    const run = evaluateWebDevLearning({ baseline, date: "2026-08-28", observations: full.slice(0, 5) });

    expect(run.proposals).toEqual([]);
    expect(run.reason).toContain("of 28");
  });

  it("narrows an optional input on its own, and only ever downward", () => {
    const observations = full.map((entry) => ({ ...entry, goviral: { status: "used" as const, changedWinner: false } }));
    const baseline = buildWebDevBaseline({ observations, startsOn: "2026-08-01", endsOn: "2026-08-28" });

    const run = evaluateWebDevLearning({ baseline, date: "2026-08-28", observations });

    const overlay = run.proposals.find(({ knob }) => knob === "goviral-momentum-cap-downward");
    expect(overlay?.disposition).toBe("applied");
    // Everything else waits for a person.
    for (const proposal of run.proposals.filter(({ knob }) => knob !== "goviral-momentum-cap-downward")) {
      expect(proposal.disposition).toBe("proposed");
    }
  });

  /*
   * The list is the wall.
   *
   * Every knob on it is a preference between things already permitted — which source to prefer
   * *within* an authority class, how long a topic waits before it can repeat. What must never
   * appear is a knob that grants something: making a secondary source authoritative, lowering the
   * selection threshold, widening a budget or a scope. That matters most precisely when the
   * evidence argues for it, because a learning loop's evidence is exactly the evidence that would.
   */
  it("can only turn knobs between things already permitted", () => {
    expect([...WEBDEV_LEARNABLE_KNOBS]).toEqual([
      "source-priority-within-authority-class",
      "duplicate-cooldown-weight",
      "topic-cooldown-weight",
      "project-cooldown-weight",
      "presentation-prior",
      "timing-prior",
      "reserve-template-preference",
      "goviral-momentum-cap-downward",
      "source-reaudit-recommendation",
      "cache-reuse-opportunity"
    ]);

    // The knob that touches source authority reorders inside a class; it cannot promote one into
    // a class, which is the distinction the issue draws and the one worth pinning.
    expect(WEBDEV_LEARNABLE_KNOBS).toContain("source-priority-within-authority-class");
    expect(WEBDEV_LEARNABLE_KNOBS as readonly string[]).not.toContain("source-authority-class");

    // The GoVIRAL cap may only ever be lowered, so its name carries the direction.
    const overlay = WEBDEV_LEARNABLE_KNOBS.filter((knob) => knob.startsWith("goviral-"));
    expect(overlay).toEqual(["goviral-momentum-cap-downward"]);
  });
});

describe("the observation store", () => {
  it("drops one unreadable day and keeps the rest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "webdev-observations-"));
    await writeWebDevObservation(root, observationFor("2026-08-12"));
    await writeWebDevObservation(root, observationFor("2026-08-13"));
    await mkdir(path.join(root, "ventures/webdev-signal/observations"), { recursive: true });
    await writeFile(path.join(root, "ventures/webdev-signal/observations/2026-08-14.json"), "{ not json", "utf8");

    const read = await readWebDevObservations(root);

    expect(read.observations.map(({ date }) => date)).toEqual(["2026-08-12", "2026-08-13"]);
    // A baseline that refused to build because one day is corrupt would say nothing about 27 good ones.
    expect(read.dropped).toBe(1);
  });

  it("has nothing to read before the first day, without failing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "webdev-observations-empty-"));

    expect(await readWebDevObservations(root)).toEqual({ observations: [], dropped: 0 });
  });
});
