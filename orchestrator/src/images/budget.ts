import { atomicWriteJson, readJson } from "../state.js";
import { BudgetLedgerEntrySchema, hasLedgerEntry, type BudgetLedgerEntry } from "../budget.js";

/**
 * What the image programme may spend, and what happens when it cannot.
 *
 * Three numbers, all from `article-image-fit-2026-08-08`, all inside the $50 all-in operating cap
 * of `budget-2026-08f`. They are hard limits in one direction only: a run that hits one descends a
 * rung of the certainty ladder and keeps going. An article can always ship with the FRAME plate,
 * so a cap can cost a photograph and must never cost a publication.
 *
 * The day figure is read from the ledger rather than counted in memory. A cycle is one process,
 * but three cycles run a day and the morning slot cannot know what the night slot spent unless it
 * looks; an in-memory counter would reset to zero at every slot and the day cap would be three
 * times what the owner approved.
 */
export const IMAGE_GATE_ARTICLE_CAP_USD = 0.02;
export const IMAGE_PROGRAM_DAY_CAP_USD = 0.1;
export const IMAGE_GENERATION_DAY_LIMIT = 2;

/**
 * The ledger phases the image programme bills under.
 *
 * Two, because they answer different questions: one is a model looking at pictures and one is a
 * renderer making one, and an owner reading the finance line should be able to tell how much of
 * the day went on each. Both carry a ventureId, so per-venture unit costs stay attributable.
 */
export const IMAGE_GATE_PHASE = "image_gate";
export const ARTICLE_ILLUSTRATION_PHASE = "article_illustration";
export const IMAGE_PROGRAM_PHASES = [IMAGE_GATE_PHASE, ARTICLE_ILLUSTRATION_PHASE] as const;

/** Why a request was refused. `null` is the answer when it was not. */
export type ImageBudgetRefusal = "article-cap" | "day-cap" | "generation-day-limit";

export interface ImageProgramSpendToday {
  usd: number;
  generatedImages: number;
}

function sameUtcDay(left: Date, right: Date): boolean {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

/** What the whole image programme has already spent and rendered today, across both ventures. */
export async function readImageProgramSpendToday(
  stateRoot: string,
  now: Date
): Promise<ImageProgramSpendToday> {
  const ledger = await readJson<{ entries: BudgetLedgerEntry[] }>(
    stateRoot,
    "budget/ledger.json",
    { entries: [] }
  );
  const today = ledger.entries.filter((entry) =>
    (IMAGE_PROGRAM_PHASES as readonly string[]).includes(entry.phase)
    && sameUtcDay(new Date(entry.ts), now));
  return {
    usd: Number(today.reduce((sum, entry) => sum + entry.usd, 0).toFixed(8)),
    generatedImages: today.filter((entry) => entry.phase === ARTICLE_ILLUSTRATION_PHASE).length
  };
}

/**
 * The spend guard for one article's image work.
 *
 * Constructed from what the day has already cost, then asked before every paid call and told
 * after every one. `reserve` refuses on the estimate, not on the outcome, so a call that would
 * breach a cap is never made — the refusal happens locally and no request reaches a provider.
 *
 * `record` takes the measured cost afterwards, which can exceed the estimate; that is why the
 * caps are checked again on the way out. An overrun that has already been billed is recorded
 * honestly and closes the budget to everything after it, rather than being rounded away.
 */
export class ImageProgramBudget {
  private articleUsd = 0;
  private dayUsd: number;
  private generatedToday: number;

  constructor(spentToday: ImageProgramSpendToday) {
    this.dayUsd = spentToday.usd;
    this.generatedToday = spentToday.generatedImages;
  }

  /** What today has cost so far, including this article. For the run report. */
  spent(): ImageProgramSpendToday {
    return { usd: this.dayUsd, generatedImages: this.generatedToday };
  }

  /** What this one article has cost so far. */
  articleSpent(): number {
    return this.articleUsd;
  }

  /** Whether an estimated call fits, and which cap says no when it does not. */
  reserve(estimateUsd: number): ImageBudgetRefusal | null {
    if (Number((this.articleUsd + estimateUsd).toFixed(8)) > IMAGE_GATE_ARTICLE_CAP_USD) {
      return "article-cap";
    }
    if (Number((this.dayUsd + estimateUsd).toFixed(8)) > IMAGE_PROGRAM_DAY_CAP_USD) {
      return "day-cap";
    }
    return null;
  }

  /** Whether another image may be rendered today. Separate from money: it is a count. */
  reserveGeneratedImage(estimateUsd: number): ImageBudgetRefusal | null {
    if (this.generatedToday >= IMAGE_GENERATION_DAY_LIMIT) return "generation-day-limit";
    if (Number((this.dayUsd + estimateUsd).toFixed(8)) > IMAGE_PROGRAM_DAY_CAP_USD) return "day-cap";
    return null;
  }

  record(usd: number, kind: "gate" | "generated-image" = "gate"): void {
    this.articleUsd = Number((this.articleUsd + usd).toFixed(8));
    this.dayUsd = Number((this.dayUsd + usd).toFixed(8));
    if (kind === "generated-image") this.generatedToday += 1;
  }
}

/**
 * A render, in the ledger, whether or not its picture is used.
 *
 * Written before the gate is asked, because the renderer has already billed by then: an
 * illustration the gate refuses cost exactly what one it accepts cost, and a counter that only
 * saw the accepted ones would let a bad day render far more than two.
 *
 * There is no usage to read back — the renderer bills per megapixel and returns no cost — so the
 * ledger carries the fixed published rate rounded up. Token counts are zero because there are
 * none; `kind: "image"` is what separates this row from the gate's.
 */
export async function recordIllustrationSpend(input: {
  stateRoot: string;
  cycleId: string;
  ventureId: string;
  model: string;
  usd: number;
  requestHash: string;
  now: Date;
}): Promise<void> {
  const ledger = await readJson<{ entries: BudgetLedgerEntry[] }>(
    input.stateRoot,
    "budget/ledger.json",
    { entries: [] }
  );
  if (hasLedgerEntry(ledger.entries, input.cycleId, input.requestHash)) return;
  const entry = BudgetLedgerEntrySchema.parse({
    ts: input.now.toISOString(),
    cycleId: input.cycleId,
    requestHash: input.requestHash,
    phase: ARTICLE_ILLUSTRATION_PHASE,
    ventureId: input.ventureId,
    agent: "ARTICLE_ILLUSTRATION",
    provider: "fal",
    model: input.model,
    serviceTier: "default",
    tokensIn: 0,
    cachedTokensIn: 0,
    tokensOut: 0,
    toolUses: 1,
    usd: input.usd,
    kind: "image"
  });
  await atomicWriteJson(input.stateRoot, "budget/ledger.json", {
    schemaVersion: 1,
    entries: [...ledger.entries, entry]
  });
}
