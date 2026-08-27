import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  applyPersonalGrowthAdminAction,
  parsePersonalGrowthAdminAction
} from "./personal-growth-admin-store";

async function rootWithPlanner(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "personal-growth-admin-store-"));
  await mkdir(path.join(root, "config"), { recursive: true });
  await writeFile(
    path.join(root, "config", "personal-growth-planner.json"),
    await readFile(path.resolve(process.cwd(), "..", "config", "personal-growth-planner.json"))
  );
  return root;
}

async function rootWithAdminConfigs(): Promise<string> {
  const root = await rootWithPlanner();
  const repositoryRoot = path.resolve(process.cwd(), "..");
  for (const file of ["personal-growth.json", "personal-growth-content.json"]) {
    await writeFile(path.join(root, "config", file), await readFile(path.join(repositoryRoot, "config", file)));
  }
  await mkdir(path.join(root, "state/ventures/personal-growth"), { recursive: true });
  await writeFile(
    path.join(root, "state/ventures/personal-growth/experiments.json"),
    await readFile(path.join(repositoryRoot, "state/ventures/personal-growth/experiments.json"))
  );
  return root;
}

afterEach(() => vi.unstubAllEnvs());

describe("Personal Growth Admin writes", () => {
  it("updates an anchor while preserving the prior date and correction reason", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const root = await rootWithPlanner();
    const action = { type: "anchor", lane: "okraj", date: "2026-09-01", reason: "Owner corrected the first due date." };
    const first = await applyPersonalGrowthAdminAction(action, { root, now: new Date("2026-08-27T10:00:00.000Z") });
    const second = await applyPersonalGrowthAdminAction(action, { root, now: new Date("2026-08-27T10:01:00.000Z") });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    const planner = JSON.parse(await readFile(path.join(root, "config", "personal-growth-planner.json"), "utf8")) as { lanes: Array<{ lane: string; recurrenceAnchorDate: string }> };
    expect(planner.lanes.find(({ lane }) => lane === "okraj")?.recurrenceAnchorDate).toBe("2026-09-01");
    const history = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/admin/anchor-history.json"), "utf8")) as { revisions: Array<Record<string, unknown>> };
    expect(history.revisions).toEqual([expect.objectContaining({
      lane: "okraj",
      previousDate: "2026-08-27",
      nextDate: "2026-09-01",
      reason: "Owner corrected the first due date."
    })]);
  });

  it("appends timeline corrections and bounded Threads decisions without publishing", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const root = await rootWithPlanner();
    const timeline = {
      type: "timeline",
      lane: "bbarak",
      occurrenceDate: "2026-08-27",
      operation: "rescheduled",
      reason: "The owner moved the writing window.",
      rescheduledTo: "2026-08-29",
      finalUrl: null,
      collaborationUrl: null
    };
    const decision = {
      type: "thread",
      suggestionId: "pg-thread-1111111111111111",
      operation: "posted",
      reason: "Recorded after the owner posted manually.",
      postUrl: "https://www.threads.net/@owner/post/example"
    };
    await expect(applyPersonalGrowthAdminAction(timeline, { root, now: new Date("2026-08-27T11:00:00.000Z") })).resolves.toMatchObject({ changed: true });
    await expect(applyPersonalGrowthAdminAction(timeline, { root, now: new Date("2026-08-27T11:01:00.000Z") })).resolves.toMatchObject({ changed: false });
    await expect(applyPersonalGrowthAdminAction(decision, { root, now: new Date("2026-08-27T11:02:00.000Z") })).resolves.toMatchObject({ changed: true });
    const history = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/history.json"), "utf8")) as { events: Array<Record<string, unknown>> };
    const reasons = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/admin/timeline-reasons.json"), "utf8")) as { reasons: Array<Record<string, unknown>> };
    const decisions = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/admin/thread-decisions.json"), "utf8")) as { decisions: Array<Record<string, unknown>> };
    expect(history.events).toHaveLength(1);
    expect(reasons.reasons).toEqual([expect.objectContaining({ reason: timeline.reason })]);
    expect(decisions.decisions).toEqual([expect.objectContaining({ action: "posted", postUrl: decision.postUrl })]);
  });

  it("rejects extra authority, malformed URLs and unbounded action names", () => {
    for (const operation of ["approved", "rejected", "snoozed", "posted"]) {
      expect(parsePersonalGrowthAdminAction({
        type: "thread",
        suggestionId: "pg-thread-1111111111111111",
        operation,
        reason: operation === "posted" ? "Recorded after manual posting." : null,
        postUrl: operation === "posted" ? "https://www.threads.net/@owner/post/example" : null
      })).toMatchObject({ operation });
    }
    expect(parsePersonalGrowthAdminAction({ type: "thread", suggestionId: "pg-thread-1111111111111111", operation: "publish", reason: null, postUrl: null })).toBeNull();
    expect(parsePersonalGrowthAdminAction({ type: "thread", suggestionId: "pg-thread-1111111111111111", operation: "approved", reason: null, postUrl: null, publish: true })).toBeNull();
    expect(parsePersonalGrowthAdminAction({ type: "anchor", lane: "okraj", date: "2026-99-99", reason: "bad" })).toBeNull();
    expect(parsePersonalGrowthAdminAction({ type: "timeline", lane: "bbarak", occurrenceDate: "2026-08-27", operation: "completed", reason: "done", rescheduledTo: null, finalUrl: "http://unsafe.test", collaborationUrl: null })).toBeNull();
    expect(parsePersonalGrowthAdminAction({ type: "budget-mode", mode: "unlimited", reason: "raise cap" })).toBeNull();
    expect(parsePersonalGrowthAdminAction({ type: "capability-enable", capability: "publishing", reason: "publish" })).toBeNull();
  });

  it("creates a bounded manual result and appends corrections without replacing observations", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const root = await rootWithAdminConfigs();
    const create = {
      type: "result-create",
      platform: "instagram",
      nativePostId: "owner-post-1",
      url: "https://www.instagram.com/p/owner-post-1/",
      publishedAt: "2026-08-26T20:00:00.000Z",
      format: "photo",
      language: "cs",
      personalPillar: "life-lifestyle",
      contentOrigin: "owner-current-life",
      collaborator: null,
      publicationRelation: null,
      reelSeries: null,
      goviralSignalId: null,
      manualReference: null,
      experimentId: null,
      ownerEvidenceRef: "owner-result:owner-post-1",
      ownerRating: 4,
      ownerNote: "Initial owner note."
    };
    const created = await applyPersonalGrowthAdminAction(create, { root, now: new Date("2026-08-27T10:00:00.000Z") });
    const resultPath = path.join(root, `state/ventures/personal-growth/results/${created.id}.json`);
    const withObservation = JSON.parse(await readFile(resultPath, "utf8")) as Record<string, unknown>;
    withObservation.observations = [{ observationId: "immutable-provider-snapshot" }];
    await writeFile(resultPath, `${JSON.stringify(withObservation, null, 2)}\n`);
    const correction = {
      type: "result-correction",
      resultId: created.id,
      reason: "Owner corrected the rating after review.",
      evidenceRef: "owner-correction:owner-post-1",
      ownerRating: 5,
      ownerNote: "Corrected note."
    };
    const corrected = await applyPersonalGrowthAdminAction(correction, { root, now: new Date("2026-08-27T11:00:00.000Z") });
    await expect(applyPersonalGrowthAdminAction(correction, { root, now: new Date("2026-08-27T11:05:00.000Z") })).resolves.toMatchObject({ changed: false });
    const result = JSON.parse(await readFile(resultPath, "utf8")) as { observations: unknown[]; corrections: unknown[]; ownerRating: number };
    expect(corrected.changed).toBe(true);
    expect(result.observations).toEqual([{ observationId: "immutable-provider-snapshot" }]);
    expect(result.corrections).toHaveLength(1);
    expect(result.ownerRating).toBe(5);
    expect(parsePersonalGrowthAdminAction({ ...create, automaticPortfolioItemId: "portfolio-item-1" })).toBeNull();
    expect(parsePersonalGrowthAdminAction({
      ...create,
      contentOrigin: "owner-manual-venture-reference",
      manualReference: {
        sourceProject: "kvorum",
        publicItemId: "political-output",
        publicUrl: "https://example.test/political-output",
        ownerAuthored: true,
        personalConnection: null,
        ownerCommentaryNote: "Owner note."
      }
    })).toBeNull();
  });

  it("enforces the two-live-experiment ceiling and minimum-sample verdict", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const root = await rootWithAdminConfigs();
    const state = (experimentId: string) => ({ type: "experiment-state", experimentId, operation: "activate", note: "Owner starts the preregistered zero-cost test." });
    await applyPersonalGrowthAdminAction(state("pg-exp-trial-reel"), { root, now: new Date("2026-08-27T10:00:00.000Z") });
    await expect(applyPersonalGrowthAdminAction({ type: "experiment-verdict", experimentId: "pg-exp-trial-reel", verdict: "KEEP", note: "Not enough evidence yet." }, { root, now: new Date("2026-08-27T10:01:00.000Z") })).rejects.toMatchObject({ code: "REFUSED" });
    await expect(applyPersonalGrowthAdminAction({ type: "experiment-verdict", experimentId: "pg-exp-trial-reel", verdict: "INSUFFICIENT_DATA", note: "Keep collecting until minimum sample." }, { root, now: new Date("2026-08-27T10:02:00.000Z") })).resolves.toMatchObject({ changed: true });
    await applyPersonalGrowthAdminAction(state("pg-exp-threads-topic-tag"), { root, now: new Date("2026-08-27T10:03:00.000Z") });
    const third = await applyPersonalGrowthAdminAction({
      type: "experiment-create",
      changedVariable: "timing-window",
      hypothesis: "A bounded evening window improves valid reach.",
      primaryMetric: "reach",
      secondaryGuardrail: "No privacy, policy or quality regression.",
      startDate: "2026-08-28",
      minimumSample: 4,
      evaluationWindowDays: 28
    }, { root, now: new Date("2026-08-27T10:04:00.000Z") });
    await expect(applyPersonalGrowthAdminAction(state(third.id), { root, now: new Date("2026-08-27T10:05:00.000Z") })).rejects.toMatchObject({ code: "REFUSED" });
    const register = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/experiments.json"), "utf8")) as { experiments: Array<{ status: string }> };
    expect(register.experiments.filter(({ status }) => status === "active" || status === "review")).toHaveLength(2);
  });

  it("records bounded strategy revisions and only lowers budget authority", async () => {
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
    const root = await rootWithAdminConfigs();
    await applyPersonalGrowthAdminAction({ type: "strategy-pillar", pillar: "life-lifestyle", status: "paused", weight: 0.1, vetoes: ["No private locations."], reason: "Owner pauses this pillar temporarily." }, { root, now: new Date("2026-08-27T12:00:00.000Z") });
    await applyPersonalGrowthAdminAction({ type: "strategy-policy", personalFeedMinimum: 0.9, ventureLedMaximum: 0.1, ventureStoriesPerSevenDaysMaximum: 1, sameVentureCooldownDays: 14, reason: "Owner tightens the manual-reference allowance." }, { root, now: new Date("2026-08-27T12:01:00.000Z") });
    await applyPersonalGrowthAdminAction({ type: "strategy-settings", defaultLanguage: "cs", platformsUsed: ["instagram", "threads"], reason: "Owner confirms the platforms actually used." }, { root, now: new Date("2026-08-27T12:02:00.000Z") });
    await applyPersonalGrowthAdminAction({ type: "budget-mode", mode: "buffer", reason: "Owner selects the already-authorised Buffer allocation." }, { root, now: new Date("2026-08-27T12:03:00.000Z") });
    await applyPersonalGrowthAdminAction({ type: "capability-disable", capability: "insightsIngestion", reason: "Owner holds provider ingestion." }, { root, now: new Date("2026-08-27T12:04:00.000Z") });
    const content = JSON.parse(await readFile(path.join(root, "config/personal-growth-content.json"), "utf8")) as { policy: { currentRevision: number; revisions: unknown[] }; pillars: Array<{ pillar: string; status: string }> };
    const foundation = JSON.parse(await readFile(path.join(root, "config/personal-growth.json"), "utf8")) as { budget: { monthlyAllInUsd: number; activeMode: string }; featureGates: { insightsIngestion: boolean; publishing: boolean } };
    const history = JSON.parse(await readFile(path.join(root, "state/ventures/personal-growth/admin/strategy-history.json"), "utf8")) as { revisions: unknown[] };
    expect(content.policy).toMatchObject({ currentRevision: 1 });
    expect(content.policy.revisions).toHaveLength(2);
    expect(content.pillars.find(({ pillar }) => pillar === "life-lifestyle")?.status).toBe("paused");
    expect(history.revisions).toHaveLength(3);
    expect(foundation).toMatchObject({ budget: { monthlyAllInUsd: 20, activeMode: "buffer" }, featureGates: { insightsIngestion: false, publishing: false } });
  });
});
