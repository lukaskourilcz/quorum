import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { withinRoot } from "./paths.js";

export class StatePathError extends Error {}

export function resolveStatePath(root: string, relativePath: string): string {
  if (relativePath.includes("\0") || path.isAbsolute(relativePath)) {
    throw new StatePathError(`Unsafe state path: ${relativePath}`);
  }
  const resolved = path.resolve(root, relativePath);
  if (!withinRoot(root, resolved)) {
    throw new StatePathError(`State path escaped root: ${relativePath}`);
  }
  return resolved;
}

export async function readText(
  root: string,
  relativePath: string,
  fallback = ""
): Promise<string> {
  try {
    return await readFile(resolveStatePath(root, relativePath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function readJson<T>(
  root: string,
  relativePath: string,
  fallback: T
): Promise<T> {
  const raw = await readText(root, relativePath);
  if (!raw) {
    return fallback;
  }
  return JSON.parse(raw) as T;
}

export async function atomicWriteText(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const target = resolveStatePath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    await writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function atomicWriteBuffer(
  root: string,
  relativePath: string,
  content: Uint8Array
): Promise<void> {
  const target = resolveStatePath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    await writeFile(temp, content, { mode: 0o600 });
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function atomicWriteJson(
  root: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  await atomicWriteText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function appendJsonLine(
  root: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  const current = await readText(root, relativePath);
  await atomicWriteText(root, relativePath, `${current}${JSON.stringify(value)}\n`);
}

export async function withFileLock<T>(
  root: string,
  relativePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const lockPath = resolveStatePath(root, relativePath);
  await mkdir(path.dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Another BoardlessAI cycle owns ${relativePath}`);
    }
    throw error;
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })
    );
    return await operation();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}
