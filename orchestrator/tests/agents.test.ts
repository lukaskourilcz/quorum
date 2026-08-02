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
  it("contains 40 active roles and keeps gated portraits explicit", async () => {
    const registry = await loadAgentRegistry();

    expect(registry.agents.map((agent) => agent.id)).toEqual(FOUNDING_AGENT_IDS);
    expect(new Set(registry.agents.map((agent) => agent.slug)).size).toBe(40);
    expect(registry.agents.filter((agent) => agent.kind === "council")).toHaveLength(4);
    expect(registry.agents.filter((agent) => agent.status === "active")).toHaveLength(40);
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
});
