import { atomicWriteJson } from "../state.js";
import type { GateVerdict } from "./vision-gate.js";
import type { HeroRung } from "./ladder.js";

/**
 * Why the published picture is the published picture, written down beside the article.
 *
 * The same rule the Design Lab summary follows: recorded, not re-derived. A re-run would ask the
 * gate again, and a model asked twice can answer differently — so a re-derived record would show
 * the owner a decision that was never made, while this file shows the one that was. It is also
 * the answer to the question the owner has never been able to ask before: not "which photograph
 * ran" but "what else was offered, and what was wrong with it".
 *
 * Plain JSON with no bytes in it. The pictures live in the package; this is the reasoning.
 */
export interface ImageSelectionRecord {
  schemaVersion: "image-selection/1";
  venture: "caught-up" | "mma-files";
  slug: string;
  date: string;
  rung: HeroRung;
  /** The candidate that shipped, or null when the article carries the FRAME plate. */
  selected: string | null;
  verdicts: GateVerdict[];
  /** Providers the search could not use, and why. Never a key, present or absent. */
  skippedProviders: Array<{ provider: string; reason: string }>;
  recordedAt: string;
}

export function imageSelectionPath(record: Pick<ImageSelectionRecord, "venture" | "slug" | "date">): string {
  return `ventures/${record.venture}/image-selections/${record.date}-${record.slug}.json`;
}

export async function storeImageSelection(
  root: string,
  record: ImageSelectionRecord
): Promise<string> {
  const relative = imageSelectionPath(record);
  await atomicWriteJson(root, relative, record);
  return relative;
}
