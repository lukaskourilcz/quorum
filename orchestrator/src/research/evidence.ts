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

export function evidenceHost(evidence: Pick<Evidence, "sourceUrl">): string {
  return new URL(evidence.sourceUrl).hostname.replace(/^www\./u, "").toLowerCase();
}

export function evidenceIndependenceKey(evidence: Evidence): string {
  return evidenceHost(evidence);
}

/**
 * How many genuinely independent publishers back this evidence set.
 *
 * Independence is derived from the source host, never from a field the author controls.
 * `independenceKey` still has a job, but only a narrowing one: it declares that two
 * different hosts share an owner — a syndication network, a mirror, a rebrand — so they
 * collapse into one. It can never split a single host into several keys.
 *
 * That direction matters now that agents write their own evidence and opportunities. The
 * previous implementation returned the author's `independenceKey` verbatim when present,
 * so three entries from one publisher carrying three arbitrary strings counted as three
 * independent sources. That is precisely the outcome the ">=3 independent refs" gate
 * exists to prevent, and an author could reach it by accident as easily as on purpose.
 *
 * The count is therefore bounded above by the number of distinct hosts, and merges are
 * applied deterministically so the result does not depend on entry order.
 */
export function countIndependentSources(entries: readonly Evidence[]): number {
  const ownerByHost = new Map<string, string>();
  for (const entry of entries) {
    const host = evidenceHost(entry);
    const declared = entry.independenceKey ? normalizedText(entry.independenceKey) : host;
    const existing = ownerByHost.get(host);
    // Lowest value wins so a host with conflicting declarations resolves the same way
    // regardless of the order entries appear in the ledger.
    ownerByHost.set(host, existing === undefined ? declared : (existing < declared ? existing : declared));
  }
  return new Set(ownerByHost.values()).size;
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
    independent: countIndependentSources(eligible),
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
