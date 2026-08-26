import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BudgetLedgerEntry } from "../src/budget.js";
import { PersonalGrowthFoundationSchema } from "../src/contracts/personal-growth-foundation.js";
import { repoRoot } from "../src/paths.js";
import {
  assertPersonalGrowthReservation,
  loadPersonalGrowthFoundation,
  PersonalGrowthBudgetError,
  resolvePersonalGrowthBudgetState
} from "../src/ventures/personal-growth/foundation.js";
import { loadVentureRegistry, publicVentures } from "../src/ventures/registry.js";

function entry(usd: number, ventureId = "personal-growth"): BudgetLedgerEntry {
  return {
    ts: "2026-08-26T08:00:00.000Z",
    cycleId: `cycle-${ventureId}`,
    requestHash: `request-${ventureId}`,
    phase: "personal-growth",
    ventureId,
    agent: "PULSE",
    provider: "openai",
    model: "gpt-5.6-luna",
    serviceTier: "default",
    tokensIn: 1,
    cachedTokensIn: 0,
    tokensOut: 1,
    toolUses: 0,
    usd,
    kind: "text"
  };
}

describe("Personal Growth foundation", () => {
  it("registers one owner-only workspace and keeps it out of the public registry view", async () => {
    const registry = await loadVentureRegistry();
    expect(registry.ventures.find((venture) => venture.id === "personal-growth")).toMatchObject({
      name: "Lukáš Growth Desk",
      ledgerNamespace: "personal-growth",
      visibility: "owner-only",
      meetings: [expect.objectContaining({ kind: "pg-desk", cadence: "daily@23:00" })]
    });
    expect(publicVentures(registry).map((venture) => venture.id)).not.toContain("personal-growth");
    expect(publicVentures(registry)).toHaveLength(11);
  });

  it("keeps allocation modes mutually exclusive and every mode at the same $20 cap", async () => {
    const foundation = await loadPersonalGrowthFoundation();
    expect(foundation.budget.activeMode).toBe("default");
    expect(foundation.budget.modes).toHaveLength(2);
    for (const mode of foundation.budget.modes) {
      expect(mode.synthesisUsd + mode.researchUsd + mode.schedulingUsd + mode.reserveUsd).toBe(20);
    }
    expect(foundation.featureGates).toEqual({
      projectLive: true,
      paidSynthesis: false,
      insightsIngestion: true,
      threadsSearch: false,
      bufferQueue: false,
      publishing: false
    });
    expect(PersonalGrowthFoundationSchema.safeParse({
      ...foundation,
      budget: { ...foundation.budget, activeMode: "buffer" }
    }).success).toBe(true);
  });

  it("derives every degradation state from recorded project and company headroom", async () => {
    const foundation = await loadPersonalGrowthFoundation();
    const state = (usd: number) => resolvePersonalGrowthBudgetState({
      foundation,
      ledger: [entry(usd), entry(99, "caught-up")],
      now: new Date("2026-08-26T12:00:00.000Z"),
      nonApiSpentUsd: 0,
      committedUsd: 0,
      companyRemainingUsd: 50
    }).degradation;
    expect(state(0)).toBe("healthy");
    expect(state(10)).toBe("reduced");
    expect(state(14)).toBe("low");
    expect(state(17)).toBe("critical");
    expect(state(20)).toBe("exhausted");
  });

  it("fails closed on disabled paid synthesis, the nested cap and the company cap", async () => {
    const foundation = await loadPersonalGrowthFoundation();
    const base = {
      ledger: [] as BudgetLedgerEntry[],
      now: new Date("2026-08-26T12:00:00.000Z"),
      nonApiSpentUsd: 0,
      committedUsd: 0,
      companyRemainingUsd: 50,
      reservationUsd: 0.1
    };
    expect(() => assertPersonalGrowthReservation({ foundation, ...base }))
      .toThrowError(expect.objectContaining({ code: "PAID_SYNTHESIS_DISABLED" }));

    const enabled = PersonalGrowthFoundationSchema.parse({
      ...foundation,
      featureGates: { ...foundation.featureGates, paidSynthesis: true }
    });
    expect(() => assertPersonalGrowthReservation({
      foundation: enabled,
      ...base,
      ledger: [entry(19.95)]
    })).toThrowError(expect.objectContaining({ code: "PROJECT_CAP" }));
    expect(() => assertPersonalGrowthReservation({
      foundation: enabled,
      ...base,
      companyRemainingUsd: 0.05
    })).toThrowError(expect.objectContaining({ code: "COMPANY_CAP" }));
    expect(PersonalGrowthBudgetError).toBeDefined();
  });

  it("keeps the committed config aligned with its exported contract source", async () => {
    const raw = JSON.parse(await readFile(path.join(repoRoot, "config/personal-growth.json"), "utf8"));
    expect(PersonalGrowthFoundationSchema.safeParse(raw).success).toBe(true);
  });
});
