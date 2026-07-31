import type { VentureRegistry } from "../contracts/venture-registry.js";
import type { ScheduledPhase } from "../types.js";
import { parseCadenceHour, resolveMeetingClock } from "../ventures/registry.js";

export type BudgetShape = "A" | "B";

export interface EffectivePortfolioSchedule {
  shape: BudgetShape;
  decisionStatus: "countersigned-shape-a" | "countersigned-shape-b" | "pending";
  monthlyBudgetUsd: 15 | 18;
  dailyBudgetUsd: 0.7 | 1;
  ttTranscriptMode: "full" | "minimal" | "paused";
  activePhases: ScheduledPhase[];
  envelopeByPhase: Partial<Record<ScheduledPhase, number>>;
}

function checkedLine(raw: string, label: string): string | null {
  const match = new RegExp(`^${label}:\\s*(.+)$`, "mi").exec(raw)?.[1]?.trim();
  if (!match || /^_+$/.test(match)) return null;
  return match;
}

export function budgetDecisionStatus(raw: string): EffectivePortfolioSchedule["decisionStatus"] {
  if (!/^Status:\s*countersigned\s*$/mi.test(raw)) return "pending";
  const signature = checkedLine(raw, "Signature / explicit approval reference");
  if (!signature) return "pending";
  if (/Selection:\s*\[[xX]\]\s*Shape A\s+\[ \]\s*Shape B/i.test(raw)) return "countersigned-shape-a";
  if (/Selection:\s*\[ \]\s*Shape A\s+\[[xX]\]\s*Shape B/i.test(raw)) return "countersigned-shape-b";
  return "pending";
}

export function resolveEffectivePortfolioSchedule(input: {
  registry: VentureRegistry;
  budgetDecisionRaw: string;
  monthlyApiHeadroomUsd: number;
}): EffectivePortfolioSchedule {
  if (!Number.isFinite(input.monthlyApiHeadroomUsd) || input.monthlyApiHeadroomUsd < 0) {
    throw new Error("Monthly API headroom must be a non-negative finite number");
  }
  const decisionStatus = budgetDecisionStatus(input.budgetDecisionRaw);
  const shape: BudgetShape = decisionStatus === "countersigned-shape-a" ? "A" : "B";
  const active = new Set(resolveMeetingClock(input.registry).map((slot) => slot.phase));
  const envelopeByPhase: Partial<Record<ScheduledPhase, number>> = {};
  for (const venture of input.registry.ventures) {
    for (const meeting of venture.meetings) {
      envelopeByPhase[meeting.kind as ScheduledPhase] = meeting.envelopeUsd;
    }
  }
  if (shape === "B") {
    active.delete("incubator-synthesis");
    envelopeByPhase["tt-marketing"] = 0.06;
  }
  let ttTranscriptMode: EffectivePortfolioSchedule["ttTranscriptMode"] = "full";
  if (input.monthlyApiHeadroomUsd < 3) active.delete("incubator-synthesis");
  if (input.monthlyApiHeadroomUsd < 1.5) {
    active.delete("incubator-scan");
    active.delete("incubator-synthesis");
    ttTranscriptMode = "minimal";
  }
  if (input.monthlyApiHeadroomUsd < 0.5) {
    active.delete("tt-marketing");
    ttTranscriptMode = "paused";
  }
  return {
    shape,
    decisionStatus,
    monthlyBudgetUsd: shape === "A" ? 18 : 15,
    dailyBudgetUsd: shape === "A" ? 1 : 0.7,
    ttTranscriptMode,
    activePhases: resolveMeetingClock(input.registry)
      .map((slot) => slot.phase)
      .filter((phase) => active.has(phase)),
    envelopeByPhase
  };
}

export function assertCollisionFreeRegistry(registry: VentureRegistry): void {
  const slots = resolveMeetingClock(registry);
  for (let index = 1; index < slots.length; index += 1) {
    if ((slots[index]!.hour - slots[index - 1]!.hour) * 60 < 60) {
      throw new Error(`${slots[index - 1]!.label} collides with ${slots[index]!.label}`);
    }
  }
  for (const venture of registry.ventures) {
    for (const meeting of venture.meetings) parseCadenceHour(meeting.cadence);
  }
}

export function phaseEnabled(
  schedule: EffectivePortfolioSchedule,
  phase: ScheduledPhase
): boolean {
  return schedule.activePhases.includes(phase);
}
