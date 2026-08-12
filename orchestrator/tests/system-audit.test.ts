import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseVentureRegistry } from "../src/ventures/registry.js";
import { resolveEffectivePortfolioSchedule } from "../src/portfolio/schedule.js";

const repoRoot = path.resolve(process.cwd(), "..");

async function json<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot, relative), "utf8")) as T;
}

describe("closing 43-agent system audit", () => {
  it("keeps every identity unique, prompt-backed and routable, seated or not", async () => {
    const registry = await json<{ agents: Array<{ id: string; slug: string; mission: string; status: string; provider: string; notResponsibleFor: string[] }> }>("config/agents.json");
    const routing = await json<{ agents: Record<string, { capabilities: string[]; status: string }> }>("config/agent-routing.json");
    expect(registry.agents).toHaveLength(43);
    expect(new Set(registry.agents.map((agent) => agent.id)).size).toBe(43);
    expect(new Set(registry.agents.map((agent) => agent.mission)).size).toBe(43);
    expect(new Set(Object.keys(routing.agents))).toEqual(new Set(registry.agents.map((agent) => agent.id)));
    // Forty-three profiles, thirty-four of them seated. A retired or paused agent keeps its
    // prompt, its portrait and its routing entry -- the record of who did what does not shrink
    // when the roster does -- and the two files have to agree about which of the three it is.
    expect(registry.agents.filter((agent) => agent.status === "active")).toHaveLength(34);
    for (const agent of registry.agents) {
      expect(["active", "paused", "retired"]).toContain(agent.status);
      expect(routing.agents[agent.id]?.status).toBe(agent.status);
      expect(agent.notResponsibleFor.length).toBeGreaterThan(0);
      expect(routing.agents[agent.id]?.capabilities.length).toBeGreaterThan(0);
      const promptPath = agent.id === "TRIBUN"
        ? path.join(repoRoot, "orchestrator", "prompts", "kvorum", "tribun.md")
        : path.join(repoRoot, "orchestrator", "prompts", `${agent.slug}.md`);
      await expect(access(promptPath)).resolves.toBeUndefined();
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
    const registryRaw = await json<{
      ventures: Array<{
        meetings: Array<{ kind: string; envelopeUsd: number }>;
        productionJobs?: Array<{ envelopeUsd: number }>;
      }>;
    }>("config/ventures.json");
    const registry = parseVentureRegistry(registryRaw);
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
    // Ten declared rooms now total $0.72. Hiding Kvórum from this sum would make the registry
    // look cheaper than it is; registration and live authority are separate facts.
    expect(roomEnvelopes).toBeCloseTo(0.72, 8);
    expect(registry.ventures.flatMap((venture) => venture.meetings)
      .find((meeting) => meeting.kind === "kv-desk")?.envelopeUsd).toBe(0.1);
    expect(roomEnvelopes + articleProduction + morningCycleCap).toBeGreaterThan(1);

    const decision = (name: string) => readFile(path.join(repoRoot, "state", "decisions", name), "utf8");
    const [budgetDecisionRaw, budgetMmaRaw, budgetFiftyRaw, fightAiQFoundingRaw, kvorumFoundingRaw] = await Promise.all([
      decision("2026-08-01-budget-raise.md"),
      decision("2026-08-02-budget-mma.md"),
      decision("2026-08-04-budget-fifty.md"),
      decision("2026-08-02-fightaiq-founding.md"),
      decision("2026-08-12-kvorum-founding.md")
    ]);
    const schedule = resolveEffectivePortfolioSchedule({
      registry,
      budgetDecisionRaw,
      budgetMmaRaw,
      budgetFiftyRaw,
      fightAiQFoundingRaw,
      kvorumFoundingRaw,
      // No owner capacity-reallocation record exists. Missing authority is the safer branch.
      kvorumBudgetCapacityRaw: "",
      monthlyApiHeadroomUsd: 25
    });
    const payable = new Set(schedule.activePhases);
    const payableRoomEnvelopes = registry.ventures
      .flatMap((venture) => venture.meetings)
      .filter((meeting) => payable.has(meeting.kind as never))
      .reduce((sum, meeting) => sum + meeting.envelopeUsd * (meeting.kind === "ms-daily" ? enabledBrands : 1), 0);
    expect(schedule.activePhases).not.toContain("kv-desk");
    expect(payableRoomEnvelopes).toBeCloseTo(0.62, 8);
    // The payable clock, not merely a handpicked subset, remains inside the exact signed cap.
    expect(payableRoomEnvelopes + articleProduction + morningCycleCap).toBeLessThanOrEqual(1);
  });

  it("keeps Carousel Studio free of provider SDKs and external template assets", async () => {
    const files = (await readdir(path.join(repoRoot, "studio", "src"), { recursive: true }))
      .filter((entry) => entry.endsWith(".ts"));
    const source = (await Promise.all(files.map((file) => readFile(path.join(repoRoot, "studio", "src", file), "utf8")))).join("\n");
    expect(source).not.toMatch(/@anthropic-ai|\bopenai\b|imagegen|https?:\/\/.+\.(?:png|jpe?g|webp)/i);
  });
});
