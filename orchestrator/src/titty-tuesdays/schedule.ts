import type { FoundingAgent } from "../types.js";

const FIXED = ["PULSE", "ANGLE", "AUDIT"] as const;

/**
 * Who joins the core three, by weekday. Friday, Saturday and Sunday seat nobody extra.
 *
 * COHORT twice, because audience specifications are the binding constraint on this venture:
 * the social unlock counts only approved plans with a non-empty `audienceRefs`, and ANGLE's
 * plans keep failing that check without audience input -- the 5 August plan is the code
 * fallback, with `audienceRefs: []`. STUNT and SCENE stay because they produce exactly the
 * marketing ideas the owner wants to read in /admin.
 *
 * Four seats left. SPARK's mission is DNESKAi growth, which is the wrong venture. PALATE's
 * distilling already runs as the free pre-step on every one of these rooms, and no rating has
 * ever been filed for it to distil. VAULT's room adjudication is deterministic code. FUNNEL's
 * channel and measurement plans are unactionable until about a month before social activation,
 * and it is paused on the roster.
 */
const WHEEL: Record<number, readonly FoundingAgent[]> = {
  1: ["COHORT"],
  2: ["STUNT"],
  3: ["COHORT"],
  4: ["SCENE"],
  5: [],
  6: [],
  0: []
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
}): TittyTuesdaysSlot {
  const activationDate = input.activationDate ?? "2026-08-01";
  const elapsed = dayDistance(activationDate, input.date);
  if (elapsed > 0 && elapsed % 91 === 0) {
    return {
      kind: "season-turnover",
      cast: ["PULSE", "ANGLE", "COHORT", "SCENE", "STUNT", "AUDIT"],
      palatePreStep: true
    };
  }
  const weekday = new Date(`${input.date}T12:00:00.000Z`).getUTCDay();
  // `captionsNeeded` used to add QUILL here. Nothing ever set it: QUILL is disabled on this
  // venture and captions are a channel artefact, which is a decision no channel can act on.
  const guests = [...(WHEEL[weekday] ?? [])];
  return {
    kind: "tt-marketing",
    cast: [...FIXED, ...guests],
    palatePreStep: true
  };
}
