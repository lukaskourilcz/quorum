import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ASPECTS, PERSONA_KEYS, type PersonaKey } from "./config.js";

/**
 * The pipeline's only state: what was spent, what each frame became, and where each persona's
 * rotation stands. One file, one writer (this package), committed back by the workflow.
 *
 * Spend is written before the call it pays for, not after. The renderers return no cost, so the
 * figure is the configured estimate either way, and a run that dies between the call and the
 * write must still have counted the money: a cap that forgets a crashed call does not hold.
 */
const SpendSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  at: z.string(),
  persona: z.enum(PERSONA_KEYS),
  shotId: z.string(),
  aspect: z.enum(ASPECTS),
  kind: z.enum(["render", "gate"]),
  provider: z.string(),
  model: z.string(),
  usd: z.number().min(0),
  dryRun: z.boolean()
});
export type SpendEntry = z.infer<typeof SpendSchema>;

export const FRAME_OUTCOMES = ["uploaded", "duplicate-on-server", "upload-failed", "rejected", "dry-run", "skipped-cap"] as const;
const FrameSchema = z.object({
  date: z.string(),
  at: z.string(),
  persona: z.enum(PERSONA_KEYS),
  shotId: z.string(),
  pillar: z.string(),
  aspect: z.enum(ASPECTS),
  outcome: z.enum(FRAME_OUTCOMES),
  reasons: z.array(z.string()),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  costUsd: z.number().min(0),
  phash: z.string().nullable(),
  sha256: z.string().nullable(),
  seed: z.number().int().nullable(),
  ingestId: z.string().nullable()
});
export type FrameRecord = z.infer<typeof FrameSchema>;

const LedgerSchema = z.object({
  schemaVersion: z.literal(1),
  rotation: z.record(z.string(), z.object({ used: z.array(z.string()) })),
  spend: z.array(SpendSchema),
  frames: z.array(FrameSchema)
});
export type Ledger = z.infer<typeof LedgerSchema>;

/** Long enough for the 60-day duplicate window in the research with a month to spare. */
export const RETENTION_DAYS = 90;

export function emptyLedger(): Ledger {
  return {
    schemaVersion: 1,
    rotation: Object.fromEntries(PERSONA_KEYS.map((key) => [key, { used: [] }])),
    spend: [],
    frames: []
  };
}

export const ledgerPath = (stateDir: string) => path.join(stateDir, "ledger.json");

/**
 * A missing file is a first run. A malformed one is not: starting from empty would forget the
 * day's spend and every hash, so the run stops and says so instead.
 */
export async function readLedger(stateDir: string): Promise<Ledger> {
  let raw: string;
  try {
    raw = await readFile(ledgerPath(stateDir), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
    throw error;
  }
  const ledger = LedgerSchema.parse(JSON.parse(raw));
  for (const key of PERSONA_KEYS) ledger.rotation[key] ??= { used: [] };
  return ledger;
}

export async function writeLedger(stateDir: string, ledger: Ledger, today: string): Promise<void> {
  const cutoff = shiftDate(today, -RETENTION_DAYS);
  const kept: Ledger = {
    ...ledger,
    spend: ledger.spend.filter((entry) => entry.date >= cutoff),
    frames: ledger.frames.filter((frame) => frame.date >= cutoff)
  };
  await mkdir(stateDir, { recursive: true });
  const target = ledgerPath(stateDir);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(kept, null, 2)}\n`);
  await rename(temporary, target);
}

export function shiftDate(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/**
 * The daily cap across all four personas, dry runs included: a dry run renders for real and
 * the invoice does not know it was a rehearsal.
 */
export class Budget {
  constructor(
    private readonly ledger: Ledger,
    private readonly date: string,
    readonly capUsd: number
  ) {}

  spentToday(): number {
    return round(this.ledger.spend.filter((entry) => entry.date === this.date).reduce((sum, entry) => sum + entry.usd, 0));
  }

  remaining(): number {
    return round(Math.max(0, this.capUsd - this.spentToday()));
  }

  /** Records the charge and returns true, or records nothing and returns false. */
  reserve(entry: Omit<SpendEntry, "date" | "at">, now = new Date()): boolean {
    if (this.spentToday() + entry.usd > this.capUsd + 1e-9) return false;
    this.ledger.spend.push({ ...entry, usd: round(entry.usd), date: this.date, at: now.toISOString() });
    return true;
  }
}

export const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Hashes of frames that actually reached HeyDarlink, the set a new frame must not repeat. */
export function publishedHashes(ledger: Ledger): string[] {
  return ledger.frames.filter((frame) => frame.outcome === "uploaded" && frame.phash).map((frame) => frame.phash!);
}

export function rotationOf(ledger: Ledger, persona: PersonaKey): string[] {
  return ledger.rotation[persona]?.used ?? [];
}
