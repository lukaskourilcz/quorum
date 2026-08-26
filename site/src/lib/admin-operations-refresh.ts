import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function iso(value: unknown): string | null {
  return typeof value === "string" && value.length <= 80 && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

export const OPERATIONS_REFRESH_COOLDOWN_MS = 15 * 60 * 1_000;

export class OperationsRefreshError extends Error {
  constructor(readonly code: "COOLDOWN" | "CONFLICT" | "UNAVAILABLE", message: string) {
    super(message);
  }
}

export async function requestOperationsRefresh(input: {
  root?: string;
  now?: Date;
  requestedBy: string;
}): Promise<{ requestedAt: string; nextRequestAllowedAt: string }> {
  const root = input.root ?? repositoryRoot();
  const now = input.now ?? new Date();
  const requestedBy = input.requestedBy.trim();
  if (!requestedBy || requestedBy.length > 120) {
    throw new OperationsRefreshError("UNAVAILABLE", "The refresh requester is invalid.");
  }
  const stateDirectory = path.join(root, "state/operations");
  const lockPath = path.join(stateDirectory, "refresh-request.lock");
  try {
    await mkdir(stateDirectory, { recursive: true });
  } catch {
    throw new OperationsRefreshError("UNAVAILABLE", "The refresh request store is unavailable.");
  }
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new OperationsRefreshError("CONFLICT", "Another refresh request is being recorded.");
    }
    throw new OperationsRefreshError("UNAVAILABLE", "The refresh request store is unavailable.");
  }
  try {
    const target = path.join(stateDirectory, "refresh-request.json");
    try {
      const current = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
      const requestedAt = iso(current.requestedAt);
      const nextRequestAllowedAt = iso(current.nextRequestAllowedAt);
      if (current.schemaVersion !== "operations-refresh-request/1" || !requestedAt || !nextRequestAllowedAt ||
        Date.parse(nextRequestAllowedAt) < Date.parse(requestedAt)) {
        throw new OperationsRefreshError("UNAVAILABLE", "The existing refresh request is unreadable.");
      }
      if (now.getTime() - Date.parse(requestedAt) < OPERATIONS_REFRESH_COOLDOWN_MS) {
        throw new OperationsRefreshError("COOLDOWN", "An Operations refresh was already requested inside the cooldown window.");
      }
    } catch (error) {
      if (error instanceof OperationsRefreshError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new OperationsRefreshError("UNAVAILABLE", "The existing refresh request is unreadable.");
      }
    }
    const requestedAt = now.toISOString();
    const nextRequestAllowedAt = new Date(now.getTime() + OPERATIONS_REFRESH_COOLDOWN_MS).toISOString();
    const value = { schemaVersion: "operations-refresh-request/1", requestedAt, requestedBy, nextRequestAllowedAt };
    const temporary = path.join(stateDirectory, `.refresh-request.${process.pid}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, target);
    } catch {
      await rm(temporary, { force: true });
      throw new OperationsRefreshError("UNAVAILABLE", "The refresh request could not be recorded.");
    }
    return { requestedAt, nextRequestAllowedAt };
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
