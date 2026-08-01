import { DesignFindingSchema, MetricsCaptureSchema, type DesignFinding, type MetricsCapture } from "../contracts/mma-files.js";
import { atomicWriteText, readText, withFileLock } from "../state.js";

const ledgerPath = "ventures/mma-files/social/metrics.jsonl";

export class MetricsConflictError extends Error {}

export function parseMetricsLedger(raw: string): MetricsCapture[] {
  return raw.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return MetricsCaptureSchema.parse(JSON.parse(line)); }
    catch { throw new Error(`Metrics ledger line ${index + 1} is invalid`); }
  });
}

export async function appendMetricsCapture(
  root: string,
  input: MetricsCapture
): Promise<{ capture: MetricsCapture; idempotent: boolean }> {
  const capture = MetricsCaptureSchema.parse(input);
  return withFileLock(root, "ventures/mma-files/social/metrics.lock", async () => {
    const raw = await readText(root, ledgerPath);
    const records = parseMetricsLedger(raw);
    const existing = records.find((record) => record.postRef === capture.postRef && record.window === capture.window);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(capture)) {
        throw new MetricsConflictError(`Metrics already exist for ${capture.postRef} at ${capture.window}`);
      }
      return { capture: existing, idempotent: true };
    }
    await atomicWriteText(root, ledgerPath, `${raw}${JSON.stringify(capture)}\n`);
    return { capture, idempotent: false };
  });
}

export interface VariantScore {
  variant: "A" | "B";
  sampleSize: number;
  views: number;
  interactions: number;
  interactionRate: number | null;
}

function variantFromPostRef(reference: string): "A" | "B" | null {
  const match = /:(A|B):(?:instagram|threads):(?:en|cs)$/u.exec(reference);
  return match?.[1] === "A" || match?.[1] === "B" ? match[1] : null;
}

export function scoreVariants(records: readonly MetricsCapture[], window: "48h" | "7d"): VariantScore[] {
  return (["A", "B"] as const).map((variant) => {
    const captures = records.filter((record) => record.window === window && variantFromPostRef(record.postRef) === variant);
    const views = captures.reduce((sum, record) => sum + record.metrics.views, 0);
    const interactions = captures.reduce((sum, record) => sum + record.metrics.likes + record.metrics.comments + record.metrics.shares + (record.metrics.saves ?? 0) + (record.metrics.clicks ?? 0), 0);
    return {
      variant,
      sampleSize: captures.length,
      views,
      interactions,
      interactionRate: views > 0 ? Number((interactions / views).toFixed(6)) : null
    };
  });
}

export function buildDesignFinding(input: {
  axis: DesignFinding["axis"];
  direction: string;
  evidencePostRefs: string[];
  sampleSize: number;
  proposedWeightChange?: number;
  tasteConflict?: { flag: true; palateRef: string };
}): DesignFinding {
  return DesignFindingSchema.parse({
    schemaVersion: "design-finding/1",
    axis: input.axis,
    direction: input.direction,
    evidencePostRefs: input.evidencePostRefs,
    sampleSize: input.sampleSize,
    status: input.sampleSize >= 8 ? "confirmed" : "directional",
    ...(input.proposedWeightChange === undefined || input.tasteConflict ? {} : { proposedWeightChange: input.proposedWeightChange }),
    ...(input.tasteConflict ? { tasteConflict: input.tasteConflict } : {})
  });
}
