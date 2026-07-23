import type { Experiment } from "./validate.js";

export interface ExperimentReview {
  experimentId: string;
  eligible: boolean;
  decision: "continue" | "change" | "stop" | "pivot" | "not_due";
  observed: number | null;
  target: number | null;
  reason: string;
}

export function evaluateExperiment(
  experiment: Experiment,
  currentCycle: number,
  observed: number | null,
  spentUsd: number,
  lossUsd: number
): ExperimentReview {
  if (experiment.status !== "active" || currentCycle < experiment.reviewCycle) {
    return {
      experimentId: experiment.id,
      eligible: false,
      decision: "not_due",
      observed,
      target: experiment.target,
      reason: "Experiment is not active or its immutable review cycle is not due."
    };
  }
  if (spentUsd > experiment.maxCostUsd || lossUsd > experiment.maxLossUsd) {
    return {
      experimentId: experiment.id,
      eligible: true,
      decision: "stop",
      observed,
      target: experiment.target,
      reason: "A pre-registered cost or loss stop condition was exceeded."
    };
  }
  if (observed === null || experiment.target === null) {
    return {
      experimentId: experiment.id,
      eligible: true,
      decision: "change",
      observed,
      target: experiment.target,
      reason: "The primary metric is unavailable; instrumentation must change."
    };
  }
  if (observed >= experiment.target) {
    return {
      experimentId: experiment.id,
      eligible: true,
      decision: "continue",
      observed,
      target: experiment.target,
      reason: "The pre-registered primary target was met."
    };
  }
  return {
    experimentId: experiment.id,
    eligible: true,
    decision: "pivot",
    observed,
    target: experiment.target,
    reason: "The pre-registered target was missed at the review cycle."
  };
}
