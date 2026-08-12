import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_LIMITS, exceedsDailyCap, type BudgetLedgerEntry } from "../src/budget.js";
import { personaPromptPath } from "../src/paths.js";
import { resolveDailyEnvelopePlan } from "../src/portfolio/schedule.js";
import { ScheduledPhaseSchema } from "../src/types.js";

const repoRoot = path.resolve(process.cwd(), "..");

async function json<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot, relative), "utf8")) as T;
}

describe("closing 48-agent system audit", () => {
  it("keeps every identity unique, prompt-backed and routable, seated or not", async () => {
    const registry = await json<{ agents: Array<{ id: string; slug: string; mission: string; status: string; provider: string; notResponsibleFor: string[] }> }>("config/agents.json");
    const routing = await json<{ agents: Record<string, { capabilities: string[]; status: string }> }>("config/agent-routing.json");
    expect(registry.agents).toHaveLength(48);
    expect(new Set(registry.agents.map((agent) => agent.id)).size).toBe(48);
    expect(new Set(registry.agents.map((agent) => agent.mission)).size).toBe(48);
    expect(new Set(Object.keys(routing.agents))).toEqual(new Set(registry.agents.map((agent) => agent.id)));
    // Forty-eight profiles, thirty-nine of them seated. A retired or paused agent keeps its
    // prompt, its portrait and its routing entry -- the record of who did what does not shrink
    // when the roster does -- and the two files have to agree about which of the three it is.
    expect(registry.agents.filter((agent) => agent.status === "active")).toHaveLength(39);
    for (const agent of registry.agents) {
      expect(["active", "paused", "retired"]).toContain(agent.status);
      expect(routing.agents[agent.id]?.status).toBe(agent.status);
      expect(agent.notResponsibleFor.length).toBeGreaterThan(0);
      expect(routing.agents[agent.id]?.capabilities.length).toBeGreaterThan(0);
      await expect(access(personaPromptPath(agent.slug))).resolves.toBeUndefined();
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

  it("keeps every room individually bounded and lets the runtime refuse exhausted days", async () => {
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
    const effectiveRoomEnvelopes = registry.ventures.flatMap((venture) =>
      venture.meetings.map((meeting) => meeting.envelopeUsd * (meeting.kind === "ms-daily" ? enabledBrands : 1))
    );
    const effectiveProductionEnvelopes = registry.ventures.flatMap((venture) =>
      (venture.productionJobs ?? []).map((job) => job.envelopeUsd)
    );
    expect(effectiveRoomEnvelopes).not.toContain(0);
    expect(Math.max(...effectiveRoomEnvelopes, ...effectiveProductionEnvelopes)).toBeLessThanOrEqual(1);
    expect(registry.ventures.flatMap((venture) => venture.meetings).find((meeting) => meeting.kind === "bh-desk")?.envelopeUsd).toBe(0.5);
    expect(DEFAULT_BUDGET_LIMITS.perTextCallUsd).toBe(0.1);

    // Room envelopes are ceilings for overlapping, degradable work, not reservations all charged
    // at midnight. Summing every ceiling rejects a safe clock as soon as its theoretical maxima
    // exceed $1 even though the shared ledger refuses each next call against actual daily spend.
    // Pin that authoritative preflight instead: a final ten-cent call cannot enter a $1 day with
    // only five cents left, regardless of which room asks for it.
    const now = new Date("2026-08-12T12:00:00.000Z");
    const ledger: BudgetLedgerEntry[] = [{
      ts: "2026-08-12T10:00:00.000Z",
      cycleId: "another-room",
      requestHash: "12345678",
      phase: "test",
      agent: "AUDIT",
      provider: "anthropic",
      model: "test",
      serviceTier: "default",
      tokensIn: 0,
      cachedTokensIn: 0,
      tokensOut: 0,
      toolUses: 0,
      usd: 0.95,
      kind: "text"
    }];
    const limits = { ...DEFAULT_BUDGET_LIMITS, dailyUsd: 1 };
    expect(exceedsDailyCap(0.1, ledger, now, limits)).toBe(true);

    const rooms = registry.ventures
      .flatMap((venture) => venture.meetings)
      .map((meeting) => ({
        phase: ScheduledPhaseSchema.parse(meeting.kind),
        envelopeUsd: meeting.envelopeUsd * (meeting.kind === "ms-daily" ? enabledBrands : 1)
      }));
    // Read from the registry rather than pinned: the article slot reserves what it declares, and
    // a literal here was still asserting two slots at an old per-run cap long after the desk
    // moved to one article a day.
    const articleProduction = registry.ventures
      .flatMap((venture) => venture.productionJobs ?? [])
      .reduce((sum, job) => sum + job.envelopeUsd, 0);
    const morningCycleCap = 0.2;
    // The two weekly rooms use daily cron syntax so their off-days can write $0 reason records.
    // They are paid reservations only on their real weekdays: GoVIRAL on Monday and dm-growth
    // on Thursday. Door Money owns the first two degradation rungs, then Tehdejsi svet, then
    // BOOKSOFHISTORY, all before GoVIRAL; the $1 ceiling itself never moves.
    const nonRoomReservationUsd = articleProduction + morningCycleCap;
    const week = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date("2026-08-03T12:00:00.000Z");
      date.setUTCDate(date.getUTCDate() + offset);
      return resolveDailyEnvelopePlan({
        date: date.toISOString().slice(0, 10),
        rooms,
        nonRoomReservationUsd,
        dailyBudgetUsd: 1
      });
    });
    expect(week[0]!.droppedRoomPhases).toEqual(["dm-desk", "ts-desk", "bh-desk"]);
    expect(week[3]!.droppedRoomPhases).toEqual(["dm-growth", "dm-desk", "ts-desk", "bh-desk"]);
    expect(week.filter((_, index) => index !== 3).every((plan) =>
      plan.droppedRoomPhases.join(",") === "dm-desk,ts-desk,bh-desk"
    )).toBe(true);
    expect(week.every((plan) => plan.reservedUsd <= 1)).toBe(true);
  });

  it("keeps Carousel Studio free of provider SDKs and external template assets", async () => {
    const files = (await readdir(path.join(repoRoot, "studio", "src"), { recursive: true }))
      .filter((entry) => entry.endsWith(".ts"));
    const source = (await Promise.all(files.map((file) => readFile(path.join(repoRoot, "studio", "src", file), "utf8")))).join("\n");
    expect(source).not.toMatch(/@anthropic-ai|\bopenai\b|imagegen|https?:\/\/.+\.(?:png|jpe?g|webp)/i);
  });
});
