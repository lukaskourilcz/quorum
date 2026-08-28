import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseAdminSocialDailyOperation, parseAdminSocialRoutineScope, type AdminSocialDailyOperation, type AdminSocialRoutineScope } from "./daily-model";
import { rawRecord } from "./model";

export interface AdminSocialDailySnapshot {
  targetDate: string;
  operations: AdminSocialDailyOperation[];
  routineScopes: AdminSocialRoutineScope[];
  summary: { queued: number; review: number; held: number; paused: number; noPost: number; attention: number; actualCostUsd: number };
  dropped: { operations: number; routineScopes: number; orphanRecords: number };
  unavailable: string[];
  authorityGranted: false;
  publishingAuthorized: false;
}

function pragueDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function readAdminSocialDaily(
  root: string,
  profileIds: ReadonlySet<string>,
  connectionIds: ReadonlySet<string>,
  now = new Date()
): Promise<AdminSocialDailySnapshot> {
  const directory = path.join(root, "state/social/profile-operations");
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  const accepted: AdminSocialDailyOperation[] = []; let droppedOperations = files === null ? 1 : 0;
  for (const file of (files ?? []).filter((name) => name.endsWith(".json")).sort().slice(0, 4_000)) {
    try { const parsed = parseAdminSocialDailyOperation(JSON.parse(await readFile(path.join(directory, file), "utf8")) as unknown); if (parsed) accepted.push(parsed); else droppedOperations += 1; } catch { droppedOperations += 1; }
  }
  let scopesValue: unknown = null; const unavailable: string[] = [];
  try { scopesValue = JSON.parse(await readFile(path.join(root, "config/social-routine-scopes.json"), "utf8")) as unknown; } catch (error) { unavailable.push(`routine scopes: ${(error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "malformed"}`); }
  const scopeRegistry = rawRecord(scopesValue); const rawScopes = scopeRegistry?.schemaVersion === "social-routine-scope-registry/1" && scopeRegistry.defaultMode === "draft-only" && Array.isArray(scopeRegistry.scopes) ? scopeRegistry.scopes.slice(0, 200) : [];
  const parsedScopes = rawScopes.map(parseAdminSocialRoutineScope); const validScopes = parsedScopes.filter((scope): scope is AdminSocialRoutineScope => scope !== null);
  if (scopesValue !== null && rawScopes.length === 0 && !(scopeRegistry?.schemaVersion === "social-routine-scope-registry/1" && Array.isArray(scopeRegistry.scopes))) unavailable.push("routine scopes: malformed");
  const targetDate = pragueDate(now); const known = accepted.filter((operation) => profileIds.has(operation.profileId) && connectionIds.has(operation.connectionId)); const operations = known.filter((operation) => operation.targetDate === targetDate).sort((left, right) => left.profileId.localeCompare(right.profileId) || left.connectionId.localeCompare(right.connectionId));
  const routineScopes = validScopes.filter((scope) => profileIds.has(scope.profileId) && connectionIds.has(scope.connectionId)).sort((left, right) => left.profileId.localeCompare(right.profileId));
  return {
    targetDate,
    operations,
    routineScopes,
    summary: { queued: operations.filter(({ outcome }) => outcome === "queued").length, review: operations.filter(({ outcome }) => outcome === "review").length, held: operations.filter(({ outcome }) => outcome === "held").length, paused: operations.filter(({ outcome }) => outcome === "paused").length, noPost: operations.filter(({ outcome }) => outcome === "NO_POST").length, attention: operations.filter(({ ownerAttentionRefs }) => ownerAttentionRefs.length > 0).length, actualCostUsd: operations.reduce((total, operation) => total + operation.actualCostUsd, 0) },
    dropped: { operations: droppedOperations, routineScopes: parsedScopes.length - validScopes.length, orphanRecords: accepted.length - known.length },
    unavailable,
    authorityGranted: false,
    publishingAuthorized: false
  };
}
