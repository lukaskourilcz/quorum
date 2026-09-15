import path from "node:path";
import { WebDevRunSchema, type WebDevRun } from "../../contracts/webdev-signal.js";
import { pragueClockParts } from "../../meetings/clock.js";
import { configRoot as defaultConfigRoot, repoRoot, stateRoot as defaultStateRoot } from "../../paths.js";
import { loadWebDevEditorConfig, type WebDevEditorConfig } from "./editor/model.js";
import {
  dispatchWebDevSignalRegistration,
  loadWebDevSignalRegistration,
  webDevZeroRun
} from "./registration.js";
import { WEBDEV_LOCALES, errorMessage, note, type WebDevDayLedger } from "./run-ledger.js";
import { runWebDevSignalStages } from "./run-stages.js";
import { readWebDevRun, webDevDayRefs, writeWebDevJson } from "./run-store.js";
import { loadWebDevSelectionConfig, type WebDevSelectionConfig } from "./selection/config.js";
import { collectableWebDevSources, loadWebDevSourceRegistry } from "./sources/registry.js";

/**
 * One WebDev Signal day: collect, select zero or one story, brief it, write both locale packages,
 * render them, and record what happened.
 *
 * Everything here is deterministic and costs nothing. The editor runs its deterministic strategy
 * only — `bilingualSynthesis` is held in the registration and no route, budget or provider is
 * passed — and the render goes through the studio's own renderer with committed fonts. A package
 * that passes every editorial gate is promoted to `approved`, which is what the Design Lab
 * boundary accepts; that word is the deterministic gate's verdict, not publishing authority, and
 * nothing here queues, connects or posts. Manual posting is the product until the owner grants
 * more in the registration and the profile constitutions.
 *
 * The day is idempotent by receipt. The receipt is written last, after every other record, so a
 * run that died halfway left no receipt and the next firing redoes the day from the same inputs;
 * a run that finished is found by the next firing and returned at $0. A dry run defaults to the
 * dry-run tree so a rehearsal can never be mistaken for a live day.
 *
 * Failure posture, rule 6 of `docs/ENGINEERING.md`: a malformed item costs one item inside the
 * adapter, a failing source costs one line in `errors`, and a stage that throws costs that stage
 * and every stage after it — the receipt still says which stage, and the records already written
 * stay. Nothing here throws past the receipt write on purpose, because the caller is the Caught
 * Up day and this scan must never cost it.
 */

export interface RunWebDevSignalDailyInput {
  now: Date;
  dry: boolean;
  /** The state root to write under. Defaults to the repository state, or the dry-run tree when dry. */
  root?: string;
  configRoot?: string;
  /** The phase that is firing; the registration decides whether it is this venture's anchor. */
  dispatcherPhase?: string;
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
  delayImpl?: (milliseconds: number) => Promise<void>;
}

export type WebDevSignalDailyResult =
  | { status: "not-anchored"; pragueDate: string; run: null; runRef: null; artifacts: string[] }
  | { status: "recorded" | "already_recorded"; pragueDate: string; run: WebDevRun; runRef: string; artifacts: string[] };

function nextSafeAction(ledger: WebDevDayLedger): string {
  const failed = ledger.errors.find((error) => error.code.endsWith("-failed") && !error.code.startsWith("source-") && error.code !== "render-failed");
  if (failed) return `The ${failed.code.replace(/-failed$/u, "")} stage failed and the day recorded no edition past it; read the error line before the next firing.`;
  if (ledger.selectionOutcome === "held") return "Every enabled source failed, so no story could be judged; check the network allowlist and the source registry before the next firing.";
  if (ledger.selectionOutcome === "NO_EDITION") return "No material story cleared the gates today; nothing to post. The next scan is tomorrow's 05:00 Prague firing.";
  const valid = WEBDEV_LOCALES.filter((locale) => ledger.editions.get(locale)?.state === "valid");
  const rendered = WEBDEV_LOCALES.filter((locale) => ledger.editions.get(locale)?.renderState === "rendered");
  if (rendered.length === WEBDEV_LOCALES.length) return "Both locale carousels are rendered; post them by hand from the Design & delivery tab. Publishing stays disabled and nothing is queued.";
  if (valid.length === 0) return "Both locale packages are held; read the hold reasons before anything is posted.";
  return `Post only what is rendered (${rendered.join(", ") || "nothing"}); the other locale is held or unrendered and its reason is in the error lines.`;
}

function toRun(ledger: WebDevDayLedger, idempotencyKey: string): WebDevRun {
  return WebDevRunSchema.parse({
    schemaVersion: "webdev-run/1",
    phase: "webdev-signal-daily",
    pragueDate: ledger.pragueDate,
    mode: ledger.mode,
    idempotencyKey,
    sourceOutcomes: ledger.sourceOutcomes.slice(0, 100),
    counts: ledger.counts,
    selectionOutcome: ledger.selectionOutcome,
    selectionRef: ledger.selectionRef,
    briefRef: ledger.briefRef,
    packageRefs: ledger.packageRefs,
    renderRefs: ledger.renderRefs.slice(0, 2),
    queueRefs: [],
    model: {
      reservations: ledger.editorial?.reservations ?? 0,
      calls: ledger.editorial?.calls ?? 0,
      provider: ledger.editorial?.provider ?? null,
      model: ledger.editorial?.model ?? null,
      reservedUsd: ledger.editorial?.reservedUsd ?? 0,
      actualUsd: ledger.editorial?.actualUsd ?? 0
    },
    cache: { unchangedSources: ledger.unchangedSources, reusedArtifacts: ledger.reusedArtifacts, providerCallsAvoided: 0 },
    errors: ledger.errors.slice(0, 50),
    nextSafeAction: nextSafeAction(ledger)
  });
}

export async function runWebDevSignalDaily(input: RunWebDevSignalDailyInput): Promise<WebDevSignalDailyResult> {
  const now = input.now.toISOString();
  const pragueDate = pragueClockParts(input.now).date;
  const mode = input.dry ? "fixture" : "live";
  const stateRoot = input.root ?? (input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : defaultStateRoot);
  const configRoot = input.configRoot ?? defaultConfigRoot;
  const registration = await loadWebDevSignalRegistration(configRoot);
  const refs = webDevDayRefs(registration.schedule.statePath, pragueDate);
  const previous = await readWebDevRun(stateRoot, refs.run);
  if (previous.run) return { status: "already_recorded", pragueDate, run: previous.run, runRef: refs.run, artifacts: [] };

  const registry = await loadWebDevSourceRegistry(configRoot);
  const dispatch = dispatchWebDevSignalRegistration({
    registration,
    dispatcherPhase: input.dispatcherPhase ?? registration.schedule.dispatcherAnchorPhase,
    pragueDate,
    mode,
    sourceAuthorityAvailable: collectableWebDevSources(registry).length > 0
  });
  if (dispatch === null) return { status: "not-anchored", pragueDate, run: null, runRef: null, artifacts: [] };
  if (dispatch.decision === "held") {
    await writeWebDevJson(stateRoot, refs.run, dispatch.run);
    return { status: "recorded", pragueDate, run: dispatch.run, runRef: refs.run, artifacts: [refs.run] };
  }

  let selectionConfig: WebDevSelectionConfig;
  let editorConfig: WebDevEditorConfig;
  try {
    selectionConfig = await loadWebDevSelectionConfig(configRoot);
    editorConfig = await loadWebDevEditorConfig(configRoot);
  } catch (error) {
    // A day whose configuration will not parse did nothing, and the receipt says which file.
    const run = webDevZeroRun({
      pragueDate,
      mode,
      errors: [{ code: "config-failed", sourceId: null, message: errorMessage(error) }],
      nextSafeAction: "The selection or editor configuration would not parse; fix it before the next firing. Nothing was fetched or written."
    });
    await writeWebDevJson(stateRoot, refs.run, run);
    return { status: "recorded", pragueDate, run, runRef: refs.run, artifacts: [refs.run] };
  }

  const ledger: WebDevDayLedger = {
    now,
    pragueDate,
    mode,
    stateRoot,
    configRoot,
    registration,
    registry,
    selectionConfig,
    editorConfig,
    refs,
    transport: { fetchImpl: input.fetchImpl, resolveImpl: input.resolveImpl, delayImpl: input.delayImpl },
    health: [],
    sourceOutcomes: [],
    counts: { candidates: 0, new: 0, updated: 0, duplicate: 0, malformed: 0 },
    unchangedSources: 0,
    reusedArtifacts: 0,
    errors: [],
    artifacts: [],
    metrics: null,
    selectionOutcome: "NO_EDITION",
    selectionRef: null,
    briefRef: null,
    packageRefs: [],
    renderRefs: [],
    editorial: null,
    editions: new Map(),
    selectedRecordId: null,
    scoreMargin: null,
    confidence: null,
    stage: "collect"
  };
  if (previous.malformed) note(ledger, "previous-receipt-malformed", "A receipt for this day existed but could not be parsed; the day was run again and the receipt replaced.");
  await runWebDevSignalStages(ledger);
  const run = toRun(ledger, dispatch.idempotencyKey);
  await writeWebDevJson(stateRoot, refs.run, run);
  ledger.artifacts.push(refs.run);
  return { status: "recorded", pragueDate, run, runRef: refs.run, artifacts: [...new Set(ledger.artifacts)] };
}
