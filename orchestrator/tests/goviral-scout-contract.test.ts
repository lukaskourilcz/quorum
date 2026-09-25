import { afterEach, describe, expect, it, vi } from "vitest";
import * as apify from "../src/sources/apify.js";
import { mapDatasetRow, runRecipeStep, stepPayload, stepTopicSets } from "../src/sources/goviral-scout.js";
import { loadVentureRegistry, pausedVentureIds } from "../src/ventures/registry.js";

afterEach(() => vi.restoreAllMocks());

describe("GoVIRAL provider contracts", () => {
  it("uses the Instagram search actor's actual input names and types", async () => {
    const registry = await apify.loadGoViralSourceRegistry();
    const step = registry.recipe[0]!;
    expect(stepPayload({ registry, step, topicSet: "mma" })).toEqual({
      search: "UFC, Oktagon MMA, fight week",
      searchType: "popular",
      searchLimit: 64,
      enhanceUserSearchWithFacebookPage: false
    });
  });

  it("keeps the result and charge allowance shared across topic sets", async () => {
    const registry = await apify.loadGoViralSourceRegistry();
    const step = { ...registry.recipe[0]!, maxResults: 6 };
    const actor = registry.actors.find((entry) => entry.id === step.actorId)!;
    const runner = vi.spyOn(apify, "runApifyActor").mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ caption: `post ${i}` }))
    );
    const outcome = await runRecipeStep({ registry, step, actor, token: "fixture" });
    expect(outcome.count).toBeLessThanOrEqual(6);
    expect(runner.mock.calls.length).toBeGreaterThan(1);
    const reserved = runner.mock.calls.reduce((sum, [call]) => sum + call.maxTotalChargeUsd!, 0);
    expect(reserved).toBeCloseTo(apify.estimateActorUsd(actor, 6));
    expect(outcome.estimatedUsd).toBeLessThanOrEqual(reserved + 0.000001);
  });

  it("retains the full reservation on failed requests", async () => {
    const registry = await apify.loadGoViralSourceRegistry();
    const step = registry.recipe[0]!;
    const actor = registry.actors.find((entry) => entry.id === step.actorId)!;
    vi.spyOn(apify, "runApifyActor").mockRejectedValue(new Error("timeout"));
    const outcome = await runRecipeStep({ registry, step, actor, token: "fixture" });
    expect(outcome.count).toBe(0);
    expect(outcome.failure).toContain("billing is unknown");
    expect(outcome.estimatedUsd).toBeCloseTo(apify.estimateActorUsd(actor, step.maxResults));
  });

  it("preserves Threads snake-case engagement and publication timestamps", async () => {
    const registry = await apify.loadGoViralSourceRegistry();
    const step = registry.recipe.find((entry) => entry.mode === "search-top")!;
    expect(mapDatasetRow({ step, topicSet: "mma", row: {
      text: "A sourced post", like_count: 12, reply_count: 3, repost_count: 2,
      posted_at: "2026-09-07T06:00:00Z"
    } })).toMatchObject({ likes: 12, comments: 3, reshares: 2, postedAt: "2026-09-07T06:00:00.000Z" });
  });
});

it("spends discovery allowance only on the three launch products", async () => {
  const registry = await apify.loadGoViralSourceRegistry();
  expect(stepTopicSets(registry.recipe[0]!, registry).sort()).toEqual(["devshark", "dneskai", "mma"]);
});

describe("topic sets follow the venture registry (operations-2026-09b)", () => {
  it("names a registered venture, or the owner, for every set", async () => {
    const [registry, ventures] = await Promise.all([apify.loadGoViralSourceRegistry(), loadVentureRegistry()]);
    const ids = new Set(ventures.ventures.map(({ id }) => id));
    const unknown = Object.entries(registry.topicSets)
      .filter(([, set]) => set.ventureId !== apify.OWNER_TOPIC_SET_VENTURE && !ids.has(set.ventureId))
      .map(([id, set]) => `${id}->${set.ventureId}`);
    expect(unknown).toEqual([]);
    expect(registry.topicSets.devshark?.ventureId).toBe("marketingshark");
    expect(registry.topicSets.dneskai?.ventureId).toBe("caught-up");
  });

  it("drops every set whose venture is paused, so paid steps scout DNESKAi and devShark only", async () => {
    const [registry, ventures] = await Promise.all([apify.loadGoViralSourceRegistry(), loadVentureRegistry()]);
    const running = apify.runningTopicSets(registry, pausedVentureIds(ventures));
    expect(Object.keys(running.topicSets).sort()).toEqual(["devshark", "dneskai", "writer"]);
    for (const step of running.recipe) {
      for (const topicSet of stepTopicSets(step, running)) {
        expect(["devshark", "dneskai", null]).toContain(topicSet);
      }
    }
  });

  it("brings a set back when its venture resumes, without a second list", async () => {
    const registry = await apify.loadGoViralSourceRegistry();
    const running = apify.runningTopicSets(registry, new Set(["caught-up"]));
    expect(Object.keys(running.topicSets)).not.toContain("dneskai");
    expect(Object.keys(running.topicSets)).toContain("mma");
    expect(Object.keys(apify.runningTopicSets(registry, new Set()).topicSets)).toHaveLength(8);
  });
});
