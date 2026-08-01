import "server-only";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

export interface OwnerOddsCapture {
  id: string;
  eventRef: string;
  schemaVersion: "odds-snapshot/1";
  boutRef: string;
  phase: "t3";
  source: "owner-entry";
  market: "moneyline";
  prices: Array<{ pick: "red" | "blue"; decimal: number }>;
  evidenceLabel: string;
  capturedAt: string;
}

export class OddsPersistenceError extends Error {}

const bounded = (value: unknown, maximum: number): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;

export function parseOwnerOddsCapture(value: unknown, now = new Date()): OwnerOddsCapture | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const eventRef = bounded(input.eventRef, 160);
  const boutRef = bounded(input.boutRef, 160);
  const evidenceLabel = bounded(input.sourceLabel, 240);
  const redOdds = typeof input.redOdds === "string" || typeof input.redOdds === "number" ? Number(input.redOdds) : Number.NaN;
  const blueOdds = typeof input.blueOdds === "string" || typeof input.blueOdds === "number" ? Number(input.blueOdds) : Number.NaN;
  if (!eventRef || !/^(ufc|oktagon):event:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventRef) || !boutRef || !evidenceLabel || !Number.isFinite(redOdds) || !Number.isFinite(blueOdds) || redOdds <= 1 || blueOdds <= 1 || redOdds > 1_000 || blueOdds > 1_000) return null;
  const capturedAt = now.toISOString();
  return {
    id: `owner-odds-${capturedAt.slice(0, 10)}-${randomUUID().slice(0, 8)}`,
    eventRef,
    schemaVersion: "odds-snapshot/1",
    boutRef,
    phase: "t3",
    source: "owner-entry",
    market: "moneyline",
    prices: [{ pick: "red", decimal: redOdds }, { pick: "blue", decimal: blueOdds }],
    evidenceLabel,
    capturedAt
  };
}

function relativePath(capture: OwnerOddsCapture): string {
  return `state/mma/odds/${capture.capturedAt.slice(0, 10)}/${capture.id}.json`;
}

async function writeFilesystem(capture: OwnerOddsCapture, root = repositoryRoot): Promise<"filesystem"> {
  const target = path.resolve(root, relativePath(capture));
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new OddsPersistenceError("The price path escaped the repository.");
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${capture.id}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(capture, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
  return "filesystem";
}

async function writeGitHub(capture: OwnerOddsCapture, token: string): Promise<"github"> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const encoded = relativePath(capture).split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${encoded}`, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10"
    },
    body: JSON.stringify({
      message: `admin: save FightAIQ price snapshot ${capture.id}`,
      content: Buffer.from(`${JSON.stringify(capture, null, 2)}\n`, "utf8").toString("base64"),
      branch
    })
  });
  if (!response.ok) throw new OddsPersistenceError(`GitHub price write failed with ${response.status}.`);
  return "github";
}

export async function saveOwnerOddsCapture(capture: OwnerOddsCapture): Promise<"filesystem" | "github"> {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return writeGitHub(capture, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new OddsPersistenceError("Price storage is not configured for this deployment.");
  return writeFilesystem(capture);
}
