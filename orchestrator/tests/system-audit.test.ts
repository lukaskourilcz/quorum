import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..");

async function json<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot, relative), "utf8")) as T;
}

describe("closing 44-agent system audit", () => {
  it("keeps every identity unique, prompt-backed and routable, seated or not", async () => {
    const registry = await json<{ agents: Array<{ id: string; slug: string; mission: string; status: string; provider: string; notResponsibleFor: string[] }> }>("config/agents.json");
    const routing = await json<{ agents: Record<string, { capabilities: string[]; status: string }> }>("config/agent-routing.json");
    expect(registry.agents).toHaveLength(44);
    expect(new Set(registry.agents.map((agent) => agent.id)).size).toBe(44);
    expect(new Set(registry.agents.map((agent) => agent.mission)).size).toBe(44);
    expect(new Set(Object.keys(routing.agents))).toEqual(new Set(registry.agents.map((agent) => agent.id)));
    // Forty-four profiles, thirty-five of them seated. A retired or paused agent keeps its
    // prompt, its portrait and its routing entry -- the record of who did what does not shrink
    // when the roster does -- and the two files have to agree about which of the three it is.
    expect(registry.agents.filter((agent) => agent.status === "active")).toHaveLength(35);
    for (const agent of registry.agents) {
      expect(["active", "paused", "retired"]).toContain(agent.status);
      expect(routing.agents[agent.id]?.status).toBe(agent.status);
      expect(agent.notResponsibleFor.length).toBeGreaterThan(0);
      expect(routing.agents[agent.id]?.capabilities.length).toBeGreaterThan(0);
      await expect(access(path.join(repoRoot, "orchestrator", "prompts", `${agent.slug}.md`))).resolves.toBeUndefined();
    }
  });

  it("keeps the disabled social roles current and measurement closed", async () => {
    const controls = await json<{ ventures: Record<string, { disabled: string[] }> }>("config/venture-agent-controls.json");
    const features = await json<{ METRICS_INGESTION_ENABLED: boolean }>("config/features.json");
    expect(controls.ventures["caught-up"]?.disabled).toEqual(expect.arrayContaining(["THREADS", "INSTAGRAM"]));
    // SPLIT is retired, so it is off every venture list rather than switched off inside one.
    expect(controls.ventures["mma-files"]?.disabled).toEqual(expect.arrayContaining(["REACH"]));
    expect(controls.ventures["mma-files"]?.disabled).not.toContain("SPLIT");
    expect(features.METRICS_INGESTION_ENABLED).toBe(false);
    for (const prompt of ["threads.md", "instagram.md", "reach.md"]) {
      const source = await readFile(path.join(repoRoot, "orchestrator", "prompts", prompt), "utf8");
      expect(source).toContain("template_id");
      expect(source).toContain("version");
      expect(source).toContain("content");
    }
  });

  it("keeps all room envelopes inside the signed daily pace", async () => {
    const registry = await json<{
      ventures: Array<{
        meetings: Array<{ kind: string; envelopeUsd: number }>;
        productionJobs?: Array<{ envelopeUsd: number }>;
      }>;
    }>("config/ventures.json");
    // ms-daily's envelope is per ENABLED BRAND, which its own registry comment says and run.ts
    // computes as `0.1 * brands.length`. Summing it as a flat scalar made the guard model a
    // cheaper clock than the one that can actually run: on the Phase-2 flag flip the real total
    // is 0.72 and a flat sum would still report 0.62 and pass.
    const marketingSharkBrands = JSON.parse(
      await readFile(path.join(repoRoot, "config", "marketingshark.json"), "utf8")
    ) as { brands: Array<{ enabled: boolean }> };
    const enabledBrands = marketingSharkBrands.brands.filter((brand) => brand.enabled).length;
    const roomEnvelopes = registry.ventures
      .flatMap((venture) => venture.meetings)
      .reduce((sum, meeting) => sum + meeting.envelopeUsd * (meeting.kind === "ms-daily" ? enabledBrands : 1), 0);
    // Read from the registry rather than pinned: the article slot reserves what it declares, and
    // a literal here was still asserting two slots at an old per-run cap long after the desk
    // moved to one article a day.
    const articleProduction = registry.ventures
      .flatMap((venture) => venture.productionJobs ?? [])
      .reduce((sum, job) => sum + job.envelopeUsd, 0);
    const morningCycleCap = 0.2;
    // Nine rooms: two Caught Up, one Titty Tuesdays, one GoVIRAL, one marketingShark, two
    // FightAIQ, two MMA Files. The studio and both incubator rooms are gone. GoVIRAL reserves
    // its $0.06 every day even though it meets on Mondays, and marketingShark reserves $0.10
    // even in Phase 1 where one brand is enabled -- the reservation is what the clock can cost,
    // not what it usually does, and reserving less than a room can spend is how a day runs out
    // of money.
    expect(roomEnvelopes).toBeCloseTo(0.62, 8);
    // The whole clock, at every room's full envelope, has to fit inside the $1.00 daily pace
    // budget-2026-08e signed -- which is the arithmetic that makes a full day affordable rather
    // than a day whose last rooms cannot be funded. marketingShark took the margin from 32c to
    // 2c, so the next room needs a cheaper envelope or somebody else's.
    expect(roomEnvelopes + articleProduction + morningCycleCap).toBeLessThanOrEqual(1);
  });

  it("keeps Carousel Studio free of provider SDKs and external template assets", async () => {
    const files = (await readdir(path.join(repoRoot, "studio", "src"), { recursive: true }))
      .filter((entry) => entry.endsWith(".ts"));
    const source = (await Promise.all(files.map((file) => readFile(path.join(repoRoot, "studio", "src", file), "utf8")))).join("\n");
    expect(source).not.toMatch(/@anthropic-ai|\bopenai\b|imagegen|https?:\/\/.+\.(?:png|jpe?g|webp)/i);
  });
});
