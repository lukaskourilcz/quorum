import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadVentureRegistry } from "../ventures/registry.js";

/**
 * Which venture the morning's ideation is for today.
 *
 * The idea seat used to propose for Caught Up every single morning, whatever the rest of the
 * portfolio was doing, because the namespace was hardcoded at the call site. Seven ventures and
 * one of them getting every idea is not a portfolio.
 *
 * The rotation is a modulo over the ISO day number, which makes it deterministic: the same date
 * always picks the same venture, a re-run proposes for the same one, and a dry run can assert it
 * without a clock. Paused ventures drop out of the ring — an idea for a venture nobody is running
 * is work that cannot be taken.
 */
export interface RotationTarget {
  ventureId: string;
  ledgerNamespace: string;
  name: string;
  growthObjective: string;
  /** The venture's recorded taste, when it keeps one. Absent is normal and costs nothing. */
  taste: string | null;
}

/** Days since the epoch, so the rotation advances once per calendar day and never mid-run. */
function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}

export async function resolveRotationTarget(input: {
  stateRoot: string;
  now: Date;
}): Promise<RotationTarget | null> {
  const registry = await loadVentureRegistry();
  const active = registry.ventures
    .filter((venture) => venture.status !== "paused")
    .sort((left, right) => left.id.localeCompare(right.id));
  if (active.length === 0) return null;

  const venture = active[dayNumber(input.now) % active.length]!;
  let taste: string | null = null;
  try {
    // Trimmed and capped: this is seed material for a prompt, and an unbounded file read into one
    // is how a document becomes an instruction budget.
    taste = (await readFile(path.join(input.stateRoot, "taste", venture.id, "TASTE.md"), "utf8"))
      .trim()
      .slice(0, 4_000);
  } catch {
    taste = null;
  }

  return {
    ventureId: venture.id,
    ledgerNamespace: venture.ledgerNamespace,
    name: venture.name,
    growthObjective: venture.growth_objective.label,
    taste: taste && taste.length > 0 ? taste : null
  };
}
