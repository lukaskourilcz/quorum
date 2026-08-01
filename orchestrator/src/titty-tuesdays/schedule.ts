import type { FoundingAgent } from "../types.js";

const FIXED = ["PULSE", "ANGLE", "AUDIT"] as const;
const WHEEL: Record<number, readonly FoundingAgent[]> = {
  1: ["FUNNEL"],
  2: ["STUNT"],
  3: ["COHORT"],
  4: ["SCENE"],
  5: ["PALATE"],
  6: ["SPARK"],
  0: ["VAULT"]
};

export interface TittyTuesdaysSlot {
  kind: "tt-marketing" | "season-turnover";
  cast: FoundingAgent[];
  palatePreStep: boolean;
}

function dayDistance(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00.000Z`);
  const end = Date.parse(`${to}T12:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new Error("Season schedule date is invalid");
  return Math.floor((end - start) / 86_400_000);
}

export function resolveTittyTuesdaysSlot(input: {
  date: string;
  activationDate?: string;
  captionsNeeded?: boolean;
}): TittyTuesdaysSlot {
  const activationDate = input.activationDate ?? "2026-08-01";
  const elapsed = dayDistance(activationDate, input.date);
  if (elapsed > 0 && elapsed % 91 === 0) {
    return {
      kind: "season-turnover",
      cast: ["PULSE", "ANGLE", "FUNNEL", "SCENE", "STUNT", "AUDIT"],
      palatePreStep: true
    };
  }
  const weekday = new Date(`${input.date}T12:00:00.000Z`).getUTCDay();
  const guests = [...(WHEEL[weekday] ?? [])];
  if (input.captionsNeeded) guests.push("QUILL");
  return {
    kind: "tt-marketing",
    cast: [...FIXED, ...guests],
    palatePreStep: true
  };
}
