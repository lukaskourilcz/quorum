import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgentAvatars } from "../src/brand/avatars.js";
import {
  FOUNDING_AGENT_IDS,
  loadAgentRegistry
} from "../src/org/registry.js";
import { configRoot } from "../src/paths.js";

describe("agent registry and identity assets", () => {
  it("keeps 30 seated roles of 40 on file, and gated portraits explicit", async () => {
    const registry = await loadAgentRegistry();

    // Forty profiles, thirty of them seated. A retired or paused agent keeps its profile and its
    // portrait -- the record of who did what does not shrink when the roster does -- and the
    // router skips it and says so rather than crashing the room it was required in.
    expect(registry.agents.map((agent) => agent.id)).toEqual(FOUNDING_AGENT_IDS);
    expect(new Set(registry.agents.map((agent) => agent.slug)).size).toBe(40);
    expect(registry.agents.filter((agent) => agent.kind === "council")).toHaveLength(4);
    expect(registry.agents.filter((agent) => agent.status === "active")).toHaveLength(30);
    expect(registry.agents.filter((agent) => agent.status === "retired").map((agent) => agent.id).sort())
      .toEqual(["EASEL", "MOTIF", "SPLIT"]);
    expect(registry.agents.filter((agent) => agent.status === "paused").map((agent) => agent.id).sort())
      .toEqual(["FUNNEL", "INSTAGRAM", "LENS", "RADAR", "SCOUT", "SCRIBE", "THREADS"]);
    expect(registry.agents.filter((agent) => agent.status === "proposed")).toHaveLength(0);
    expect(registry.agents.filter((agent) => agent.provider === "OpenAI")).toHaveLength(
      19
    );
    expect(
      registry.agents.filter((agent) => agent.provider === "Anthropic")
    ).toHaveLength(21);
    expect(
      registry.agents.filter((agent) => agent.ventures !== "global").map((agent) => [agent.id, agent.ventures])
    ).toEqual([
      ["HERALD", ["caught-up"]],
      ["HACEK", ["caught-up", "mma-files"]],
      ["SCENE", ["titty-tuesdays"]],
      ["STUNT", ["titty-tuesdays"]],
      ["CORNER", ["fightaiq"]],
      ["SPOTTER", ["fightaiq"]],
      ["TAPE", ["fightaiq", "mma-files"]],
      ["SIGMA", ["fightaiq"]],
      ["VIG", ["fightaiq"]],
      ["SONAR", ["fightaiq"]],
      ["CANVAS", ["mma-files"]],
      ["JAB", ["mma-files"]],
      ["REACH", ["mma-files"]],
      ["SPLIT", ["mma-files"]],
      ["EASEL", ["carousel-studio"]],
      ["MOTIF", ["carousel-studio"]],
      ["PIVOT", ["fightaiq", "mma-files"]]
    ]);

    const kpiConfig = JSON.parse(
      await readFile(path.join(configRoot, "kpis.json"), "utf8")
    ) as { kpis: Array<{ id: string }> };
    const kpiIds = new Set(kpiConfig.kpis.map(({ id }) => id));
    expect(
      registry.agents.flatMap((agent) => agent.ownedKpiIds).every((id) => kpiIds.has(id))
    ).toBe(true);
  });

  it("validates every optimized portrait and rejects duplicate content", async () => {
    const registry = await loadAgentRegistry();
    const avatars = await validateAgentAvatars(registry);

    expect(avatars).toHaveLength(27);
    expect(registry.agents.filter((agent) => agent.visual.avatar === null).map((agent) => agent.id)).toEqual([
      "CORNER", "SPOTTER", "TAPE", "SIGMA", "VIG", "SONAR",
      "CANVAS", "JAB", "REACH", "SPLIT", "EASEL", "MOTIF", "PIVOT"
    ]);
    expect(new Set(avatars.map((avatar) => avatar.sha256)).size).toBe(27);
    expect(avatars.every((avatar) => avatar.width === 1024)).toBe(true);
    expect(avatars.every((avatar) => avatar.height === 1024)).toBe(true);
  });

  it("gives every agent a loadable persona prompt, because a live room now reads it", async () => {
    // portfolio/run.ts loads `orchestrator/prompts/<slug>.md` for each selected seat and
    // appends it after the packet. A missing or empty file would throw mid-room, after the
    // budget reservation and part-way through a paid call graph, so pin the coupling here.
    const registry = await loadAgentRegistry();
    const promptsRoot = path.join(configRoot, "..", "orchestrator", "prompts");

    const loaded = await Promise.all(
      registry.agents.map(async (agent) => {
        const body = await readFile(path.join(promptsRoot, `${agent.slug}.md`), "utf8");
        return { id: agent.id, body: body.trim() };
      })
    );

    expect(loaded).toHaveLength(40);
    expect(loaded.filter((entry) => entry.body.length === 0).map((entry) => entry.id)).toEqual([]);
    // Each persona rides on every call in its room; an unbounded file would silently
    // inflate every seat's input cost against a $0.05-$0.16 room envelope.
    expect(loaded.filter((entry) => entry.body.length > 4000).map((entry) => entry.id)).toEqual([]);
  });

  it("keeps every KPI id a prompt states in step with config/agents.json", async () => {
    // agents.test.ts already checks ownedKpiIds against kpis.json, but that is config
    // against config and never opens the prompt markdown. That gap is why audit.md shipped
    // `audit.release_success` (an id that has never existed) while omitting three ids AUDIT
    // does own, and why forge.md and pulse.md drifted the same way. Now that run.ts loads
    // every persona into live rooms, a wrong id here is a claim the model acts on.
    const registry = await loadAgentRegistry();
    const promptsRoot = path.join(configRoot, "..", "orchestrator", "prompts");
    const kpiConfig = JSON.parse(
      await readFile(path.join(configRoot, "kpis.json"), "utf8")
    ) as { kpis: Array<{ id: string }> };
    const kpiIds = new Set(kpiConfig.kpis.map(({ id }) => id));

    const drift: string[] = [];
    for (const agent of registry.agents) {
      const body = await readFile(path.join(promptsRoot, `${agent.slug}.md`), "utf8");
      // Backticked dotted tokens are how every prompt writes a KPI id.
      const claimed = [
        ...new Set((body.match(/`[a-z][a-z0-9_]*\.[a-z0-9_]+`/gu) ?? []).map((token) => token.slice(1, -1)))
      ];
      if (claimed.length === 0) continue;

      const owned = new Set(agent.ownedKpiIds);
      for (const id of claimed.filter((candidate) => !kpiIds.has(candidate))) {
        drift.push(`${agent.slug}.md states ${id}, which is not a KPI in config/kpis.json`);
      }
      for (const id of claimed.filter((candidate) => kpiIds.has(candidate) && !owned.has(candidate))) {
        drift.push(`${agent.slug}.md claims ${id}, which ${agent.id} does not own`);
      }
      for (const id of agent.ownedKpiIds.filter((candidate) => !claimed.includes(candidate))) {
        drift.push(`${agent.slug}.md omits ${id}, which ${agent.id} owns`);
      }
    }

    expect(drift).toEqual([]);
  });

  it("keeps the shared preamble's specialist count equal to the registry", async () => {
    // _shared.md opened with "Thirty-four non-voting specialists" while the registry held
    // 36 and its roster sentence named 23. Nothing compared the two.
    const registry = await loadAgentRegistry();
    const shared = await readFile(
      path.join(configRoot, "..", "orchestrator", "prompts", "_shared.md"),
      "utf8"
    );
    const specialists = registry.agents.filter((agent) => agent.kind !== "council");

    // The sentence counts the specialists a room can actually seat, so a paused or retired one is
    // not in it. The ten that are not seated are named separately, so a seat cannot quietly go
    // missing from both.
    const seated = specialists.filter((agent) => agent.status === "active");
    const words: Record<number, string> = {
      24: "Twenty-four", 25: "Twenty-five", 26: "Twenty-six", 27: "Twenty-seven",
      28: "Twenty-eight", 33: "Thirty-three", 34: "Thirty-four", 35: "Thirty-five",
      36: "Thirty-six", 37: "Thirty-seven", 38: "Thirty-eight"
    };
    const stated = words[seated.length];
    expect(stated, `no spelled-out form for ${seated.length} seated specialists`).toBeDefined();
    expect(shared).toContain(`${stated} non-voting specialists`);
    for (const agent of specialists.filter((entry) => entry.status !== "active")) {
      expect(shared, `${agent.id} is off the roster and unnamed in the preamble`).toContain(agent.id);
    }
  });
});
