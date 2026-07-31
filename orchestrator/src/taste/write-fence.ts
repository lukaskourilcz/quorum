import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import { VentureIdSchema } from "../contracts/common.js";
import { atomicWriteText, resolveStatePath } from "../state.js";

export interface PalateWrite {
  path: string;
  content: string;
}

export class PalateWriteFenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PalateWriteFenceError";
  }
}

export function palateWritePaths(ventureId: string): readonly string[] {
  const venture = VentureIdSchema.parse(ventureId);
  return [
    `state/taste/${venture}/TASTE.md`,
    `config/visual-weights/${venture}.json`
  ] as const;
}

export function validatePalateWrites(
  ventureId: string,
  writes: readonly PalateWrite[]
): PalateWrite[] {
  const allowed = new Set(palateWritePaths(ventureId));
  const seen = new Set<string>();
  return writes.map((write) => {
    const normalized = path.posix.normalize(write.path.replaceAll("\\", "/"));
    if (!allowed.has(normalized)) {
      throw new PalateWriteFenceError(`PALATE write denied: ${normalized}`);
    }
    if (seen.has(normalized)) {
      throw new PalateWriteFenceError(`PALATE write repeated: ${normalized}`);
    }
    if (!write.content || Buffer.byteLength(write.content, "utf8") > 40_000) {
      throw new PalateWriteFenceError(`PALATE write has an invalid size: ${normalized}`);
    }
    seen.add(normalized);
    return { path: normalized, content: write.content };
  });
}

export async function applyPalateWrites(
  repoRoot: string,
  ventureId: string,
  writes: readonly PalateWrite[]
): Promise<void> {
  const validated = validatePalateWrites(ventureId, writes);
  const previous = await Promise.all(validated.map(async (write) => {
    try {
      return { path: write.path, content: await readFile(resolveStatePath(repoRoot, write.path), "utf8"), existed: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { path: write.path, content: "", existed: false };
      }
      throw error;
    }
  }));
  try {
    for (const write of validated) {
      await atomicWriteText(repoRoot, write.path, write.content);
    }
  } catch (error) {
    for (const backup of previous) {
      if (backup.existed) await atomicWriteText(repoRoot, backup.path, backup.content);
      else await rm(resolveStatePath(repoRoot, backup.path), { force: true });
    }
    throw error;
  }
}
