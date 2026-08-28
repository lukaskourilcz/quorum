import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { rawRecord } from "./model";
import {
  parseSocialInventoryIncident,
  parseSocialInventoryReceipt,
  parseSocialProfileInventory,
  parseSocialProfileStrategy,
  type SocialInventoryIncidentRecord,
  type SocialInventoryReceiptRecord,
  type SocialProfileInventoryRecord,
  type SocialProfileStrategyRecord
} from "./inventory-model";

export interface AdminContentRunwayView {
  strategy: SocialProfileStrategyRecord;
  inventory: SocialProfileInventoryRecord | null;
  latestReceipt: SocialInventoryReceiptRecord | null;
  incidents: SocialInventoryIncidentRecord[];
  state: "healthy" | "low-runway" | "no-candidate" | "held" | "unavailable";
}

export interface AdminContentRunwaySnapshot {
  profiles: AdminContentRunwayView[];
  receipts: SocialInventoryReceiptRecord[];
  incidents: SocialInventoryIncidentRecord[];
  summary: { strategies: number; healthy: number; lowOrNoRunway: number; unavailable: number; actualCostUsd: number };
  dropped: { strategies: number; inventories: number; receipts: number; incidents: number; orphanRecords: number };
  unavailable: string[];
  authorityGranted: false;
  queueAuthorized: false;
  publishingAuthorized: false;
}

async function json(file: string): Promise<{ state: "present" | "missing" | "malformed"; value: unknown | null }> {
  try {
    try { return { state: "present", value: JSON.parse(await readFile(file, "utf8")) as unknown }; } catch { return { state: "malformed", value: null }; }
  } catch (error) { return { state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "malformed", value: null }; }
}

async function directoryRecords<T>(directory: string, parser: (value: unknown) => T | null, limit: number): Promise<{ accepted: T[]; dropped: number; unavailable: boolean }> {
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  if (files === null) return { accepted: [], dropped: 1, unavailable: true };
  const accepted: T[] = []; let dropped = 0;
  for (const name of files.filter((file) => file.endsWith(".json")).sort().slice(0, limit)) {
    try { const parsed = parser(JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown); if (parsed) accepted.push(parsed); else dropped += 1; }
    catch { dropped += 1; }
  }
  return { accepted, dropped, unavailable: false };
}

async function inventories(root: string): Promise<{ accepted: SocialProfileInventoryRecord[]; dropped: number; unavailable: boolean }> {
  const directory = path.join(root, "state/social/inventory");
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  if (entries === null) return { accepted: [], dropped: 1, unavailable: true };
  const accepted: SocialProfileInventoryRecord[] = []; let dropped = 0;
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((left, right) => left.name.localeCompare(right.name)).slice(0, 200)) {
    const file = await json(path.join(directory, entry.name, "current.json"));
    if (file.state === "missing") continue;
    const parsed = parseSocialProfileInventory(file.value);
    if (parsed) accepted.push(parsed); else dropped += 1;
  }
  return { accepted, dropped, unavailable: false };
}

export async function readAdminContentRunway(root: string, allowedProfileIds?: ReadonlySet<string>): Promise<AdminContentRunwaySnapshot> {
  const [registryFile, inventoryState, receiptState, incidentState] = await Promise.all([
    json(path.join(root, "config/social-profile-strategies.json")), inventories(root),
    directoryRecords(path.join(root, "state/social/inventory-receipts"), parseSocialInventoryReceipt, 2_000),
    directoryRecords(path.join(root, "state/social/inventory-incidents"), parseSocialInventoryIncident, 2_000)
  ]);
  const unavailable: string[] = [];
  if (registryFile.state !== "present") unavailable.push(`strategy registry: ${registryFile.state}`);
  if (inventoryState.unavailable) unavailable.push("content inventories: unavailable");
  if (receiptState.unavailable) unavailable.push("inventory receipts: unavailable");
  if (incidentState.unavailable) unavailable.push("inventory incidents: unavailable");
  const registry = rawRecord(registryFile.value); const rawStrategies = registry?.schemaVersion === "social-profile-strategy-registry/1" && Array.isArray(registry.strategies) ? registry.strategies.slice(0, 200) : [];
  const parsedStrategies = rawStrategies.map(parseSocialProfileStrategy); const strategies = parsedStrategies.filter((strategy): strategy is SocialProfileStrategyRecord => strategy !== null);
  const permitted = allowedProfileIds ?? new Set(strategies.map(({ profileId }) => profileId));
  const acceptedStrategies = strategies.filter(({ profileId }) => permitted.has(profileId));
  const acceptedInventories = inventoryState.accepted.filter(({ profileId }) => permitted.has(profileId));
  const receipts = receiptState.accepted.filter(({ profileId }) => permitted.has(profileId)).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  const incidents = incidentState.accepted.filter(({ profileId }) => permitted.has(profileId)).sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
  const orphanRecords = strategies.length - acceptedStrategies.length + inventoryState.accepted.length - acceptedInventories.length + receiptState.accepted.length - receipts.length + incidentState.accepted.length - incidents.length;
  const profiles = acceptedStrategies.map((strategy): AdminContentRunwayView => {
    const inventory = acceptedInventories.find(({ profileId }) => profileId === strategy.profileId) ?? null;
    return { strategy, inventory, latestReceipt: receipts.find(({ profileId }) => profileId === strategy.profileId) ?? null, incidents: incidents.filter(({ profileId }) => profileId === strategy.profileId), state: inventory?.state ?? "unavailable" };
  });
  return {
    profiles, receipts, incidents,
    summary: { strategies: profiles.length, healthy: profiles.filter(({ state }) => state === "healthy").length, lowOrNoRunway: profiles.filter(({ state }) => state === "low-runway" || state === "no-candidate").length, unavailable: profiles.filter(({ state }) => state === "unavailable").length, actualCostUsd: receipts.reduce((total, receipt) => total + receipt.actualCostUsd, 0) },
    dropped: { strategies: parsedStrategies.length - strategies.length, inventories: inventoryState.dropped, receipts: receiptState.dropped, incidents: incidentState.dropped, orphanRecords },
    unavailable, authorityGranted: false, queueAuthorized: false, publishingAuthorized: false
  };
}
