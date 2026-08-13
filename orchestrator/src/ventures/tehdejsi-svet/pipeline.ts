import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BudgetLedgerEntrySchema, type ReserveContext } from "../../budget.js";
import { remainingScheduledCycles } from "../../cycle/ledger.js";
import { TehdejsiRecommendationSchema, type TehdejsiRecommendation } from "../../contracts/tehdejsi-recommendation.js";
import { TehdejsiShortlistSchema } from "../../contracts/tehdejsi-shortlist.js";
import { TsStoryBriefSchema, type TsStoryBrief } from "../../contracts/ts-story-brief.js";
import { guardedJsonCall, type GuardedCallInput } from "../../llm/call.js";
import { loadFixedMonthlyUsd } from "../../money/fixed-costs.js";
import { configRoot, repoRoot } from "../../paths.js";
import { loadRuntimeBudgetLimits } from "../../portfolio/limits.js";
import { atomicWriteJson, readJson } from "../../state.js";
import type { Stage } from "../../types.js";
import { generateTsStoryBriefs } from "./briefs.js";
import { loadTehdejsiFacts } from "./facts.js";
import { loadTerminologyTable } from "./lints.js";
import {
  draftPath,
  gateTsPackage,
  tallyDrops,
  type TsPriorFeature,
  type TsProductionVerdict
} from "./production-gates.js";
import { produceBilingualDraft } from "./produce.js";
import { buildTehdejsiDeckPack } from "./render.js";
import { buildShortlist } from "./scorer.js";
import { readTehdejsiGoViralContext } from "./goviral.js";
import { readTehdejsiPerformanceWeights } from "./performance.js";
import {
  applyTehdejsiCycleDay,
  createTehdejsiCycle,
  readTehdejsiCycle,
  tehdejsiCycleComplete,
  writeTehdejsiCycle
} from "./state.js";

const ModelRouteSchema = z.strictObject({
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().min(1),
  maxInputTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive()
});
type ModelRoute = z.infer<typeof ModelRouteSchema>;

export interface TehdejsiPipelineOutcome {
  phase: "planning" | "production";
  completed: boolean;
  status: "PLAN" | "NO_ACTION";
  summary: string;
  spendUsd: number;
  participants: Array<"LETOPIS" | "VERBA">;
  artifacts: string[];
}

export interface TehdejsiPipelineInput {
  root: string;
  executionCycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  call?: typeof guardedJsonCall;
}

function stableCycleId(startedOn: string): string {
  return `ts-${startedOn}`;
}

function briefPath(briefId: string): string {
  return `ventures/tehdejsi-svet/briefs/${briefId}.json`;
}

async function recordedBriefsForCycle(input: {
  root: string;
  cycleId: string;
  factIds: readonly string[];
}): Promise<TsStoryBrief[]> {
  const directory = path.join(input.root, "ventures/tehdejsi-svet/briefs");
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    throw new Error(`Production has no recorded briefs for cycle ${input.cycleId}`);
  }
  const wanted = new Set(input.factIds);
  const byFactId = new Map<string, TsStoryBrief>();
  for (const name of names) {
    try {
      const parsed = TsStoryBriefSchema.safeParse(JSON.parse(await readFile(path.join(directory, name), "utf8")));
      if (!parsed.success || parsed.data.cycleId !== input.cycleId) continue;
      for (const factId of parsed.data.factIds) {
        if (!wanted.has(factId)) continue;
        if (byFactId.has(factId)) throw new Error(`Production found duplicate recorded briefs for ${factId}`);
        byFactId.set(factId, parsed.data);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Production found duplicate")) throw error;
      // Unreadable and unrelated files do not become production evidence.
    }
  }
  const missing = input.factIds.filter((factId) => !byFactId.has(factId));
  if (missing.length > 0) throw new Error(`Production has no recorded brief for ${missing.join(", ")}`);
  return input.factIds.map((factId) => byFactId.get(factId)!);
}

function productionPath(date: string): string {
  return `ventures/tehdejsi-svet/production/${date}.json`;
}

async function modelRoutesAndPrompts(): Promise<{
  letopis: ModelRoute;
  verba: ModelRoute;
  planningSystem: string;
  czechSystem: string;
  ukrainianSystem: string;
}> {
  const [modelsRaw, letopis, verba, craft] = await Promise.all([
    readFile(path.join(configRoot, "models.json"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/prompts/tehdejsi-svet/letopis.md"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/prompts/tehdejsi-svet/verba.md"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/prompts/tehdejsi-svet/craft.md"), "utf8")
  ]);
  const models = JSON.parse(modelsRaw) as { roles?: Record<string, unknown> };
  const letopisRoute = ModelRouteSchema.parse(models.roles?.LETOPIS);
  const verbaRoute = ModelRouteSchema.parse(models.roles?.VERBA);
  return {
    letopis: letopisRoute,
    verba: verbaRoute,
    planningSystem: `${letopis.trim()}\n\n${craft.trim()}`,
    czechSystem: `${letopis.trim()}\n\n${craft.trim()}`,
    ukrainianSystem: `${verba.trim()}\n\n${craft.trim()}`
  };
}

async function reserveContext(input: TehdejsiPipelineInput): Promise<ReserveContext> {
  const [ledger, fixedMonthlyUsd, limits] = await Promise.all([
    readJson<{ entries?: unknown[] }>(input.root, "budget/ledger.json", { entries: [] }),
    loadFixedMonthlyUsd(configRoot, input.now),
    loadRuntimeBudgetLimits()
  ]);
  return {
    now: input.now,
    cycleId: input.executionCycleId,
    stage: input.stage,
    ledger: (ledger.entries ?? []).map((entry) => BudgetLedgerEntrySchema.parse(entry)),
    allInNonApiSpentUsd: fixedMonthlyUsd,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    remainingScheduledCycles: remainingScheduledCycles(input.now),
    limits
  };
}

function paidCall(
  input: TehdejsiPipelineInput,
  routes: Readonly<Record<string, ModelRoute>>
): typeof guardedJsonCall {
  const invoke = input.call ?? guardedJsonCall;
  return (async (request: GuardedCallInput<unknown>) => {
    const route = routes[request.agent];
    if (!route) throw new Error(`No Tehdejsi svet model route for ${request.agent}`);
    const estimatedInputTokens = Math.ceil((request.system.length + request.input.length) / 3.5);
    if (estimatedInputTokens > route.maxInputTokens) {
      throw new Error(`${request.agent} packet estimate ${estimatedInputTokens} exceeds ${route.maxInputTokens} tokens`);
    }
    return invoke({ ...request, budgetContext: await reserveContext(input) });
  }) as typeof guardedJsonCall;
}

async function priorFeatures(root: string): Promise<TsPriorFeature[]> {
  const directory = path.join(root, "ventures/tehdejsi-svet/drafts");
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const features: TsPriorFeature[] = [];
  for (const name of names) {
    try {
      const parsed = TehdejsiRecommendationSchema.safeParse(
        JSON.parse(await readFile(path.join(directory, name), "utf8"))
      );
      if (!parsed.success) continue;
      features.push({
        id: parsed.data.id,
        date: parsed.data.date,
        factIds: parsed.data.evidence.factIds,
        ctaKind: parsed.data.payload.ctaKind,
        slidesCs: parsed.data.payload.slides.map(({ cs }) => cs),
        slidesUa: parsed.data.payload.slides.map(({ ua }) => ua)
      });
    } catch {
      // One unreadable draft costs one history item. The current package still gets judged.
    }
  }
  return features;
}

function buildRecommendation(input: {
  brief: TsStoryBrief;
  draft: Awaited<ReturnType<typeof produceBilingualDraft>>;
  date: string;
  now: Date;
}): TehdejsiRecommendation {
  const recommendation = TehdejsiRecommendationSchema.parse({
    schemaVersion: "venture-recommendation/1",
    id: `ts-${input.brief.briefId}`,
    ventureId: "tehdejsi-svet",
    date: input.date,
    cycleId: input.brief.cycleId,
    status: "draft",
    evidence: {
      kind: "tehdejsi-story",
      factsHash: input.brief.factsHash,
      factIds: input.brief.factIds,
      shortlistRef: input.brief.shortlistRef,
      dossierRefs: input.brief.dossierRefs,
      sensitivityTier: input.brief.sensitivityTier,
      tierRaisedBy: input.brief.tierRaisedBy,
      terminologyCheck: {
        tableVersion: "tehdejsi-terminology/1",
        checkedAt: input.now.toISOString(),
        findings: []
      }
    },
    payload: {
      slides: input.draft.slides,
      captionCs: input.draft.captionCs,
      captionUa: input.draft.captionUa,
      ctaKind: input.brief.ctaKind
    },
    media: [{
      slideOrdinal: 1,
      source: "Tehdejší svět render",
      sourceUrl: null,
      licence: "own-render",
      attribution: ""
    }],
    humanReviewRequired: input.brief.sensitivityTier === 2,
    humanReviewedAt: null,
    designLab: { summaryPath: null, readyAt: null },
    owner: { postedUrls: { cs: null, ua: null }, rejectionReason: null },
    generatedAt: input.now.toISOString(),
    updatedAt: input.now.toISOString()
  });
  // The production gate controls truth and safety; this join controls whether the Studio can draw
  // the package at all. A recommendation that cannot form a complete payload is dropped here.
  buildTehdejsiDeckPack(recommendation);
  return recommendation;
}

async function planningDay(
  input: TehdejsiPipelineInput,
  cycle: NonNullable<Awaited<ReturnType<typeof readTehdejsiCycle>>>
): Promise<TehdejsiPipelineOutcome> {
  const [facts, goViral, performance] = await Promise.all([
    loadTehdejsiFacts(),
    readTehdejsiGoViralContext(input.root, input.date),
    readTehdejsiPerformanceWeights(input.root)
  ]);
  const shortlist = TehdejsiShortlistSchema.parse(buildShortlist({
    facts: facts.facts,
    factsHash: facts.contentHash,
    date: input.date,
    goViral,
    performanceWeights: performance.dimensions
  }));
  const shortlistPath = `ventures/tehdejsi-svet/shortlists/${input.date}.json`;
  await atomicWriteJson(input.root, shortlistPath, shortlist);
  const config = await modelRoutesAndPrompts();
  const result = await generateTsStoryBriefs({
    cycleId: stableCycleId(cycle.startedOn),
    date: input.date,
    shortlist,
    facts: facts.facts,
    factsHash: facts.contentHash,
    shortlistRef: `state/${shortlistPath}`,
    generatedAt: input.now,
    callConfig: {
      stateRoot: input.root,
      cycleId: input.executionCycleId,
      phase: "ts-desk",
      ventureId: "tehdejsi-svet",
      agent: "LETOPIS",
      provider: config.letopis.provider,
      model: config.letopis.model,
      system: config.planningSystem,
      maxOutputTokens: config.letopis.maxOutputTokens,
      budgetContext: await reserveContext(input)
    },
    call: paidCall(input, { LETOPIS: config.letopis, VERBA: config.verba })
  });
  const artifacts = [shortlistPath];
  for (const brief of result.briefs) {
    const relative = briefPath(brief.briefId);
    await atomicWriteJson(input.root, relative, brief);
    artifacts.push(relative);
  }
  const completed = result.briefs.length > 0;
  artifacts.push(await writeTehdejsiCycle(input.root, applyTehdejsiCycleDay({
    cycle,
    date: input.date,
    now: input.now,
    outcome: completed
      ? { completed: true, chosenFactIds: result.briefs.flatMap(({ factIds }) => factIds), shortlistRef: `state/${shortlistPath}` }
      : { completed: false, pressure: "no-candidate" }
  })));
  return {
    phase: "planning",
    completed,
    status: completed ? "PLAN" : "NO_ACTION",
    summary: completed
      ? `LETOPIS recorded ${result.briefs.length} canonical story brief${result.briefs.length === 1 ? "" : "s"}; production is next.`
      : "No candidate became a valid story brief. The planning phase stays active.",
    spendUsd: result.usd,
    participants: ["LETOPIS"],
    artifacts
  };
}

async function productionDay(
  input: TehdejsiPipelineInput,
  cycle: NonNullable<Awaited<ReturnType<typeof readTehdejsiCycle>>>
): Promise<TehdejsiPipelineOutcome> {
  const [facts, table, config, history] = await Promise.all([
    loadTehdejsiFacts(),
    loadTerminologyTable(),
    modelRoutesAndPrompts(),
    priorFeatures(input.root)
  ]);
  const briefs = await recordedBriefsForCycle({
    root: input.root,
    cycleId: stableCycleId(cycle.startedOn),
    factIds: cycle.chosenFactIds
  });
  const verdicts: TsProductionVerdict[] = [];
  const artifacts: string[] = [];
  let spendUsd = 0;
  let stored = 0;
  const call = paidCall(input, { LETOPIS: config.letopis, VERBA: config.verba });
  for (const brief of briefs) {
    const draft = await produceBilingualDraft({
      brief,
      table,
      callConfig: {
        czech: {
          stateRoot: input.root,
          cycleId: input.executionCycleId,
          phase: "ts-desk",
          ventureId: "tehdejsi-svet",
          agent: "LETOPIS",
          provider: config.letopis.provider,
          model: config.letopis.model,
          system: config.czechSystem,
          maxOutputTokens: config.letopis.maxOutputTokens,
          cacheResponse: false,
          budgetContext: await reserveContext(input)
        },
        ukrainian: {
          stateRoot: input.root,
          cycleId: input.executionCycleId,
          phase: "ts-desk",
          ventureId: "tehdejsi-svet",
          agent: "VERBA",
          provider: config.verba.provider,
          model: config.verba.model,
          system: config.ukrainianSystem,
          maxOutputTokens: config.verba.maxOutputTokens,
          cacheResponse: false,
          budgetContext: await reserveContext(input)
        }
      },
      call
    });
    spendUsd = Number((spendUsd + draft.usd).toFixed(8));
    let verdict = gateTsPackage({ brief, draft, facts: facts.facts, priorFeatures: history, date: input.date });
    let recommendation: TehdejsiRecommendation | null = null;
    if (verdict.passed) {
      try {
        recommendation = buildRecommendation({ brief, draft, date: input.date, now: input.now });
      } catch (error) {
        verdict = {
          passed: false,
          issues: [{
            rule: "design-lab:unrenderable",
            detail: error instanceof Error ? error.message : "The package could not form a Studio payload."
          }]
        };
      }
    }
    verdicts.push(verdict);
    if (!recommendation || !verdict.passed) continue;
    const relative = draftPath(brief.cycleId, brief.briefId);
    const existing = await readJson<unknown | null>(input.root, relative, null);
    if (existing === null) await atomicWriteJson(input.root, relative, recommendation);
    else TehdejsiRecommendationSchema.parse(existing);
    artifacts.push(relative);
    stored += 1;
    history.push({
      id: recommendation.id,
      date: recommendation.date,
      factIds: recommendation.evidence.factIds,
      ctaKind: recommendation.payload.ctaKind,
      slidesCs: recommendation.payload.slides.map(({ cs }) => cs),
      slidesUa: recommendation.payload.slides.map(({ ua }) => ua)
    });
  }
  const tally = tallyDrops(verdicts);
  const receipt = productionPath(input.date);
  await atomicWriteJson(input.root, receipt, {
    schemaVersion: "tehdejsi-production/1",
    date: input.date,
    cycleId: stableCycleId(cycle.startedOn),
    ...tally,
    recommendationRefs: [...artifacts],
    generatedAt: input.now.toISOString()
  });
  artifacts.push(receipt);
  artifacts.push(await writeTehdejsiCycle(input.root, applyTehdejsiCycleDay({
    cycle,
    date: input.date,
    now: input.now,
    outcome: { completed: true }
  })));
  return {
    phase: "production",
    completed: true,
    status: stored > 0 ? "PLAN" : "NO_ACTION",
    summary: stored > 0
      ? `The desk stored ${stored} bilingual draft${stored === 1 ? "" : "s"}; ${tally.dropped} package${tally.dropped === 1 ? "" : "s"} failed a gate.`
      : `The desk completed production and stored no draft; all ${tally.dropped} packages failed a gate.`,
    spendUsd,
    participants: ["LETOPIS", "VERBA"],
    artifacts
  };
}

/** The countersigned live desk's two-day join. It never posts, publishes or opens a channel. */
export async function runTehdejsiPipelineDay(input: TehdejsiPipelineInput): Promise<TehdejsiPipelineOutcome> {
  let cycle = await readTehdejsiCycle(input.root);
  if (cycle === null || tehdejsiCycleComplete(cycle)) {
    cycle = createTehdejsiCycle({ date: input.date, now: input.now });
  }
  return cycle.phase === "planning" ? planningDay(input, cycle) : productionDay(input, cycle);
}
