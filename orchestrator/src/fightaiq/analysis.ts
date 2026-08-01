import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { FightAiQStatsEntrySchema, type BoutRecord, type FightAiQStatsEntry, type FighterRecord, type ModelRun } from "../contracts/mma.js";
import { atomicWriteJson } from "../state.js";
import { loadMmaModelConfig, runMmaModel, sha256, type FighterModelInput } from "./engine.js";

function fieldNumber(fighter: FighterRecord, name: string): number | null {
  const value = fighter.fields[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fieldText(fighter: FighterRecord, name: string): string | null {
  const value = fighter.fields[name]?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ageOn(fighter: FighterRecord, date: Date): number | null {
  const born = fieldText(fighter, "dateOfBirth");
  if (!born || Number.isNaN(Date.parse(born))) return null;
  return Math.floor((date.getTime() - Date.parse(born)) / 31_556_952_000);
}

function modelInput(fighter: FighterRecord, eventDate: Date): FighterModelInput | null {
  const age = ageOn(fighter, eventDate);
  if (!fighter.modelEligible || age === null) return null;
  const last = fighter.history.at(-1);
  const layoffDays = last ? Math.max(0, Math.floor((eventDate.getTime() - Date.parse(last.happenedAt)) / 86_400_000)) : 3_650;
  const wins = fighter.history.filter((bout) => bout.result === "win");
  const methodWins = {
    koTko: wins.filter((bout) => /ko|tko|knockout/iu.test(bout.method ?? "")).length,
    submission: wins.filter((bout) => /sub|submission/iu.test(bout.method ?? "")).length,
    decision: wins.filter((bout) => /decision/iu.test(bout.method ?? "")).length
  };
  return {
    ref: fighter.id,
    org: fighter.org,
    rating: fighter.rating.rating,
    deviation: fighter.rating.deviation,
    age,
    reachCm: fieldNumber(fighter, "reachCm"),
    layoffDays,
    shortNotice: false,
    missedWeight: false,
    recentKoLoss: fighter.history.slice(-2).some((bout) => bout.result === "loss" && /ko|tko|knockout/iu.test(bout.method ?? "")),
    homeRegion: false,
    methodWins,
    roundFinishes: wins.flatMap((bout) => bout.round === null ? [] : [bout.round]),
    modelEligible: true
  };
}

export function confirmedAnalysisInputs(input: { fighters: readonly FighterRecord[]; bouts: readonly BoutRecord[]; now: Date }) {
  const fighters = new Map(input.fighters.map((fighter) => [fighter.id, fighter]));
  return input.bouts.flatMap((bout) => {
    if (!["confirmed", "weigh-in"].includes(bout.status) || Date.parse(bout.event.startsAtUtc) < input.now.getTime()) return [];
    const red = fighters.get(bout.fighters.red);
    const blue = fighters.get(bout.fighters.blue);
    if (!red || !blue) return [];
    const eventDate = new Date(bout.event.startsAtUtc);
    const redInput = modelInput(red, eventDate);
    const blueInput = modelInput(blue, eventDate);
    if (!redInput || !blueInput) return [];
    return [{ boutRef: bout.id, red: redInput, blue: blueInput, eventStartsAt: bout.event.startsAtUtc }];
  });
}

export function statsEntriesForRun(run: ModelRun, bouts: readonly BoutRecord[]): FightAiQStatsEntry[] {
  const byId = new Map(bouts.map((bout) => [bout.id, bout]));
  return run.bouts.flatMap((prediction) => {
    const bout = byId.get(prediction.boutRef);
    if (!bout) return [];
    return [FightAiQStatsEntrySchema.parse({
      schemaVersion: "fightaiq-stats/1",
      id: `prediction:${sha256({ boutRef: bout.id, modelVersion: run.modelVersion, inputsHash: run.inputsHash }).slice(0, 24)}`,
      boutRef: bout.id,
      eventRef: bout.event.ref,
      fighterRefs: [bout.fighters.red, bout.fighters.blue],
      modelVersion: run.modelVersion,
      redWin: prediction.probabilities.redWin,
      blueWin: prediction.probabilities.blueWin,
      uncertainty: prediction.probabilities.uncertainty,
      calibrationLabel: "early-model",
      marketUsed: prediction.probabilities.marketRedWin !== undefined,
      status: bout.status === "cancelled" || bout.status === "postponed" ? "void" : bout.status === "completed" ? "scored" : "active",
      outcome: bout.result?.winner ?? null,
      brierContribution: bout.result?.winner === "red" || bout.result?.winner === "blue"
        ? Number(((prediction.probabilities.redWin - (bout.result.winner === "red" ? 1 : 0)) ** 2).toFixed(8))
        : null,
      sourceRefs: bout.sourceRefs,
      generatedAt: run.createdAt,
      scoredAt: bout.status === "completed" ? bout.updatedAt : null
    })];
  });
}

export async function runConfirmedBoutAnalysis(input: {
  root: string;
  fighters: readonly FighterRecord[];
  bouts: readonly BoutRecord[];
  now: Date;
}): Promise<string[]> {
  const modelInputs = confirmedAnalysisInputs(input);
  if (modelInputs.length === 0) return [];
  const config = await loadMmaModelConfig();
  const run = runMmaModel({ config, bouts: modelInputs, createdAt: input.now.toISOString() });
  const hash = sha256(run).slice(0, 24);
  const runPath = `mma/model-runs/${hash}.json`;
  await writeImmutablePrediction(input.root, runPath, run);
  const output = [runPath];
  for (const entry of statsEntriesForRun(run, input.bouts)) {
    const relative = `mma/stats/${entry.id.replace("prediction:", "")}.json`;
    await writeImmutablePrediction(input.root, relative, entry);
    output.push(relative);
  }
  return output;
}

async function writeImmutablePrediction(root: string, relative: string, value: unknown): Promise<void> {
  try {
    const existing = JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown;
    if (JSON.stringify(existing) === JSON.stringify(value)) return;
    throw new Error(`FightAIQ prediction artifact is immutable: ${relative}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await atomicWriteJson(root, relative, value);
}

async function statsFiles(root: string): Promise<string[]> {
  const directory = path.join(root, "mma", "stats");
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch {
    return [];
  }
}

export async function reconcilePredictionResults(input: { root: string; bouts: readonly BoutRecord[]; now: Date }): Promise<string[]> {
  const bouts = new Map(input.bouts.map((bout) => [bout.id, bout]));
  const entries: FightAiQStatsEntry[] = [];
  const paths: string[] = [];
  for (const file of await statsFiles(input.root)) {
    const current = FightAiQStatsEntrySchema.parse(JSON.parse(await readFile(file, "utf8")));
    const bout = bouts.get(current.boutRef);
    let next = current;
    if (bout && current.status === "active") {
      if (bout.status === "cancelled" || bout.status === "postponed" || (bout.status === "completed" && (!bout.result || bout.result.winner === "draw" || bout.result.winner === "no-contest"))) {
        next = FightAiQStatsEntrySchema.parse({ ...current, status: "void", outcome: bout.result?.winner ?? null, brierContribution: null, scoredAt: bout.updatedAt });
      } else if (bout.status === "completed" && bout.result && (bout.result.winner === "red" || bout.result.winner === "blue")) {
        const outcome = bout.result.winner;
        const brierContribution = Number(((current.redWin - (outcome === "red" ? 1 : 0)) ** 2).toFixed(8));
        next = FightAiQStatsEntrySchema.parse({ ...current, status: "scored", outcome, brierContribution, scoredAt: bout.updatedAt });
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      const relative = path.relative(input.root, file);
      await atomicWriteJson(input.root, relative, next);
      paths.push(relative);
    }
    entries.push(next);
  }
  const scored = entries.filter((entry) => entry.status === "scored" && entry.brierContribution !== null);
  const summaryPath = "mma/evaluation/summary.json";
  await atomicWriteJson(input.root, summaryPath, {
    schemaVersion: "fightaiq-evaluation-summary/1",
    eventsEvaluated: new Set(scored.map((entry) => entry.eventRef)).size,
    predictionsScored: scored.length,
    meanBrier: scored.length ? Number((scored.reduce((sum, entry) => sum + entry.brierContribution!, 0) / scored.length).toFixed(8)) : null,
    updatedAt: input.now.toISOString()
  });
  paths.push(summaryPath);
  return paths;
}
