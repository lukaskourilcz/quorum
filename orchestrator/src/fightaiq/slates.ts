import { EdgeReportSchema, SlipOfTenSchema, type EdgeReport, type ModelRun, type SlipOfTen } from "../contracts/mma.js";

const STAKE_GUIDANCE = "Entertainment only. Keep the total stake to a few dollars and never chase a loss." as const;

export function buildEdgeReport(input: {
  eventRef: string;
  modelRunRef: string;
  modelRun: ModelRun;
  boutRefs: readonly string[];
  calibrationContext: string;
  generatedAt: string;
}): EdgeReport {
  return EdgeReportSchema.parse({
    schemaVersion: "edge-report/1",
    eventRef: input.eventRef,
    modelRunRef: input.modelRunRef,
    bouts: input.boutRefs.map((boutRef) => {
      const bout = input.modelRun.bouts.find((candidate) => candidate.boutRef === boutRef);
      if (!bout) throw new Error(`Model run does not contain ${boutRef}`);
      const market = bout.probabilities.marketRedWin ?? null;
      const divergence = market === null ? null : Number((bout.probabilities.redWin - market).toFixed(8));
      const recommendation = divergence === null
        ? "No captured market price is available, so there is no price comparison."
        : Math.abs(divergence) < 0.04
          ? "No meaningful difference from the captured market; the honest action is no selection."
          : divergence > 0
            ? "The model is higher on the red corner; review the sourced file and uncertainty before any owner decision."
            : "The model is higher on the blue corner; review the sourced file and uncertainty before any owner decision.";
      return { boutRef, modelProbability: bout.probabilities.redWin, marketProbability: market, divergence, recommendation };
    }),
    calibrationContext: input.calibrationContext,
    generatedAt: input.generatedAt
  });
}

export interface SlipCandidate {
  boutRef: string;
  redPick: string;
  bluePick: string;
  primaryCorner: "red" | "blue";
  redBookOdds: number;
  blueBookOdds: number;
  note: string;
}

function product(values: readonly number[]): number {
  return values.reduce((total, value) => total * value, 1);
}

export function buildSlipOfTen(input: {
  eventRefs: string[];
  modelRunRef: string;
  modelRun: ModelRun;
  candidates: readonly SlipCandidate[];
  stakePerTicketUsd: number;
  generatedAt: string;
}): SlipOfTen {
  if (input.candidates.length !== 10) throw new Error("A ten-fight slate needs exactly ten source-backed candidates");
  if (!Number.isFinite(input.stakePerTicketUsd) || input.stakePerTicketUsd <= 0 || input.stakePerTicketUsd > 5) throw new Error("The per-ticket stake must stay between zero and five dollars");
  const bouts = input.candidates.map((candidate) => {
    const bout = input.modelRun.bouts.find((item) => item.boutRef === candidate.boutRef);
    if (!bout) throw new Error(`Model run does not contain ${candidate.boutRef}`);
    const redProbability = bout.probabilities.blendedRedWin;
    const primaryRed = candidate.primaryCorner === "red";
    const primaryProbability = primaryRed ? redProbability : 1 - redProbability;
    const split = bout.probabilities.uncertainty === "coin-flip";
    return {
      bout,
      leg: {
        boutRef: candidate.boutRef,
        betType: "moneyline" as const,
        pick: primaryRed ? candidate.redPick : candidate.bluePick,
        modelProb: primaryProbability,
        fairOdds: 1 / primaryProbability,
        bookOdds: primaryRed ? candidate.redBookOdds : candidate.blueBookOdds,
        note: candidate.note,
        coverage: split ? "both-corners" as const : "single" as const,
        ...(split ? { secondPick: {
          pick: primaryRed ? candidate.bluePick : candidate.redPick,
          modelProb: 1 - primaryProbability,
          fairOdds: 1 / (1 - primaryProbability),
          bookOdds: primaryRed ? candidate.blueBookOdds : candidate.redBookOdds
        } } : {})
      }
    };
  });
  const splitCount = bouts.filter(({ leg }) => leg.coverage === "both-corners").length;
  if (splitCount > 2) throw new Error("More than two coin flips need different candidates or bet types; a fifth ticket is never created");
  let ticketPicks: Array<Array<{ boutRef: string; betType: "moneyline"; pick: string; modelProb: number; fairOdds: number; bookOdds: number }>> = [[]];
  for (const { leg } of bouts) {
    const primary = { boutRef: leg.boutRef, betType: leg.betType, pick: leg.pick, modelProb: leg.modelProb, fairOdds: leg.fairOdds, bookOdds: leg.bookOdds };
    const choices = leg.secondPick ? [primary, { boutRef: leg.boutRef, betType: leg.betType, ...leg.secondPick }] : [primary];
    ticketPicks = ticketPicks.flatMap((picks) => choices.map((choice) => [...picks, choice]));
  }
  const tickets = ticketPicks.map((picks, index) => {
    const combinedFairProbability = product(picks.map((pick) => pick.modelProb));
    return { id: `ticket-${String(index + 1).padStart(2, "0")}`, picks, combinedFairProbability, combinedFairOdds: 1 / combinedFairProbability };
  });
  const totalStake = input.stakePerTicketUsd * tickets.length;
  const expectedReturn = tickets.reduce((sum, ticket) => sum + input.stakePerTicketUsd * ticket.combinedFairProbability * product(ticket.picks.map((pick) => pick.bookOdds)), 0);
  const expectedLoss = totalStake - expectedReturn;
  const line = expectedLoss >= 0
    ? `Across all ${tickets.length} owner-only ticket${tickets.length === 1 ? "" : "s"}, $${totalStake.toFixed(2)} staked has an estimated expected loss of $${expectedLoss.toFixed(2)}.`
    : `Across all ${tickets.length} owner-only ticket${tickets.length === 1 ? "" : "s"}, $${totalStake.toFixed(2)} staked has a model-estimated edge of $${Math.abs(expectedLoss).toFixed(2)}; uncertainty and source limits still apply.`;
  return SlipOfTenSchema.parse({
    schemaVersion: "slip-of-ten/1",
    eventRefs: input.eventRefs,
    modelRunRefs: [input.modelRunRef],
    legs: bouts.map(({ leg }) => leg),
    tickets,
    expectedLossLine: line,
    stakeGuidance: STAKE_GUIDANCE,
    generatedAt: input.generatedAt
  });
}
