import { rawRecord } from "./model";

export type AdminDailyOutcome = "queued" | "review" | "held" | "paused" | "NO_POST";

export interface AdminSocialDailyOperation {
  id: string;
  profileId: string;
  connectionId: string;
  targetDate: string;
  selectionWindow: { notBefore: string; notAfter: string };
  candidateCount: number;
  selectedCandidateRef: string | null;
  immutableHashes: { targetHash: string; contentHash: string; assetHash: string; windowHash: string } | null;
  gates: Array<{ gate: string; status: "pass" | "hold" | "fail"; reason: string; evidenceRef: string | null }>;
  routineScopeRef: string | null;
  routineScopeState: "draft-only" | "matched" | "missing" | "mismatch" | "revoked" | "expired";
  queue: { itemId: string; itemRef: string; payloadHash: string; status: "queued" } | null;
  outcome: AdminDailyOutcome;
  reasons: string[];
  providerConnectionState: "ready" | "held" | "failed" | "ambiguous" | "unavailable";
  actualCostUsd: number;
  incidentRefs: string[];
  ownerAttentionRefs: string[];
  replayed: boolean;
  createdAt: string;
}

export interface AdminSocialRoutineScope {
  id: string;
  version: string;
  status: "draft" | "active" | "revoked" | "expired";
  profileId: string;
  connectionId: string;
  platform: "instagram" | "threads";
  contentClasses: string[];
  formats: string[];
  sourceKinds: string[];
  effectiveOn: string;
  expiresOn: string;
  approvalRef: string | null;
  countersignatureRef: string | null;
  revocationRef: string | null;
  latestAction: string;
  latestAt: string;
}

const operationId = /^social-profile-operation-[a-f0-9]{20}$/u;
const profileId = /^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const connectionId = /^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const sha256 = /^[a-f0-9]{64}$/u;
const date = /^\d{4}-\d{2}-\d{2}$/u;

function text(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

function nullableText(value: unknown, max = 500): string | null | undefined {
  return value === null ? null : text(value, max) ?? undefined;
}

function dateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function strings(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const parsed = value.map((entry) => text(entry, 500));
  return parsed.every((entry): entry is string => entry !== null) ? parsed : null;
}

function containsSensitiveField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveField);
  const item = rawRecord(value); if (!item) return false;
  return Object.entries(item).some(([key, entry]) => /(?:access.?token|secret|password|credential.?value|native.?account.?id)$/iu.test(key) || containsSensitiveField(entry));
}

export function parseAdminSocialDailyOperation(value: unknown): AdminSocialDailyOperation | null {
  if (containsSensitiveField(value)) return null;
  const item = rawRecord(value); const window = rawRecord(item?.selectionWindow); const immutable = item?.immutableHashes === null ? null : rawRecord(item?.immutableHashes); const queue = item?.queue === null ? null : rawRecord(item?.queue);
  const id = text(item?.id, 120); const profile = text(item?.profileId, 140); const connection = text(item?.connectionId, 160);
  const outcome = ["queued", "review", "held", "paused", "NO_POST"].includes(String(item?.outcome)) ? item?.outcome as AdminDailyOutcome : null;
  const scopeState = ["draft-only", "matched", "missing", "mismatch", "revoked", "expired"].includes(String(item?.routineScopeState)) ? item?.routineScopeState as AdminSocialDailyOperation["routineScopeState"] : null;
  const providerState = ["ready", "held", "failed", "ambiguous", "unavailable"].includes(String(item?.providerConnectionState)) ? item?.providerConnectionState as AdminSocialDailyOperation["providerConnectionState"] : null;
  const selectedCandidateRef = nullableText(item?.selectedCandidateRef, 500); const routineScopeRef = nullableText(item?.routineScopeRef, 500); const reasons = strings(item?.reasons, 30); const incidents = strings(item?.incidentRefs, 100); const attention = strings(item?.ownerAttentionRefs, 100);
  if (item?.schemaVersion !== "social-profile-operation/1" || !id || !operationId.test(id) || !profile || !profileId.test(profile) || !connection || !connectionId.test(connection) || typeof item.targetDate !== "string" || !date.test(item.targetDate)
    || !window || !dateTime(window.notBefore) || !dateTime(window.notAfter) || !outcome || !scopeState || !providerState || selectedCandidateRef === undefined || routineScopeRef === undefined || !reasons?.length || !incidents || !attention
    || !Array.isArray(item.candidateRefs) || item.candidateRefs.length > 100 || typeof item.actualCostUsd !== "number" || !Number.isFinite(item.actualCostUsd) || item.actualCostUsd < 0 || item.actualCostUsd > 100 || typeof item.replayed !== "boolean" || !dateTime(item.createdAt)) return null;
  const rawGates = Array.isArray(item.gates) ? item.gates : [];
  const gates = rawGates.slice(0, 30).flatMap((raw) => {
    const gate = rawRecord(raw); const name = text(gate?.gate, 80); const reason = text(gate?.reason); const evidenceRef = nullableText(gate?.evidenceRef, 500); const status = ["pass", "hold", "fail"].includes(String(gate?.status)) ? gate?.status as "pass" | "hold" | "fail" : null;
    return name && reason && evidenceRef !== undefined && status ? [{ gate: name, status, reason, evidenceRef }] : [];
  });
  if (!gates.length || gates.length !== rawGates.length) return null;
  const immutableHashes = immutable && [immutable.targetHash, immutable.contentHash, immutable.assetHash, immutable.windowHash].every((hash) => typeof hash === "string" && sha256.test(hash))
    ? immutable as AdminSocialDailyOperation["immutableHashes"] : null;
  if ((item.immutableHashes !== null) !== (immutableHashes !== null)) return null;
  const parsedQueue = queue && text(queue.itemId, 160) && text(queue.itemRef, 500) && typeof queue.payloadHash === "string" && sha256.test(queue.payloadHash) && queue.status === "queued"
    ? { itemId: queue.itemId as string, itemRef: queue.itemRef as string, payloadHash: queue.payloadHash, status: "queued" as const } : null;
  if ((item.queue !== null) !== (parsedQueue !== null) || (outcome === "queued") !== (parsedQueue !== null && selectedCandidateRef !== null && immutableHashes !== null && scopeState === "matched")) return null;
  return { id, profileId: profile, connectionId: connection, targetDate: item.targetDate, selectionWindow: { notBefore: window.notBefore, notAfter: window.notAfter }, candidateCount: item.candidateRefs.length, selectedCandidateRef, immutableHashes, gates, routineScopeRef, routineScopeState: scopeState, queue: parsedQueue, outcome, reasons, providerConnectionState: providerState, actualCostUsd: item.actualCostUsd, incidentRefs: incidents, ownerAttentionRefs: attention, replayed: item.replayed, createdAt: item.createdAt };
}

export function parseAdminSocialRoutineScope(value: unknown): AdminSocialRoutineScope | null {
  const item = rawRecord(value); const history = Array.isArray(item?.history) ? item.history : []; const latest = rawRecord(history.at(-1));
  const id = text(item?.id, 180); const profile = text(item?.profileId, 140); const connection = text(item?.connectionId, 160); const version = text(item?.version, 40);
  const status = ["draft", "active", "revoked", "expired"].includes(String(item?.status)) ? item?.status as AdminSocialRoutineScope["status"] : null;
  const platform = ["instagram", "threads"].includes(String(item?.platform)) ? item?.platform as AdminSocialRoutineScope["platform"] : null;
  const contentClasses = strings(item?.allowedContentClasses, 4); const formats = strings(item?.allowedFormats, 20); const sourceKinds = strings(item?.allowedSourceKinds, 3);
  const approvalRef = nullableText(item?.approvalRef, 500); const countersignatureRef = nullableText(item?.countersignatureRef, 500); const revocationRef = nullableText(item?.revocationRef, 500);
  if (item?.schemaVersion !== "social-routine-scope/1" || !id || !profile || !profileId.test(profile) || !connection || !connectionId.test(connection) || !version || !status || !platform || !contentClasses?.length || !formats?.length || !sourceKinds?.length || typeof item.effectiveOn !== "string" || !date.test(item.effectiveOn) || typeof item.expiresOn !== "string" || !date.test(item.expiresOn) || approvalRef === undefined || countersignatureRef === undefined || revocationRef === undefined || !latest || !text(latest.action, 40) || !dateTime(latest.at)) return null;
  return { id, version, status, profileId: profile, connectionId: connection, platform, contentClasses, formats, sourceKinds, effectiveOn: item.effectiveOn, expiresOn: item.expiresOn, approvalRef, countersignatureRef, revocationRef, latestAction: latest.action as string, latestAt: latest.at };
}
