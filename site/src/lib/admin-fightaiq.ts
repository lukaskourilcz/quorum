import "server-only";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getPublicEvents, getPublicFighters, type PublicEvent, type PublicFighter } from "./fightaiq-records";
import { parseRatingLedger, type RatingRecord } from "./rating-model";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

export interface AdminMmaSource {
  id: string;
  name: string;
  tier: "A" | "B" | "C";
  state: "wired" | "proposed" | "disabled" | "blocked";
  coverage: string[];
  freeLimit: string;
  credentialEnv: string | null;
  credentialReady: boolean;
  termsVerdict: string;
  termsNote: string;
  evidenceUrl: string;
}

export interface AdminMmaSlate {
  id: string;
  title: string;
  eventRefs: string[];
  generatedAt: string;
  expectedLossLine: string;
  legCount: number;
  ticketCount: number;
  contentHash: string;
  ratings: RatingRecord[];
}

export interface AdminFightAiQSnapshot {
  fighters: PublicFighter[];
  events: PublicEvent[];
  slates: AdminMmaSlate[];
  sources: AdminMmaSource[];
  unreadable: string[];
}

const object = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, maximum = 1_000): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value.trim() : null;
const texts = (value: unknown): string[] | null => Array.isArray(value) && value.every((entry) => text(entry, 240)) ? value as string[] : null;
const hash = (raw: string) => `sha256:${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;

async function files(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : Promise.resolve(entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : [])))).flat().sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function ratings(root: string): Promise<{ records: RatingRecord[]; malformed: boolean }> {
  try {
    const parsed = parseRatingLedger(await readFile(path.join(root, "state", "ratings", "fightaiq", "ledger.jsonl"), "utf8"));
    return parsed ? { records: parsed, malformed: false } : { records: [], malformed: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: [], malformed: false };
    throw error;
  }
}

function parseSlate(raw: string, history: readonly RatingRecord[]): AdminMmaSlate | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const slate = object(value);
  const eventRefs = texts(slate?.eventRefs);
  const expectedLossLine = text(slate?.expectedLossLine, 500);
  const generatedAt = text(slate?.generatedAt, 80);
  const legs = Array.isArray(slate?.legs) ? slate.legs : null;
  const tickets = Array.isArray(slate?.tickets) ? slate.tickets : null;
  if (slate?.schemaVersion !== "slip-of-ten/1" || !eventRefs?.length || !expectedLossLine || !generatedAt || Number.isNaN(Date.parse(generatedAt)) || legs?.length !== 10 || !tickets || tickets.length > 4) return null;
  const id = `slate-${generatedAt.slice(0, 10)}-${eventRefs[0]!.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return {
    id,
    title: `Ten-fight slate · ${eventRefs.join(", ")}`,
    eventRefs,
    generatedAt,
    expectedLossLine,
    legCount: legs.length,
    ticketCount: tickets.length,
    contentHash: hash(raw),
    ratings: history.filter((entry) => entry.objectRef.id === id).sort((left, right) => right.ratedAt.localeCompare(left.ratedAt))
  };
}

async function sourceSnapshot(root: string): Promise<AdminMmaSource[]> {
  const raw = JSON.parse(await readFile(path.join(root, "config", "mma-sources.json"), "utf8")) as { sources?: unknown[] };
  if (!Array.isArray(raw.sources)) throw new Error("FightAIQ source registry is invalid");
  return raw.sources.flatMap((value) => {
    const source = object(value);
    const id = text(source?.id, 100);
    const name = text(source?.name, 100);
    const coverage = texts(source?.coverage);
    const freeLimit = text(source?.freeLimit, 240);
    const termsVerdict = text(source?.termsVerdict, 80);
    const termsNote = text(source?.termsNote, 1_000);
    const evidenceUrl = text(source?.evidenceUrl, 400);
    const tier = source?.tier === "A" || source?.tier === "B" || source?.tier === "C" ? source.tier : null;
    const state = source?.state === "wired" || source?.state === "proposed" || source?.state === "disabled" || source?.state === "blocked" ? source.state : null;
    const credentialEnv = text(source?.credentialEnv, 100);
    return id && name && coverage && freeLimit && termsVerdict && termsNote && evidenceUrl && tier && state ? [{
      id, name, coverage, freeLimit, termsVerdict, termsNote, evidenceUrl, tier, state,
      credentialEnv,
      credentialReady: credentialEnv ? Boolean(process.env[credentialEnv]) : true
    }] : [];
  });
}

export async function readAdminFightAiQ(root = repositoryRoot): Promise<AdminFightAiQSnapshot> {
  const [fighterSnapshot, eventSnapshot, sourceRecords, ratingState] = await Promise.all([
      getPublicFighters(root), getPublicEvents(root), sourceSnapshot(root), ratings(root)
    ]);
    const slateRoot = path.join(root, "state", "ventures", "fightaiq", "slates");
    const slates: AdminMmaSlate[] = [];
    const unreadable: string[] = [
      ...fighterSnapshot.unreadable.map((file) => `fighters/${file}`),
      ...eventSnapshot.unreadable.map((file) => `events/${file}`),
      ...(ratingState.malformed ? ["ratings/fightaiq/ledger.jsonl"] : [])
    ];
    for (const file of await files(slateRoot)) {
      const parsed = parseSlate(await readFile(file, "utf8"), ratingState.records);
      if (parsed) slates.push(parsed); else unreadable.push(`slates/${path.relative(slateRoot, file)}`);
    }
  return { fighters: fighterSnapshot.fighters, events: eventSnapshot.events, slates, sources: sourceRecords, unreadable };
}
