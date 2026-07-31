import { createHash } from "node:crypto";
import {
  VisualWeightsSchema,
  type VisualWeights
} from "../contracts/visual-weights.js";

export function selectWeightedTemplate(
  input: VisualWeights,
  seed: string
): string {
  const weights = VisualWeightsSchema.parse(input);
  const entries = Object.entries(weights.weights).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) throw new Error("FRAME cannot rotate an empty visual template set");
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const digest = createHash("sha256").update(`${weights.ventureId}\n${seed}`).digest();
  const unit = digest.readUInt32BE(0) / 0x1_0000_0000;
  const target = unit * total;
  let cursor = 0;
  for (const [template, weight] of entries) {
    cursor += weight;
    if (target < cursor) return template;
  }
  return entries.at(-1)![0];
}
