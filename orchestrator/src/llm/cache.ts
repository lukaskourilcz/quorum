import { createHash } from "node:crypto";
import { atomicWriteJson, readJson } from "../state.js";

export function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface CachedResponse<T> {
  requestHash: string;
  storedAt: string;
  value: T;
}

export async function readCachedResponse<T>(
  stateRoot: string,
  cycleId: string,
  phase: string,
  agent: string,
  hash: string
): Promise<T | null> {
  const relative = `cycles/${cycleId}/responses/${phase}/${agent}/${hash}.json`;
  const cached = await readJson<CachedResponse<T> | null>(stateRoot, relative, null);
  return cached?.requestHash === hash ? cached.value : null;
}

export async function writeCachedResponse<T>(
  stateRoot: string,
  cycleId: string,
  phase: string,
  agent: string,
  hash: string,
  value: T
): Promise<void> {
  const relative = `cycles/${cycleId}/responses/${phase}/${agent}/${hash}.json`;
  await atomicWriteJson(stateRoot, relative, {
    requestHash: hash,
    storedAt: new Date().toISOString(),
    value
  } satisfies CachedResponse<T>);
}

