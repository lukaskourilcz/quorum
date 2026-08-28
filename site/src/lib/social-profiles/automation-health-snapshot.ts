import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { rawRecord } from "./model";

type HealthState = "healthy" | "quiet" | "held" | "degraded" | "stale" | "failing" | "paused" | "setup-needed" | "unavailable";
export interface AdminSocialAutomationHealth {
  state: HealthState; reason: string; generatedAt: string; observedAt: string; lastValidAt: string | null; lastSuccessfulAt: string | null; nextExpectedAt: string | null;
  queue: { state: "clear" | "pending" | "backlogged" | "reconciling" | "unavailable" | "not-applicable"; pending: number | null };
  freshness: { state: "fresh" | "stale" | "unavailable"; ageMinutes: number | null; lastKnownGoodRef: string | null };
  holds: { budget: string[]; provider: string[]; source: string[]; credential: string[]; owner: string[] };
  ownerAttentionRefs: string[]; latestRunReceiptRefs: string[];
}
export interface AdminSocialAutomationSnapshot {
  health: AdminSocialAutomationHealth | null;
  incident: { activeIncidentRefs: string[]; pausedScopes: string[]; nextRetryAt: string | null; exactOwnerActions: string[]; killSwitchActive: boolean } | null;
  unavailable: string[];
  safeActions: string[];
  recoveryController: "Operations Recovery";
  accountActionsAuthorized: false; providerSwitchAuthorized: false; silentResendAuthorized: false; publishingAuthorized: false;
}

const strings = (value: unknown, max: number): string[] | null => Array.isArray(value) && value.length <= max && value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 500) ? value as string[] : null;
const nullableText = (value: unknown): string | null | undefined => value === null ? null : typeof value === "string" && value.length > 0 ? value : undefined;
const nonnegative = (value: unknown): number | null | undefined => value === null ? null : typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;

function health(value: unknown): AdminSocialAutomationHealth | null {
  const item = rawRecord(value); const queue = rawRecord(item?.queue); const freshness = rawRecord(item?.freshness); const holds = rawRecord(item?.holds); const state = ["healthy", "quiet", "held", "degraded", "stale", "failing", "paused", "setup-needed", "unavailable"].includes(String(item?.state)) ? item?.state as HealthState : null;
  const queueState = ["clear", "pending", "backlogged", "reconciling", "unavailable", "not-applicable"].includes(String(queue?.state)) ? queue?.state as AdminSocialAutomationHealth["queue"]["state"] : null; const freshnessState = ["fresh", "stale", "unavailable"].includes(String(freshness?.state)) ? freshness?.state as AdminSocialAutomationHealth["freshness"]["state"] : null;
  const holdValues = { budget: strings(holds?.budget, 8), provider: strings(holds?.provider, 8), source: strings(holds?.source, 8), credential: strings(holds?.credential, 8), owner: strings(holds?.owner, 8) }; const ownerAttentionRefs = strings(item?.ownerAttentionRefs, 32); const latestRunReceiptRefs = strings(item?.latestRunReceiptRefs, 32);
  const lastValidAt = nullableText(item?.lastValidAt); const lastSuccessfulAt = nullableText(item?.lastSuccessfulAt); const nextExpectedAt = nullableText(item?.nextExpectedAt); const lastKnownGoodRef = nullableText(freshness?.lastKnownGoodRef); const pending = nonnegative(queue?.pending); const ageMinutes = nonnegative(freshness?.ageMinutes);
  if (item?.schemaVersion !== "venture-operation-health/1" || item.nodeId !== "social-distribution" || !state || typeof item.reason !== "string" || typeof item.generatedAt !== "string" || typeof item.observedAt !== "string" || !queueState || !freshnessState || Object.values(holdValues).some((entry) => entry === null) || !ownerAttentionRefs || !latestRunReceiptRefs || lastValidAt === undefined || lastSuccessfulAt === undefined || nextExpectedAt === undefined || lastKnownGoodRef === undefined || pending === undefined || ageMinutes === undefined) return null;
  return { state, reason: item.reason, generatedAt: item.generatedAt, observedAt: item.observedAt, lastValidAt, lastSuccessfulAt, nextExpectedAt, queue: { state: queueState, pending }, freshness: { state: freshnessState, ageMinutes, lastKnownGoodRef }, holds: holdValues as AdminSocialAutomationHealth["holds"], ownerAttentionRefs, latestRunReceiptRefs };
}

function incident(value: unknown): AdminSocialAutomationSnapshot["incident"] {
  const item = rawRecord(value); const activeIncidentRefs = strings(item?.activeIncidentRefs, 32); const pausedScopes = strings(item?.pausedScopes, 100); const exactOwnerActions = strings(item?.exactOwnerActions, 100); const nextRetryAt = nullableText(item?.nextRetryAt);
  return item?.schemaVersion === "operations-incident-snapshot/1" && activeIncidentRefs && pausedScopes && exactOwnerActions && nextRetryAt !== undefined && typeof item.killSwitchActive === "boolean" ? { activeIncidentRefs, pausedScopes, exactOwnerActions, nextRetryAt, killSwitchActive: item.killSwitchActive } : null;
}

async function json(root: string, relative: string): Promise<{ value: unknown | null; state: "present" | "missing" | "malformed" }> { try { try { return { value: JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown, state: "present" }; } catch { return { value: null, state: "malformed" }; } } catch (error) { return { value: null, state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "malformed" }; } }

export async function readAdminSocialAutomationHealth(root: string): Promise<AdminSocialAutomationSnapshot> {
  const [healthFile, incidentFile] = await Promise.all([json(root, "state/operations/health/social-distribution/current.json"), json(root, "state/operations/incidents/current.json")]);
  const parsedHealth = health(healthFile.value); const parsedIncident = incident(incidentFile.value); const unavailable: string[] = [];
  if (!parsedHealth) unavailable.push(`Social Distribution health: ${healthFile.state}`); if (incidentFile.state !== "missing" && !parsedIncident) unavailable.push(`Operations incident snapshot: ${incidentFile.state}`);
  return { health: parsedHealth, incident: parsedIncident, unavailable, safeActions: ["Inspect the exact evidence reference.", "Request reconciliation for an ambiguous exact connection; never resend silently.", "Pause the exact profile or connection scope.", "Reuse the last valid derived view while malformed new evidence is isolated."], recoveryController: "Operations Recovery", accountActionsAuthorized: false, providerSwitchAuthorized: false, silentResendAuthorized: false, publishingAuthorized: false };
}
