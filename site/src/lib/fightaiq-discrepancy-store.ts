import "server-only";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const fighterRefPattern = /^(ufc|ksw|oktagon):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

type JsonValue = string | number | boolean | null | Array<string | number | boolean>;

export interface DiscrepancyResolution {
  fighterRef: string;
  field: string;
  selectedSourceRef: string;
  reason: string;
  resolvedAt: string;
}

export class DiscrepancyPersistenceError extends Error {}

const bounded = (value: unknown, maximum: number): string | null =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim()
    : null;

export function parseDiscrepancyResolution(value: unknown, now = new Date()): DiscrepancyResolution | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const fighterRef = bounded(input.fighterRef, 160);
  const field = bounded(input.field, 80);
  const selectedSourceRef = bounded(input.selectedSourceRef, 240);
  const reason = bounded(input.reason, 280);
  if (!fighterRef?.match(fighterRefPattern) || !field?.match(/^[A-Za-z][A-Za-z0-9_.-]*$/) || !selectedSourceRef || !reason) return null;
  return { fighterRef, field, selectedSourceRef, reason, resolvedAt: now.toISOString() };
}

function relativePath(fighterRef: string): string {
  const match = fighterRef.match(fighterRefPattern);
  if (!match) throw new DiscrepancyPersistenceError("The fighter reference is invalid.");
  return `state/ventures/fightaiq/fighters/${match[1]}/${match[2]}.json`;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyResolution(raw: string, resolution: DiscrepancyResolution): string {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new DiscrepancyPersistenceError("The fighter file is not valid JSON."); }
  const record = object(parsed);
  const fields = object(record?.fields);
  const discrepancies = Array.isArray(record?.discrepancies) ? record.discrepancies : null;
  if (record?.schemaVersion !== "fighter-record/1" || record.id !== resolution.fighterRef || !fields || !discrepancies) {
    throw new DiscrepancyPersistenceError("The fighter file does not match the requested record.");
  }
  const index = discrepancies.findIndex((value) => {
    const item = object(value);
    return item?.field === resolution.field && item.status === "open";
  });
  if (index < 0) throw new DiscrepancyPersistenceError("That disagreement is no longer open.");
  const discrepancy = object(discrepancies[index]);
  const candidates = Array.isArray(discrepancy?.values) ? discrepancy.values : [];
  const selected = candidates.map(object).find((candidate) => candidate?.sourceRef === resolution.selectedSourceRef);
  const selectedValue = selected?.value as JsonValue | undefined;
  if (!selected || selectedValue === undefined) throw new DiscrepancyPersistenceError("Choose one of the stored source values.");

  const agreeingSources = candidates
    .map(object)
    .filter((candidate) => candidate && sameValue(candidate.value, selectedValue))
    .map((candidate) => bounded(candidate?.sourceRef, 240))
    .filter((sourceRef): sourceRef is string => Boolean(sourceRef));
  const currentField = object(fields[resolution.field]);
  if (!currentField) throw new DiscrepancyPersistenceError("The disputed field is missing from the fighter file.");
  const corroborated = new Set(agreeingSources).size >= 2;
  fields[resolution.field] = {
    ...currentField,
    value: selectedValue,
    sourceRefs: [...new Set(agreeingSources)],
    retrievedAt: resolution.resolvedAt,
    status: corroborated ? "verified" : "provisional",
    corroborated
  };
  discrepancies[index] = {
    ...discrepancy,
    status: "resolved",
    resolution: resolution.reason,
    selectedSourceRef: resolution.selectedSourceRef,
    resolvedAt: resolution.resolvedAt
  };

  const openFields = new Set(discrepancies.flatMap((value) => {
    const item = object(value);
    return item?.status === "open" && typeof item.field === "string" ? [item.field] : [];
  }));
  const criticalFields = Array.isArray(record.criticalFields) ? record.criticalFields.filter((value): value is string => typeof value === "string") : [];
  record.modelEligible = criticalFields.length > 0 && criticalFields.every((name) => {
    const field = object(fields[name]);
    return field?.status === "verified" && field.corroborated === true && Array.isArray(field.sourceRefs) && new Set(field.sourceRefs).size >= 2 && !openFields.has(name);
  });
  const fieldValues = Object.values(fields).map(object).filter((field): field is Record<string, unknown> => Boolean(field));
  record.corroboration = fieldValues.length ? fieldValues.filter((field) => field.corroborated === true).length / fieldValues.length : 0;
  record.updatedAt = resolution.resolvedAt;
  return `${JSON.stringify(record, null, 2)}\n`;
}

async function writeFilesystem(resolution: DiscrepancyResolution, root = repositoryRoot): Promise<"filesystem"> {
  const target = path.resolve(root, relativePath(resolution.fighterRef));
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new DiscrepancyPersistenceError("The fighter path escaped the repository.");
  const updated = applyResolution(await readFile(target, "utf8"), resolution);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, updated, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
  return "filesystem";
}

async function writeGitHub(resolution: DiscrepancyResolution, token: string): Promise<"github"> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const encoded = relativePath(resolution.fighterRef).split("/").map(encodeURIComponent).join("/");
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encoded}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
  const current = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
  if (!current.ok) throw new DiscrepancyPersistenceError(`GitHub fighter read failed with ${current.status}.`);
  const existing = await current.json() as { content?: string; encoding?: string; sha?: string };
  if (existing.encoding !== "base64" || !existing.content || !existing.sha) throw new DiscrepancyPersistenceError("GitHub returned an unreadable fighter file.");
  const updated = applyResolution(Buffer.from(existing.content.replace(/\s/g, ""), "base64").toString("utf8"), resolution);
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `admin: resolve FightAIQ ${resolution.fighterRef} ${resolution.field}`,
      content: Buffer.from(updated, "utf8").toString("base64"),
      sha: existing.sha,
      branch
    })
  });
  if (!response.ok) throw new DiscrepancyPersistenceError(`GitHub fighter write failed with ${response.status}.`);
  return "github";
}

export async function saveDiscrepancyResolution(resolution: DiscrepancyResolution, root = repositoryRoot): Promise<"filesystem" | "github"> {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return writeGitHub(resolution, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new DiscrepancyPersistenceError("Fighter storage is not configured for this deployment.");
  return writeFilesystem(resolution, root);
}
