import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { runCycle } from "../cycle.js";
import { MeetingRecordSchema } from "../contracts/meeting-record.js";
import { repoRoot, stateRoot } from "../paths.js";
import { StandupSchema } from "../standup/schema.js";
import { atomicWriteJson } from "../state.js";
import type { RunnablePhase } from "../types.js";

const fixtures: Array<{ phase: RunnablePhase; at: string }> = [
  { phase: "cu-edition", at: "2026-08-01T03:00:00.000Z" },
  { phase: "morning", at: "2026-08-01T04:00:00.000Z" },
  { phase: "mma-intake", at: "2026-08-01T06:00:00.000Z" },
  { phase: "mag-editorial", at: "2026-08-01T07:00:00.000Z" },
  { phase: "tt-marketing", at: "2026-08-01T09:00:00.000Z" },
  { phase: "studio", at: "2026-08-01T11:00:00.000Z" },
  { phase: "afternoon", at: "2026-08-01T12:00:00.000Z" },
  { phase: "cu-product", at: "2026-08-01T15:00:00.000Z" },
  { phase: "mma-analysis", at: "2026-08-01T17:00:00.000Z" },
  { phase: "mag-desk", at: "2026-08-01T18:00:00.000Z" },
  { phase: "night", at: "2026-08-01T20:00:00.000Z" }
];

const copiedPrefixes = ["standups/", "meetings/", "scorecards/", "calendar/", "ventures/mma-files/slates/"];

async function copyProofArtifact(relative: string): Promise<string | null> {
  const prefix = "tmp/dry-run/state/";
  if (!relative.startsWith(prefix)) return null;
  const canonical = relative.slice(prefix.length);
  if (!copiedPrefixes.some((candidate) => canonical.startsWith(candidate))) return null;
  try {
    await access(path.join(stateRoot, canonical));
    return canonical;
  } catch {
    // A missing canonical proof record may be copied after it passes its contract.
  }
  const value = JSON.parse(await readFile(path.join(repoRoot, relative), "utf8")) as unknown;
  if (canonical.startsWith("standups/")) StandupSchema.parse(value);
  if (canonical.startsWith("meetings/") && !MeetingRecordSchema.safeParse(value).success) return null;
  await atomicWriteJson(stateRoot, canonical, value);
  return canonical;
}

const output = [];
for (const fixture of fixtures) {
  const result = await runCycle({
    phase: fixture.phase,
    dry: true,
    explainBudget: false,
    explainRouting: false,
    now: new Date(fixture.at)
  });
  const copied = (await Promise.all(result.artifacts.map(copyProofArtifact))).filter((value): value is string => Boolean(value));
  output.push({ phase: fixture.phase, status: result.status, decision: result.decision, estimatedWorstCaseUsd: result.estimatedWorstCaseUsd, copied });
}

console.log(JSON.stringify({ fixture: true, date: "2026-08-01", rooms: output }, null, 2));
