import { readdir } from "node:fs/promises";
import path from "node:path";
import type { CarouselSummary } from "@boardlessai/carousel-studio";
import { produceDeck } from "../social/deck-production.js";
import { atomicWriteJson, readJson, resolveStatePath } from "../state.js";

/**
 * The consumer for a status field that never had one.
 *
 * It lives with the shared Design Lab rather than in `ventures/kvorum/`, and that is the boundary
 * rather than filing. Kvórum hands the Lab one bounded summary and owns no renderer, no export
 * surface and no studio import of its own — `kvorum-design-lab-architecture.test.ts` fails the
 * moment it does. The Lab draining its own queue keeps that true.
 *
 * Approving a Kvórum recommendation writes its bounded summary and sets
 * `designLab.status: "queued"`, with `recipeRef` null and `artifactRefs` empty. Nothing has ever
 * moved it off that value, so the queue had no consumer and the two fields beside it were
 * write-only — an owner reading the record could not tell an approval waiting to be drawn from one
 * the renderer had silently dropped.
 *
 * This is the step that drains it. It renders through the shared deck module, which checks the
 * capability edge and fails closed, and then writes the result back onto the record: `rendered`
 * with the design and the frames it produced, or `failed` with the reason it did not. Both are
 * answers; `queued` forever was not.
 *
 * Free and typographic. Kvórum's registry sets `imageGeneration: false`, so no picture is
 * generated and no model is called anywhere in this path, and nothing here can post: the deck's
 * only outlet is the review record the owner downloads.
 */

interface DesignLabFields {
  status: "not-requested" | "queued" | "rendered" | "failed";
  requestedAt: string | null;
  resolvedAt: string | null;
  recipeRef: string | null;
  artifactRefs: string[];
  failureReason: string | null;
}

export interface KvorumDeckRenderOutcome {
  ref: string;
  id: string;
  status: "rendered" | "failed" | "skipped";
  reason?: string;
  artifacts: string[];
}

function summaryRef(recommendation: { date: string; id: string }): string {
  const prefix = `kv-${recommendation.date}-`;
  const slug = recommendation.id.startsWith(prefix) ? recommendation.id.slice(prefix.length) : "";
  return `ventures/carousel-studio/summaries/kvorum/${recommendation.date}-${slug}.json`;
}

/**
 * Every recommendation on file, newest day first.
 *
 * Reading the directory rather than the index on purpose: the index carries one day, and a deck
 * queued on Tuesday still has to be drawn on Wednesday if Tuesday's run did not reach it.
 */
async function recommendationRefs(root: string): Promise<string[]> {
  const directory = resolveStatePath(root, "ventures/kvorum/recommendations");
  try {
    return (await readdir(directory))
      .filter((name) => name.endsWith(".json") && !name.endsWith("-index.json"))
      .sort()
      .reverse()
      .map((name) => `ventures/kvorum/recommendations/${name}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function renderQueuedKvorumDecks(input: {
  root: string;
  now?: Date;
  configRoot?: string;
}): Promise<KvorumDeckRenderOutcome[]> {
  const now = input.now ?? new Date();
  const outcomes: KvorumDeckRenderOutcome[] = [];

  for (const ref of await recommendationRefs(input.root)) {
    const record = await readJson<
      { id?: unknown; date?: unknown; designLab?: DesignLabFields } | null
    >(input.root, ref, null);
    if (!record || typeof record.id !== "string" || typeof record.date !== "string") continue;
    if (record.designLab?.status !== "queued") continue;

    const summary = await readJson<CarouselSummary | null>(
      input.root,
      summaryRef({ id: record.id, date: record.date }),
      null
    );
    if (!summary) {
      // The approval writes the summary in the same action that queues the deck, so a queued
      // record with no summary is a half-written approval rather than a render to attempt.
      outcomes.push({
        ref,
        id: record.id,
        status: "failed",
        reason: "The approval queued a deck but recorded no summary to render.",
        artifacts: []
      });
      await writeDesignLab(input.root, ref, record.designLab, {
        status: "failed",
        resolvedAt: now.toISOString(),
        failureReason: "The approval queued a deck but recorded no summary to render."
      });
      continue;
    }

    const produced = await produceDeck({
      root: input.root,
      summary,
      now,
      ...(input.configRoot === undefined ? {} : { configRoot: input.configRoot })
    });
    if (!produced.produced) {
      outcomes.push({ ref, id: record.id, status: "failed", reason: produced.reason, artifacts: [] });
      await writeDesignLab(input.root, ref, record.designLab, {
        status: "failed",
        resolvedAt: now.toISOString(),
        failureReason: produced.reason
      });
      continue;
    }

    await writeDesignLab(input.root, ref, record.designLab, {
      status: "rendered",
      resolvedAt: now.toISOString(),
      recipeRef: produced.recipeRef,
      // The frames plus the record that says what drew them, which is what a reader of the
      // recommendation needs to find the deck without knowing this module's paths.
      artifactRefs: [...produced.artifactRefs, produced.receiptRef, produced.queueRef],
      failureReason: null
    });
    outcomes.push({ ref, id: record.id, status: "rendered", artifacts: produced.artifactRefs });
  }

  return outcomes;
}

async function writeDesignLab(
  root: string,
  ref: string,
  current: DesignLabFields | undefined,
  next: Partial<DesignLabFields> & { status: DesignLabFields["status"] }
): Promise<void> {
  const record = await readJson<Record<string, unknown> | null>(root, ref, null);
  if (!record) return;
  await atomicWriteJson(root, ref, {
    ...record,
    designLab: {
      status: next.status,
      requestedAt: current?.requestedAt ?? null,
      resolvedAt: next.resolvedAt ?? null,
      recipeRef: next.recipeRef ?? null,
      artifactRefs: next.artifactRefs ?? [],
      failureReason: next.failureReason ?? null
    }
  });
}

/** Where the outcome of one sweep is recorded, so a day with nothing to draw still says so. */
export function kvorumDeckQueueReceiptPath(date: string): string {
  return path.posix.join("ventures/kvorum/deck-renders", `${date}.json`);
}
