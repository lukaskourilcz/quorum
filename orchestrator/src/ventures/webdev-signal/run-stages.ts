import path from "node:path";
import type {
  WebDevCandidate,
  WebDevEditionPackage,
  WebDevEvidenceBrief,
  WebDevRecord,
  WebDevRun,
  WebDevSelection
} from "../../contracts/webdev-signal.js";
import { resolveWebDevSignalOutput } from "./capabilities.js";
import {
  createWebDevDesignPayload,
  persistWebDevRenderedDesign,
  readWebDevRenderReceipt,
  renderWebDevSignalDesign,
  webDevDesignPayloadRef,
  webDevRenderReceiptRef
} from "./design-lab.js";
import { buildWebDevEvidenceBrief } from "./editor/brief.js";
import { runWebDevEditor } from "./editor/model.js";
import { acceptWebDevPackage, holdWebDevPackage } from "./editor/packages.js";
import { webDevSignalFixtureBodies } from "./fixtures.js";
import { writeWebDevObservation } from "./observation-store.js";
import { buildWebDevObservation } from "./observations.js";
import { resolveWebDevSignalFeature } from "./registration.js";
import { WEBDEV_LOCALES, errorMessage, note, type WebDevDayLedger, type WebDevLocale } from "./run-ledger.js";
import {
  readWebDevCandidateFile,
  readWebDevCandidateWindow,
  readWebDevSelectionHistory,
  webDevStateRelativePath,
  writeWebDevJson
} from "./run-store.js";
import { decideWebDevEdition } from "./selection/decision.js";
import { emptyWebDevSourceCache, loadWebDevSourceCache, writeWebDevSourceCache, type WebDevSourceCache } from "./sources/cache.js";
import { collectWebDevSources, type WebDevSourceHealth } from "./sources/collect.js";

/**
 * The stages of one day, each writing what it established to the ledger and to disk.
 *
 * Every stage calls the venture's existing library — the collector, the decision, the brief, the
 * deterministic editor, the Design Lab boundary — and adds only the day's bookkeeping around it:
 * which file, which ref, which error line. A stage that cannot finish throws, and `runStages`
 * charges the throw to the stage it was in; the observation is written afterwards whatever
 * happened, because a day that was not observed reads the same as a day that never ran.
 */

type SourceOutcome = WebDevRun["sourceOutcomes"][number]["outcome"];

const READABLE_STATES = new Set<WebDevSourceHealth["runtimeState"]>(["healthy", "empty", "unchanged", "malformed"]);

function sourceOutcomeFor(health: WebDevSourceHealth): SourceOutcome | null {
  switch (health.runtimeState) {
    case "healthy": return "success";
    case "empty": return "empty";
    case "unchanged": return "unchanged";
    case "malformed": return "malformed";
    case "held": return "held";
    case "failed": return health.layoutChanged ? "layout-changed" : "failed";
    case "backoff": return "failed";
    case "disabled": return null;
  }
}

function candidateKey(candidate: WebDevCandidate): string {
  return `${candidate.sourceId}|${candidate.sourceItemId}`;
}

function orderCandidates(candidates: Iterable<WebDevCandidate>): WebDevCandidate[] {
  return [...candidates].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)
    || left.sourceId.localeCompare(right.sourceId)
    || left.sourceItemId.localeCompare(right.sourceItemId));
}

async function loadSourceCache(ledger: WebDevDayLedger, cachePath: string): Promise<WebDevSourceCache> {
  if (ledger.mode !== "live") return emptyWebDevSourceCache();
  try {
    return await loadWebDevSourceCache(cachePath);
  } catch (error) {
    note(ledger, "source-cache-malformed", `The conditional-request cache could not be read and was reset: ${errorMessage(error)}`);
    return emptyWebDevSourceCache();
  }
}

async function collect(ledger: WebDevDayLedger): Promise<{ collected: WebDevCandidate[]; readable: boolean }> {
  const cachePath = path.join(ledger.stateRoot, webDevStateRelativePath(ledger.refs.sourceCache));
  const result = await collectWebDevSources({
    registry: ledger.registry,
    cache: await loadSourceCache(ledger, cachePath),
    now: ledger.now,
    mode: ledger.mode,
    ...(ledger.mode === "fixture" ? { fixtureBodies: webDevSignalFixtureBodies(ledger.registry, ledger.now) } : {}),
    ...(ledger.transport.fetchImpl ? { fetchImpl: ledger.transport.fetchImpl } : {}),
    ...(ledger.transport.resolveImpl ? { resolveImpl: ledger.transport.resolveImpl } : {}),
    ...(ledger.transport.delayImpl ? { delayImpl: ledger.transport.delayImpl } : {})
  });
  ledger.health = result.health;
  for (const entry of result.health) {
    const outcome = sourceOutcomeFor(entry);
    if (outcome === null) continue;
    ledger.sourceOutcomes.push({
      sourceId: entry.sourceId,
      outcome,
      fetched: entry.itemsFetched,
      kept: entry.itemsKept,
      dropped: entry.malformedItems + entry.filteredItems
    });
    ledger.counts.malformed += entry.malformedItems;
    if (entry.runtimeState === "unchanged") ledger.unchangedSources += 1;
    if (entry.runtimeState === "malformed") note(ledger, "source-items-dropped", `${entry.malformedItems} malformed items were isolated.`, entry.sourceId);
    if (outcome === "failed" || outcome === "held" || outcome === "layout-changed") {
      note(ledger, `source-${entry.runtimeState}`, entry.reason, entry.sourceId);
    }
  }
  if (result.cacheMutationAllowed) await writeWebDevSourceCache(cachePath, result.nextCache);
  return { collected: result.candidates, readable: result.health.some((entry) => READABLE_STATES.has(entry.runtimeState)) };
}

async function windowCandidates(ledger: WebDevDayLedger, collected: readonly WebDevCandidate[]): Promise<WebDevCandidate[]> {
  const stored = await readWebDevCandidateWindow(ledger.stateRoot, ledger.refs, {
    pragueDate: ledger.pragueDate,
    days: ledger.selectionConfig.thresholds.securityFreshnessDays
  });
  if (stored.dropped > 0) note(ledger, "candidate-window-dropped", `${stored.dropped} stored candidates could not be parsed and were dropped.`);
  const known = new Map(stored.candidates.map((candidate) => [candidateKey(candidate), candidate]));
  const merged = new Map(known);
  for (const candidate of collected) {
    const prior = known.get(candidateKey(candidate));
    if (!prior) ledger.counts.new += 1;
    else if (prior.contentHash !== candidate.contentHash) ledger.counts.updated += 1;
    else ledger.counts.duplicate += 1;
    merged.set(candidateKey(candidate), candidate);
  }
  // Today's file is a union with what an earlier attempt of the same day stored: a retry after a
  // crash sees 304s from the sources the first attempt already read, and must not lose them.
  const today = await readWebDevCandidateFile(ledger.stateRoot, ledger.refs.candidates);
  const todayMerged = new Map(today.candidates.map((candidate) => [candidateKey(candidate), candidate]));
  for (const candidate of collected) todayMerged.set(candidateKey(candidate), candidate);
  await writeWebDevJson(ledger.stateRoot, ledger.refs.candidates, orderCandidates(todayMerged.values()));
  ledger.artifacts.push(ledger.refs.candidates);
  ledger.counts.candidates = merged.size;
  return orderCandidates(merged.values());
}

function selectionMargin(selection: WebDevSelection): { margin: number | null; confidence: number | null } {
  const passing = selection.candidates
    .filter((candidate) => candidate.gate === "eligible"
      && candidate.baseScore !== null && candidate.finalScore !== null && candidate.confidence !== null
      && candidate.baseScore >= selection.threshold.minimumBaseScore
      && candidate.confidence >= selection.threshold.minimumConfidence)
    .sort((left, right) => right.finalScore! - left.finalScore!);
  const winner = passing.find((candidate) => candidate.recordId === selection.selectedRecordId) ?? passing[0];
  const runnerUp = passing.find((candidate) => candidate !== winner);
  return {
    margin: winner && runnerUp ? Math.round((winner.finalScore! - runnerUp.finalScore!) * 1_000) / 1_000 : null,
    confidence: winner?.confidence ?? null
  };
}

async function select(ledger: WebDevDayLedger, candidates: readonly WebDevCandidate[]): Promise<{ record: WebDevRecord; selection: WebDevSelection } | null> {
  // As far back as a candidate can still be alive: the window keeps candidates that long, so a
  // record selected inside it must stay in the history that marks it a duplicate.
  const history = await readWebDevSelectionHistory(ledger.stateRoot, ledger.refs, {
    pragueDate: ledger.pragueDate,
    days: ledger.selectionConfig.thresholds.securityFreshnessDays
  });
  if (history.dropped > 0) note(ledger, "history-dropped", `${history.dropped} earlier selected records could not be parsed and were dropped from the cooldown history.`);
  const goviral = resolveWebDevSignalFeature({ registration: ledger.registration, feature: "goviralOverlay", authorityAvailable: false });
  const decided = decideWebDevEdition({
    candidates,
    pragueDate: ledger.pragueDate,
    now: ledger.now,
    config: ledger.selectionConfig,
    history: history.history,
    goviralCapabilityDecision: goviral.decision
  });
  await writeWebDevJson(ledger.stateRoot, ledger.refs.selection, decided.selection);
  ledger.artifacts.push(ledger.refs.selection);
  ledger.selectionRef = ledger.refs.selection;
  ledger.metrics = decided.metrics;
  const margin = selectionMargin(decided.selection);
  ledger.scoreMargin = margin.margin;
  ledger.confidence = margin.confidence;
  if (decided.selection.outcome !== "selected") {
    ledger.selectionOutcome = "NO_EDITION";
    return null;
  }
  const record = decided.records.find((candidate) => candidate.id === decided.selection.selectedRecordId);
  if (!record) throw new Error(`selected record ${decided.selection.selectedRecordId} is missing from the decision`);
  await writeWebDevJson(ledger.stateRoot, ledger.refs.record, record);
  ledger.artifacts.push(ledger.refs.record);
  ledger.selectionOutcome = "selected";
  ledger.selectedRecordId = record.id;
  return { record, selection: decided.selection };
}

interface ApprovedPackage {
  locale: WebDevLocale;
  edition: WebDevEditionPackage;
}

async function edit(
  ledger: WebDevDayLedger,
  record: WebDevRecord,
  selection: WebDevSelection
): Promise<{ brief: WebDevEvidenceBrief; approved: ApprovedPackage[] }> {
  const brief = buildWebDevEvidenceBrief({ record, selection, selectionRef: ledger.refs.selection });
  await writeWebDevJson(ledger.stateRoot, ledger.refs.brief, brief);
  ledger.artifacts.push(ledger.refs.brief);
  ledger.briefRef = ledger.refs.brief;
  // Deterministic only: no route, no authority and no headroom are passed, so the editor cannot
  // reach a provider even if synthesis were switched on by mistake.
  const editor = await runWebDevEditor({
    brief,
    briefRef: ledger.refs.brief,
    record,
    limits: ledger.editorConfig.limits,
    strategy: "deterministic",
    authorityAvailable: false,
    authorityCeilingUsd: null,
    companyHeadroomUsd: 0,
    ventureMonthRemainingUsd: 0,
    now: ledger.now,
    config: ledger.editorConfig,
    route: null
  });
  ledger.editorial = editor.receipt;
  const approved: ApprovedPackage[] = [];
  for (const locale of WEBDEV_LOCALES) {
    const drafted = editor.packages[locale];
    if (!drafted) {
      ledger.editions.set(locale, { locale, state: "absent", claimParity: "unavailable" });
      note(ledger, "package-missing", `The deterministic editor produced no ${locale} package.`);
      continue;
    }
    let stored = drafted;
    if (drafted.status === "draft") {
      try {
        stored = acceptWebDevPackage(drafted);
      } catch (error) {
        stored = holdWebDevPackage(drafted, [`acceptance-refused: ${errorMessage(error)}`]);
      }
    }
    const ref = ledger.refs.package(locale);
    await writeWebDevJson(ledger.stateRoot, ref, stored);
    ledger.artifacts.push(ref);
    ledger.packageRefs.push(ref);
    if (stored.status === "approved") {
      approved.push({ locale, edition: stored });
      ledger.editions.set(locale, { locale, state: "valid", claimParity: "pass", renderState: "absent", deliveryState: "held" });
    } else {
      const reason = stored.heldReason ?? "held";
      ledger.editions.set(locale, { locale, state: "held", holdReasons: [reason.slice(0, 240)], claimParity: "fail", renderState: "absent", deliveryState: "absent" });
      note(ledger, "package-held", reason);
    }
  }
  return { brief, approved };
}

async function existingReceipt(ledger: WebDevDayLedger, receiptRef: string) {
  try {
    return await readWebDevRenderReceipt(ledger.stateRoot, receiptRef);
  } catch {
    return null;
  }
}

async function render(
  ledger: WebDevDayLedger,
  brief: WebDevEvidenceBrief,
  record: WebDevRecord,
  approved: readonly ApprovedPackage[]
): Promise<void> {
  if (approved.length === 0) return;
  const capability = await resolveWebDevSignalOutput({
    target: "design-lab",
    capability: "bounded-render-summary",
    schemaVersion: "bounded-render-summary/1"
  }, { configRoot: ledger.configRoot });
  const rendering = resolveWebDevSignalFeature({
    registration: ledger.registration,
    feature: "designLabRendering",
    authorityAvailable: capability.decision === "allowed"
  });
  if (rendering.decision !== "allowed") {
    note(ledger, "render-held", rendering.reason);
    for (const { locale } of approved) ledger.editions.get(locale)!.renderState = "held";
    return;
  }
  for (const { locale, edition } of approved) {
    const observed = ledger.editions.get(locale)!;
    try {
      const payload = createWebDevDesignPayload({ edition, editionRef: ledger.refs.package(locale), brief, record });
      const payloadRef = webDevDesignPayloadRef(payload);
      const receiptRef = webDevRenderReceiptRef(payload);
      const existing = await existingReceipt(ledger, receiptRef);
      const design = await renderWebDevSignalDesign({
        payload,
        payloadRef,
        startedAt: new Date().toISOString(),
        configRoot: ledger.configRoot,
        existingReceipt: existing,
        existingReceiptRef: existing ? receiptRef : null
      });
      await persistWebDevRenderedDesign(ledger.stateRoot, design);
      ledger.renderRefs.push(design.receiptRef);
      ledger.artifacts.push(payloadRef, design.receiptRef, ...design.assets.map((asset) => asset.ref));
      if (design.receipt.cache.status === "reused") ledger.reusedArtifacts += 1;
      const checks = design.receipt.checks;
      observed.renderState = design.receipt.outcome === "success" ? "rendered" : "held";
      observed.accessibility = checks.contrast === "pass" && checks.textFit === "pass" && checks.statusNonColor === "pass" ? "pass" : "fail";
      if (design.receipt.outcome !== "success") note(ledger, "render-held", `${locale}: ${design.receipt.reason ?? "held"}`);
    } catch (error) {
      observed.renderState = "held";
      note(ledger, "render-failed", `${locale}: ${errorMessage(error)}`);
    }
  }
}

async function observe(ledger: WebDevDayLedger): Promise<void> {
  const observation = buildWebDevObservation({
    date: ledger.pragueDate,
    now: ledger.now,
    provenance: ledger.mode,
    metrics: ledger.metrics,
    health: ledger.health,
    editions: WEBDEV_LOCALES.flatMap((locale) => ledger.editions.get(locale) ?? []),
    refs: {
      runRef: ledger.refs.run,
      selectionRef: ledger.selectionRef,
      evidenceBriefRef: ledger.briefRef,
      packageRefs: ledger.packageRefs,
      renderReceiptRefs: ledger.renderRefs,
      profileRefs: ledger.registration.editions.map((edition) => edition.profileRef),
      sourceHealthRefs: []
    },
    selectedRecordId: ledger.selectedRecordId,
    scoreMargin: ledger.scoreMargin,
    confidence: ledger.confidence
  });
  ledger.artifacts.push(`state/${await writeWebDevObservation(ledger.stateRoot, observation)}`);
}

async function chain(ledger: WebDevDayLedger): Promise<void> {
  ledger.stage = "collect";
  const { collected, readable } = await collect(ledger);
  if (!readable) {
    note(ledger, "no-source", "Every enabled source failed or was held, so nothing could be judged.");
    ledger.selectionOutcome = "held";
    return;
  }
  const candidates = await windowCandidates(ledger, collected);
  ledger.stage = "select";
  const selected = await select(ledger, candidates);
  if (!selected) return;
  ledger.stage = "edit";
  const { brief, approved } = await edit(ledger, selected.record, selected.selection);
  ledger.stage = "render";
  await render(ledger, brief, selected.record, approved);
}

/** The chain, then the observation: whatever the chain did or failed to do, the day is observed. */
export async function runWebDevSignalStages(ledger: WebDevDayLedger): Promise<void> {
  try {
    await chain(ledger);
  } catch (error) {
    note(ledger, `${ledger.stage}-failed`, errorMessage(error));
    if (ledger.stage === "collect") ledger.selectionOutcome = "held";
  }
  try {
    ledger.stage = "observe";
    await observe(ledger);
  } catch (error) {
    note(ledger, "observe-failed", errorMessage(error));
  }
}
