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
  it("contains 27 active roles with complete portfolio portraits", async () => {
    const registry = await loadAgentRegistry();

    expect(registry.agents.map((agent) => agent.id)).toEqual(FOUNDING_AGENT_IDS);
    expect(new Set(registry.agents.map((agent) => agent.slug)).size).toBe(27);
    expect(registry.agents.filter((agent) => agent.kind === "council")).toHaveLength(4);
    expect(registry.agents.filter((agent) => agent.status === "active")).toHaveLength(27);
    expect(registry.agents.filter((agent) => agent.status === "proposed")).toHaveLength(0);
    expect(registry.agents.filter((agent) => agent.provider === "OpenAI")).toHaveLength(
      13
    );
    expect(
      registry.agents.filter((agent) => agent.provider === "Anthropic")
    ).toHaveLength(14);
    expect(
      registry.agents.filter((agent) => agent.ventures !== "global").map((agent) => [agent.id, agent.ventures])
    ).toEqual([
      ["HERALD", ["caught-up"]],
      ["HACEK", ["caught-up"]],
      ["SCENE", ["titty-tuesdays"]],
      ["STUNT", ["titty-tuesdays"]]
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
    expect(new Set(avatars.map((avatar) => avatar.sha256)).size).toBe(27);
    expect(avatars.every((avatar) => avatar.width === 1024)).toBe(true);
    expect(avatars.every((avatar) => avatar.height === 1024)).toBe(true);
  });
});
