import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { EventCard, FighterRecord } from "../contracts/mma.js";
import { atomicWriteJson } from "../state.js";
import { loadEventCards, loadFighterRecords } from "./store.js";

async function newestModelRunRef(root: string): Promise<string | null> {
  const directory = path.join(root, "ventures", "fightaiq", "model-runs");
  try {
    return (await readdir(directory))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .at(-1) ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function fighterCheck(fighter: FighterRecord | undefined, ref: string) {
  if (!fighter) return { fighterRef: ref, present: false, complete: false, missingCriticalFields: ["fighter-file"], openDiscrepancies: [] };
  const missingCriticalFields = fighter.criticalFields.filter((field) => {
    const value = fighter.fields[field];
    return !value || value.status !== "verified" || !value.corroborated;
  });
  return {
    fighterRef: ref,
    present: true,
    complete: missingCriticalFields.length === 0 && fighter.discrepancies.every((item) => item.status === "resolved"),
    missingCriticalFields,
    openDiscrepancies: fighter.discrepancies.filter((item) => item.status === "open").map((item) => ({ field: item.field, values: item.values }))
  };
}

export function readinessDossier(input: {
  event: EventCard;
  fighters: FighterRecord[];
  modelRunRef: string | null;
  generatedAt: Date;
}) {
  if (!input.event.bouts.every((bout) => bout.status === "complete")) {
    throw new Error(`Event ${input.event.id} is not complete`);
  }
  const byId = new Map(input.fighters.map((fighter) => [fighter.id, fighter]));
  const fighterRefs = [...new Set(input.event.bouts.flatMap((bout) => [bout.red, bout.blue]))];
  const checks = fighterRefs.map((ref) => fighterCheck(byId.get(ref), ref));
  const disagreementLog = checks.flatMap((check) => check.openDiscrepancies.map((entry) => ({ fighterRef: check.fighterRef, ...entry })));
  const content = {
    schemaVersion: "fightaiq-readiness-dossier/1" as const,
    eventRef: input.event.id,
    organization: input.event.org,
    eventUpdatedAt: input.event.updatedAt,
    completedBouts: input.event.bouts.length,
    dataCompleteness: {
      complete: checks.every((check) => check.complete),
      fighterChecks: checks
    },
    disagreementLog,
    deterministicModelSnapshot: input.modelRunRef
      ? { available: true, ref: `ventures/fightaiq/model-runs/${input.modelRunRef}` }
      : { available: false, reason: "No versioned deterministic model run exists. Analysis mode remains disabled." },
    analysisModeChanged: false,
    generatedAt: input.generatedAt.toISOString()
  };
  const { generatedAt: _generatedAt, ...stableContent } = content;
  return {
    ...content,
    dossierHash: createHash("sha256").update(JSON.stringify(stableContent)).digest("hex")
  };
}

export async function refreshReadinessDossiers(root: string, now = new Date()): Promise<string[]> {
  const [events, fighters, modelRunRef] = await Promise.all([
    loadEventCards(path.join(root, "ventures", "fightaiq", "events")),
    loadFighterRecords(path.join(root, "ventures", "fightaiq", "fighters")),
    newestModelRunRef(root)
  ]);
  const paths: string[] = [];
  for (const event of events.filter((candidate) => candidate.bouts.every((bout) => bout.status === "complete"))) {
    const relative = `ventures/fightaiq/readiness-dossiers/${event.org}-${event.id.replaceAll(":", "-")}.json`;
    const dossier = readinessDossier({ event, fighters, modelRunRef, generatedAt: now });
    let unchanged = false;
    try {
      const existing = JSON.parse(await readFile(path.join(root, relative), "utf8")) as { eventUpdatedAt?: unknown; dossierHash?: unknown };
      unchanged = existing.eventUpdatedAt === dossier.eventUpdatedAt && existing.dossierHash === dossier.dossierHash;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!unchanged) await atomicWriteJson(root, relative, dossier);
    paths.push(relative);
  }
  return paths;
}
