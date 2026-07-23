import { describe, expect, it } from "vitest";
import { validateAgentAvatars } from "../src/brand/avatars.js";
import {
  FOUNDING_AGENT_IDS,
  loadAgentRegistry
} from "../src/org/registry.js";

describe("agent registry and identity assets", () => {
  it("contains exactly the 14 founding roles with stable identities", async () => {
    const registry = await loadAgentRegistry();

    expect(registry.agents.map((agent) => agent.id)).toEqual(FOUNDING_AGENT_IDS);
    expect(new Set(registry.agents.map((agent) => agent.slug)).size).toBe(14);
    expect(registry.agents.filter((agent) => agent.kind === "council")).toHaveLength(4);
    expect(registry.agents.every((agent) => agent.status === "active")).toBe(true);
  });

  it("validates every optimized portrait and rejects duplicate content", async () => {
    const registry = await loadAgentRegistry();
    const avatars = await validateAgentAvatars(registry);

    expect(avatars).toHaveLength(14);
    expect(new Set(avatars.map((avatar) => avatar.sha256)).size).toBe(14);
    expect(avatars.every((avatar) => avatar.width === 1024)).toBe(true);
    expect(avatars.every((avatar) => avatar.height === 1024)).toBe(true);
  });
});
