export interface TehdejsiResearchLedgerBackfill {
  text: string;
  changed: number;
  matched: number;
  unmatchedDossierRefs: string[];
}

type LedgerPurchase = {
  kind: "purchase";
  topicKey: string;
  briefHash: string;
  dossierRef: string;
};

type LedgerUse = {
  kind: "use";
  topicKey: string;
  briefHash: string;
  recommendationId: string;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HASH = /^[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const STATE_PATH = /^state\/[a-zA-Z0-9._/-]+$/u;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function instant(value: unknown): value is string {
  return typeof value === "string" && INSTANT.test(value) && Number.isFinite(Date.parse(value));
}

function parseLine(line: string, index: number): LedgerPurchase | LedgerUse {
  let value: unknown;
  try { value = JSON.parse(line) as unknown; }
  catch { throw new Error(`Tehdejsi svet research ledger line ${index + 1} is not JSON`); }
  const entry = object(value);
  if (!entry || entry.schemaVersion !== "ts-research-ledger/1"
      || typeof entry.topicKey !== "string" || entry.topicKey.length > 120 || !SLUG.test(entry.topicKey)
      || typeof entry.briefHash !== "string" || !HASH.test(entry.briefHash)) {
    throw new Error(`Tehdejsi svet research ledger line ${index + 1} is malformed`);
  }
  if (entry.kind === "purchase" && exact(entry, [
    "schemaVersion", "kind", "topicKey", "briefHash", "cycleId", "provider", "model", "startedAt", "completedAt",
    "tokensIn", "tokensOut", "searches", "costUsd", "dossierRef"
  ]) && typeof entry.dossierRef === "string" && STATE_PATH.test(entry.dossierRef) && !entry.dossierRef.includes("..")
      && typeof entry.cycleId === "string" && entry.cycleId.length > 0 && entry.cycleId.length <= 120
      && typeof entry.provider === "string" && entry.provider.trim().length > 0 && entry.provider.length <= 120
      && typeof entry.model === "string" && entry.model.trim().length > 0 && entry.model.length <= 160
      && instant(entry.startedAt) && instant(entry.completedAt) && Date.parse(entry.completedAt) >= Date.parse(entry.startedAt)
      && Number.isSafeInteger(entry.tokensIn) && Number(entry.tokensIn) >= 0
      && Number.isSafeInteger(entry.tokensOut) && Number(entry.tokensOut) >= 0
      && Number.isSafeInteger(entry.searches) && Number(entry.searches) >= 0 && Number(entry.searches) <= 8
      && typeof entry.costUsd === "number" && Number.isFinite(entry.costUsd) && entry.costUsd >= 0 && entry.costUsd <= 0.3) {
    return { kind: "purchase", topicKey: entry.topicKey, briefHash: entry.briefHash, dossierRef: entry.dossierRef };
  }
  if (entry.kind === "use" && exact(entry, ["schemaVersion", "kind", "topicKey", "briefHash", "at", "recommendationId"])
      && instant(entry.at) && typeof entry.recommendationId === "string" && entry.recommendationId.length <= 120
      && SLUG.test(entry.recommendationId)) {
    return { kind: "use", topicKey: entry.topicKey, briefHash: entry.briefHash, recommendationId: entry.recommendationId };
  }
  throw new Error(`Tehdejsi svet research ledger line ${index + 1} is malformed`);
}

/** Appends immutable use receipts for every dossier first cited by an owner-posted package. */
export function backfillTehdejsiResearchUsage(input: {
  raw: string;
  dossierRefs: readonly string[];
  recommendationId: string;
  at: string;
}): TehdejsiResearchLedgerBackfill {
  if (!instant(input.at) || input.recommendationId.length > 120 || !SLUG.test(input.recommendationId)
      || input.dossierRefs.some((reference) => !STATE_PATH.test(reference) || reference.includes(".."))) {
    throw new Error("Tehdejsi svet research usage input is malformed");
  }
  const sourceLines = input.raw.split(/\r?\n/u).filter((line) => line.trim());
  const entries = sourceLines.map(parseLine);
  const wanted = [...new Set(input.dossierRefs)].sort();
  const purchases = entries.filter((entry): entry is LedgerPurchase => entry.kind === "purchase");
  const uses = entries.filter((entry): entry is LedgerUse => entry.kind === "use");
  const additions: string[] = [];
  let matched = 0;
  const unmatchedDossierRefs: string[] = [];
  for (const dossierRef of wanted) {
    const found = purchases.filter((entry) => entry.dossierRef === dossierRef);
    if (found.length === 0) {
      unmatchedDossierRefs.push(dossierRef);
      continue;
    }
    matched += 1;
    for (const purchase of found) {
      const exists = uses.some((entry) => entry.topicKey === purchase.topicKey
        && entry.briefHash === purchase.briefHash && entry.recommendationId === input.recommendationId);
      if (exists) continue;
      additions.push(JSON.stringify({
        schemaVersion: "ts-research-ledger/1",
        kind: "use",
        topicKey: purchase.topicKey,
        briefHash: purchase.briefHash,
        at: input.at,
        recommendationId: input.recommendationId
      }));
    }
  }
  const prefix = input.raw.length === 0 || input.raw.endsWith("\n") ? input.raw : `${input.raw}\n`;
  return {
    text: additions.length ? `${prefix}${additions.join("\n")}\n` : input.raw,
    changed: additions.length,
    matched,
    unmatchedDossierRefs
  };
}
