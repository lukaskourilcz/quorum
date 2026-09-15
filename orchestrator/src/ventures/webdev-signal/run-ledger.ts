import type { WebDevRun } from "../../contracts/webdev-signal.js";
import type { WebDevEditorConfig, WebDevEditorialReceipt } from "./editor/model.js";
import type { WebDevEditionObservationInput } from "./observations.js";
import type { WebDevSignalRegistration } from "./registration.js";
import type { RunWebDevSignalDailyInput } from "./run.js";
import type { WebDevDayRefs } from "./run-store.js";
import type { WebDevSelectionConfig } from "./selection/config.js";
import type { WebDevSelectionMetrics } from "./selection/decision.js";
import type { WebDevSourceHealth } from "./sources/collect.js";
import type { WebDevSourceRegistry } from "./sources/registry.js";

/**
 * What one day accumulates while its stages run, and the two ways a stage writes to it.
 *
 * One mutable context rather than a return value per stage, because the receipt at the end needs
 * a little from every stage — the source lines, the counts, the refs, the editorial receipt, the
 * per-locale states — and a stage that throws must leave behind everything it had already
 * established. `note` is the one way anything becomes an error line, so the bound on the receipt
 * (50 lines, 500 characters each) is enforced in one place.
 */

export type WebDevLocale = "cs" | "en";
export type WebDevRunStage = "collect" | "select" | "edit" | "render" | "observe";

export const WEBDEV_LOCALES: readonly WebDevLocale[] = ["cs", "en"];

export interface WebDevDayLedger {
  now: string;
  pragueDate: string;
  mode: "fixture" | "live";
  stateRoot: string;
  configRoot: string;
  registration: WebDevSignalRegistration;
  registry: WebDevSourceRegistry;
  selectionConfig: WebDevSelectionConfig;
  editorConfig: WebDevEditorConfig;
  refs: WebDevDayRefs;
  transport: Pick<RunWebDevSignalDailyInput, "fetchImpl" | "resolveImpl" | "delayImpl">;
  health: WebDevSourceHealth[];
  sourceOutcomes: WebDevRun["sourceOutcomes"];
  counts: WebDevRun["counts"];
  unchangedSources: number;
  reusedArtifacts: number;
  errors: WebDevRun["errors"];
  artifacts: string[];
  metrics: WebDevSelectionMetrics | null;
  selectionOutcome: WebDevRun["selectionOutcome"];
  selectionRef: string | null;
  briefRef: string | null;
  packageRefs: string[];
  renderRefs: string[];
  editorial: WebDevEditorialReceipt | null;
  editions: Map<WebDevLocale, WebDevEditionObservationInput>;
  selectedRecordId: string | null;
  scoreMargin: number | null;
  confidence: number | null;
  stage: WebDevRunStage;
}

export function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ").trim().slice(0, 500) || "unknown-error";
}

export function note(ledger: WebDevDayLedger, code: string, text: string, sourceId: string | null = null): void {
  if (ledger.errors.length >= 50) return;
  ledger.errors.push({ code, sourceId, message: text.slice(0, 500) });
}
