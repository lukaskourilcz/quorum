import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BudgetLedgerEntrySchema } from "../budget.js";
import {
  evaluateQuarterlyKpis,
  runQuarterEndProtocol,
  writeQuarterlyKpiSnapshot,
  type QuarterlyKpiSnapshot
} from "../metrics/quarterly.js";
import { collectQuarterlyMeasurements, loadCurrentKpiSet } from "../metrics/quarterly-collector.js";
import { atomicWriteJson, atomicWriteText, readJson, readText } from "../state.js";
import { FixedCostRegistrySchema } from "./fixed-costs.js";
import {
  MonetizationMethodIdSchema,
  MonetizationMethodStateSchema,
  evaluateMonetizationMethods,
  writeMonetizationReadiness,
  type MonetizationMethodId,
  type MonetizationMethodState,
  type PublicMonetizationMethod
} from "./monetization.js";
import { buildPublicMoneySnapshot, writePublicMoneySnapshot } from "./public.js";

const DAY_MS = 86_400_000;

export interface QuarterlyKpiPacketSummary {
  snapshotRef: "state/kpis/latest.json";
  quarterId: string;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  unavailable: number;
  criticalMisses: string[];
}

function packetSummary(snapshot: QuarterlyKpiSnapshot): QuarterlyKpiPacketSummary {
  return {
    snapshotRef: "state/kpis/latest.json",
    quarterId: snapshot.quarterId,
    onTrack: snapshot.statuses.filter((status) => status.status === "on-track").length,
    atRisk: snapshot.statuses.filter((status) => status.status === "at-risk").length,
    offTrack: snapshot.statuses.filter((status) => status.status === "off-track").length,
    unavailable: snapshot.statuses.filter((status) => status.status === "unavailable").length,
    criticalMisses: snapshot.statuses
      .filter((status) => status.critical && ["off-track", "unavailable"].includes(status.status))
      .map((status) => status.id)
  };
}

async function readMonetizationStates(root: string): Promise<Partial<Record<MonetizationMethodId, MonetizationMethodState>>> {
  const raw = await readJson<unknown>(root, "money/status.json", null);
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const methods = value?.methods && typeof value.methods === "object" && !Array.isArray(value.methods)
    ? value.methods as Record<string, unknown>
    : {};
  const result: Partial<Record<MonetizationMethodId, MonetizationMethodState>> = {};
  for (const [id, candidate] of Object.entries(methods)) {
    const methodId = MonetizationMethodIdSchema.safeParse(id);
    const state = MonetizationMethodStateSchema.safeParse(candidate);
    if (methodId.success && state.success) result[methodId.data] = state.data;
  }
  return result;
}

async function persistMonetizationStates(input: {
  root: string;
  methods: readonly PublicMonetizationMethod[];
  previous: Partial<Record<MonetizationMethodId, MonetizationMethodState>>;
  now: Date;
}): Promise<string> {
  const methods: Partial<Record<MonetizationMethodId, MonetizationMethodState>> = {};
  for (const method of input.methods) {
    const before = input.previous[method.id];
    const proposalPreparedAt = before?.proposalPreparedAt
      ?? (method.readiness.met && method.proposal ? input.now.toISOString() : null);
    methods[method.id] = MonetizationMethodStateSchema.parse({
      status: method.status,
      proposalPreparedAt,
      ownerApprovalRef: method.status === "active" ? before?.ownerApprovalRef ?? null : null,
      updatedAt: input.now.toISOString()
    });
  }
  const relative = "money/status.json";
  await atomicWriteJson(input.root, relative, {
    schemaVersion: "monetization-status/1",
    methods,
    updatedAt: input.now.toISOString()
  });
  return relative;
}

async function addReadyProposalNotices(input: {
  repoRoot: string;
  methods: readonly PublicMonetizationMethod[];
}): Promise<boolean> {
  const ready = input.methods.filter((method) => method.readiness.met && method.proposal);
  if (ready.length === 0) return false;
  const relative = "docs/NEEDED.md";
  let content = await readText(input.repoRoot, relative, "# Needs your help now\n");
  const additions = ready.filter((method) => !content.includes(`MONETIZATION-PROPOSAL-${method.id}`));
  if (additions.length === 0) return false;
  if (!content.includes("## Monetization proposals ready for owner review")) {
    content = `${content.trimEnd()}\n\n## Monetization proposals ready for owner review\n`;
  }
  content = `${content.trimEnd()}\n\n${additions.map((method) =>
    `- [ ] **Review ${method.venture} earning proposal** — Read \`state/money/proposals/${method.id}.json\`. Activation remains blocked until you record an owner decision and complete its legal, account, and payment checklist. \`MONETIZATION-PROPOSAL-${method.id}\``
  ).join("\n")}\n`;
  await atomicWriteText(input.repoRoot, relative, content);
  return true;
}

export async function runDailyMoneyAndKpis(input: {
  repoRoot: string;
  stateRoot: string;
  now: Date;
  environment?: NodeJS.ProcessEnv;
  writeOwnerNotices?: boolean;
}): Promise<{
  summary: QuarterlyKpiPacketSummary;
  fixedMonthlyUsd: number;
  artifacts: string[];
}> {
  const environment = input.environment ?? process.env;
  const kpiSet = await loadCurrentKpiSet(path.join(input.repoRoot, "config"), input.now);
  const collected = await collectQuarterlyMeasurements({
    repoRoot: input.repoRoot,
    stateRoot: input.stateRoot,
    kpiSet,
    now: input.now,
    metricsIngestionEnabled: environment.METRICS_INGESTION_ENABLED === "true",
    mmaFilesIndexingEnabled: environment.MMA_FILES_INDEXING_ENABLED === "true"
  });
  const closesAt = new Date(`${kpiSet.quarter_start}T00:00:00.000Z`).getTime() + (kpiSet.quarter_days * DAY_MS);
  const reportPath = `kpis/reports/${kpiSet.quarter_id}.json`;
  const existingReport = await readJson<{ generatedAt?: string } | null>(input.stateRoot, reportPath, null);
  const reportOnTime = existingReport?.generatedAt
    ? Date.parse(existingReport.generatedAt) < closesAt + DAY_MS
    : input.now.getTime() >= closesAt && input.now.getTime() < closesAt + DAY_MS;
  if (input.now.getTime() >= closesAt) {
    (collected.measurements as Record<string, number | null>)["state/kpis/reports#on_time_reassessment"] = reportOnTime ? 1 : 0;
  }
  const snapshot = evaluateQuarterlyKpis({ kpiSet, measurements: collected.measurements, now: input.now });
  const artifacts = [await writeQuarterlyKpiSnapshot(input.stateRoot, snapshot)];
  if (snapshot.complete && !existingReport) {
    const quarterEnd = await runQuarterEndProtocol({
      root: input.stateRoot,
      kpiSet,
      measurements: collected.measurements,
      now: input.now
    });
    artifacts.push(
      quarterEnd.reportPath,
      quarterEnd.ownerDigestPath,
      ...quarterEnd.reassessmentPaths,
      "priority-queue.json"
    );
  }

  const previousStates = await readMonetizationStates(input.stateRoot);
  const monetization = evaluateMonetizationMethods({ measurements: collected.monetization, states: previousStates });
  const monetizationFiles = await writeMonetizationReadiness({ root: input.stateRoot, methods: monetization, generatedAt: input.now });
  artifacts.push(
    monetizationFiles.statePath,
    ...monetizationFiles.proposalPaths,
    await persistMonetizationStates({ root: input.stateRoot, methods: monetization, previous: previousStates, now: input.now })
  );

  const [fixedCosts, budgetLedger, financeLedger] = await Promise.all([
    readFile(path.join(input.repoRoot, "config", "fixed-costs.json"), "utf8").then((raw) => FixedCostRegistrySchema.parse(JSON.parse(raw))),
    readJson<unknown>(input.stateRoot, "budget/ledger.json", { schemaVersion: 1, entries: [] }),
    readJson<unknown>(input.stateRoot, "finance/ledger.json", { schemaVersion: 1, currency: "USD", entries: [] })
  ]);
  const entries = z.object({ schemaVersion: z.literal(1), entries: z.array(BudgetLedgerEntrySchema) }).parse(budgetLedger).entries;
  const publicSnapshot = buildPublicMoneySnapshot({
    generatedAt: input.now,
    kpiSnapshot: snapshot,
    monetization,
    fixedCosts,
    budgetEntries: entries,
    financeLedger
  });
  artifacts.push(await writePublicMoneySnapshot(input.stateRoot, publicSnapshot));
  if (input.writeOwnerNotices === true && await addReadyProposalNotices({ repoRoot: input.repoRoot, methods: monetization })) {
    artifacts.push("docs/NEEDED.md");
  }
  return {
    summary: packetSummary(snapshot),
    fixedMonthlyUsd: publicSnapshot.costs.fixed.monthlyUsd,
    artifacts: [...new Set(artifacts)]
  };
}
