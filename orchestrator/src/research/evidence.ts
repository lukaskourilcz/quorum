import { createHash } from "node:crypto";
import { z } from "zod";
import { EvidenceRefSchema } from "../types.js";

export const EvidenceSchema = z.object({
  id: EvidenceRefSchema,
  ts: z.string().datetime(),
  sourceUrl: z.string().url(),
  sourceType: z.string().min(1).max(80),
  claim: z.string().min(1).max(800),
  quoteOrSignal: z.string().min(1).max(1_500),
  capturedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  opportunityId: z.string().min(1).max(120),
  direct: z.boolean(),
  fixture: z.boolean().default(false),
  independenceKey: z.string().min(1).max(200).optional()
});
export type Evidence = z.infer<typeof EvidenceSchema>;

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/\s+/g, " ")
    .trim();
}

export function evidenceFingerprint(evidence: Pick<Evidence, "sourceUrl" | "claim">): string {
  const url = new URL(evidence.sourceUrl);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "ref") {
      url.searchParams.delete(key);
    }
  }
  return createHash("sha256")
    .update(`${url.toString()}\n${normalizedText(evidence.claim)}`)
    .digest("hex");
}

export function evidenceIndependenceKey(evidence: Evidence): string {
  if (evidence.independenceKey) {
    return normalizedText(evidence.independenceKey);
  }
  const hostname = new URL(evidence.sourceUrl).hostname.replace(/^www\./, "");
  return `${hostname}:${normalizedText(evidence.sourceType)}`;
}

export function deduplicateEvidence(entries: readonly Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const parsed = EvidenceSchema.parse(entry);
    const fingerprint = evidenceFingerprint(parsed);
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
}

export function eligibleEvidence(
  entries: readonly Evidence[],
  opportunityId: string
): Evidence[] {
  return deduplicateEvidence(entries)
    .filter(
      (entry) =>
        entry.opportunityId === opportunityId &&
        !entry.fixture &&
        entry.confidence > 0
    );
}

export function summarizeEvidence(
  entries: readonly Evidence[],
  opportunityId: string
): {
  eligible: number;
  independent: number;
  direct: number;
  refs: string[];
} {
  const eligible = eligibleEvidence(entries, opportunityId);
  return {
    eligible: eligible.length,
    independent: new Set(eligible.map(evidenceIndependenceKey)).size,
    direct: eligible.filter((entry) => entry.direct).length,
    refs: eligible.map((entry) => entry.id)
  };
}

export function parseEvidenceJsonl(raw: string): Evidence[] {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => EvidenceSchema.parse(JSON.parse(line)));
}
