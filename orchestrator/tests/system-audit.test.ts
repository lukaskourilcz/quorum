import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..");

async function json<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot, relative), "utf8")) as T;
}

describe("closing 40-agent system audit", () => {
  it("keeps every active identity unique, prompt-backed and routable", async () => {
    const registry = await json<{ agents: Array<{ id: string; slug: string; mission: string; status: string; provider: string; notResponsibleFor: string[] }> }>("config/agents.json");
    const routing = await json<{ agents: Record<string, { capabilities: string[]; status: string }> }>("config/agent-routing.json");
    expect(registry.agents).toHaveLength(40);
    expect(new Set(registry.agents.map((agent) => agent.id)).size).toBe(40);
    expect(new Set(registry.agents.map((agent) => agent.mission)).size).toBe(40);
    expect(new Set(Object.keys(routing.agents))).toEqual(new Set(registry.agents.map((agent) => agent.id)));
    for (const agent of registry.agents) {
      expect(agent.status).toBe("active");
      expect(agent.notResponsibleFor.length).toBeGreaterThan(0);
      expect(routing.agents[agent.id]?.capabilities.length).toBeGreaterThan(0);
      await expect(access(path.join(repoRoot, "orchestrator", "prompts", `${agent.slug}.md`))).resolves.toBeUndefined();
    }
  });

  it("keeps the disabled social roles current and measurement closed", async () => {
    const controls = await json<{ ventures: Record<string, { disabled: string[] }> }>("config/venture-agent-controls.json");
    const features = await json<{ METRICS_INGESTION_ENABLED: boolean }>("config/features.json");
    expect(controls.ventures["caught-up"]?.disabled).toEqual(expect.arrayContaining(["THREADS", "INSTAGRAM"]));
    expect(controls.ventures["mma-files"]?.disabled).toEqual(expect.arrayContaining(["REACH", "SPLIT"]));
    expect(features.METRICS_INGESTION_ENABLED).toBe(false);
    for (const prompt of ["threads.md", "instagram.md", "reach.md"]) {
      const source = await readFile(path.join(repoRoot, "orchestrator", "prompts", prompt), "utf8");
      expect(source).toContain("template_id");
      expect(source).toContain("version");
      expect(source).toContain("content");
    }
  });

  it("keeps all room envelopes inside the signed daily pace", async () => {
    const registry = await json<{ ventures: Array<{ meetings: Array<{ envelopeUsd: number }> }> }>("config/ventures.json");
    const roomEnvelopes = registry.ventures.flatMap((venture) => venture.meetings).reduce((sum, meeting) => sum + meeting.envelopeUsd, 0);
    const maximumArticleProduction = 0.35 * 2;
    const morningCycleCap = 0.2;
    expect(roomEnvelopes).toBeCloseTo(0.64, 8);
    expect(roomEnvelopes + maximumArticleProduction + morningCycleCap).toBeLessThanOrEqual(2.2);
  });

  it("keeps Carousel Studio free of provider SDKs and external template assets", async () => {
    const files = (await readdir(path.join(repoRoot, "studio", "src"), { recursive: true }))
      .filter((entry) => entry.endsWith(".ts"));
    const source = (await Promise.all(files.map((file) => readFile(path.join(repoRoot, "studio", "src", file), "utf8")))).join("\n");
    expect(source).not.toMatch(/@anthropic-ai|\bopenai\b|imagegen|https?:\/\/.+\.(?:png|jpe?g|webp)/i);
  });
});
