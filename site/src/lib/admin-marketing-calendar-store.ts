import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isMarketingCalendarVenture,
  marketingCalendarPath,
  type MarketingCalendarVentureId
} from "@/lib/admin-marketing-calendar";
import { CALENDAR_OWNER_STATUSES, parseMarketingCalendar, type CalendarOwnerStatus } from "@/lib/marketing-calendar-model";

/**
 * The admin Calendar's one writer (quorum#592).
 *
 * It changes exactly three things in a `marketing-calendar/1` document: an entry's owner-set
 * `status`, an entry's `note`, and a pre-launch item's `status`. Everything else in the file is
 * written back as it was read. `queued` and `published` are refused because the Queue owns them;
 * nothing here posts, schedules or opens a room. With `BOARDLESSAI_GITHUB_TOKEN` the change is a
 * commit on the configured branch; in development it is an atomic local write; in production
 * without a token the write is unavailable and the panel says so.
 */

export const MARKETING_CALENDAR_NOTE_LIMIT = 500;

export type MarketingCalendarAction =
  | { venture: MarketingCalendarVentureId; action: "entry"; id: string; status?: CalendarOwnerStatus; note?: string | null }
  | { venture: MarketingCalendarVentureId; action: "prelaunch"; id: string; done: boolean };

export interface MarketingCalendarActionResult {
  persistence: "github" | "filesystem";
  id: string;
  status: string;
  note: string | null;
}

export class MarketingCalendarPersistenceError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "CORRUPT" | "REMOTE", message: string) {
    super(message);
  }
}

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/u;

/** Hand-written validation of the request body; null means 422. */
export function parseMarketingCalendarAction(value: unknown): MarketingCalendarAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (!isMarketingCalendarVenture(body.venture) || typeof body.id !== "string" || !ID.test(body.id)) return null;
  if (body.action === "prelaunch") {
    if (typeof body.done !== "boolean" || keys.some((key) => !["venture", "action", "id", "done"].includes(key))) return null;
    return { venture: body.venture, action: "prelaunch", id: body.id, done: body.done };
  }
  if (body.action !== "entry" || keys.some((key) => !["venture", "action", "id", "status", "note"].includes(key))) return null;
  if (body.status === undefined && body.note === undefined) return null;
  if (body.status !== undefined && !(CALENDAR_OWNER_STATUSES as readonly unknown[]).includes(body.status)) return null;
  if (body.note !== undefined && body.note !== null && (typeof body.note !== "string" || body.note.length > MARKETING_CALENDAR_NOTE_LIMIT)) return null;
  const note = typeof body.note === "string" ? body.note.trim() || null : body.note === null ? null : undefined;
  return {
    venture: body.venture,
    action: "entry",
    id: body.id,
    ...(body.status === undefined ? {} : { status: body.status as CalendarOwnerStatus }),
    ...(note === undefined ? {} : { note })
  };
}

type Json = Record<string, unknown>;

/** Applies one action to the raw document and returns the next document and what changed. */
export function applyMarketingCalendarChange(document: unknown, action: MarketingCalendarAction): { next: Json; id: string; status: string; note: string | null } {
  if (!parseMarketingCalendar(document).ok) throw new MarketingCalendarPersistenceError("CORRUPT", "The saved plan is malformed, so nothing was changed.");
  const next = structuredClone(document) as Json;
  if (action.action === "prelaunch") {
    const items = Array.isArray(next.prelaunch) ? next.prelaunch as Json[] : [];
    const item = items.find((candidate) => candidate && candidate.id === action.id);
    if (!item) throw new MarketingCalendarPersistenceError("NOT_FOUND", `No pre-launch item ${action.id} in this plan.`);
    item.status = action.done ? "done" : "planned";
    return { next, id: action.id, status: item.status as string, note: null };
  }
  const entries = Array.isArray(next.entries) ? next.entries as Json[] : [];
  const entry = entries.find((candidate) => candidate && candidate.id === action.id);
  if (!entry) throw new MarketingCalendarPersistenceError("NOT_FOUND", `No entry ${action.id} in this plan.`);
  const note = action.note === undefined ? (typeof entry.note === "string" ? entry.note : null) : action.note;
  const status = action.status ?? (entry.status as string);
  if (status === "blocked" && !note && typeof entry.blockedBy !== "string") {
    throw new MarketingCalendarPersistenceError("INVALID", "Say in the note what blocks this entry.");
  }
  if (action.status) entry.status = action.status;
  if (action.note !== undefined) {
    if (action.note) entry.note = action.note;
    else delete entry.note;
  }
  return { next, id: action.id, status, note };
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function serialise(document: Json): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function writeLocal(root: string, relative: string, action: MarketingCalendarAction) {
  const target = path.join(root, relative);
  let current: unknown;
  try {
    current = JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new MarketingCalendarPersistenceError("NOT_FOUND", `No plan is committed at ${relative}.`);
    throw new MarketingCalendarPersistenceError("CORRUPT", `${relative} is not valid JSON.`);
  }
  const change = applyMarketingCalendarChange(current, action);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, serialise(change.next), "utf8");
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return change;
}

async function writeGitHub(relative: string, action: MarketingCalendarAction, token: string) {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${relative}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (response.status === 404) throw new MarketingCalendarPersistenceError("NOT_FOUND", `No plan is committed at ${relative}.`);
    if (!response.ok) throw new MarketingCalendarPersistenceError("REMOTE", `GitHub plan read failed with ${response.status}.`);
    const current = await response.json() as { content?: string; encoding?: string; sha?: string };
    if (current.encoding !== "base64" || !current.content || !current.sha) throw new MarketingCalendarPersistenceError("REMOTE", "GitHub returned an unreadable plan file.");
    let document: unknown;
    try {
      document = JSON.parse(Buffer.from(current.content.replaceAll("\n", ""), "base64").toString("utf8"));
    } catch {
      throw new MarketingCalendarPersistenceError("CORRUPT", `${relative} is not valid JSON.`);
    }
    const change = applyMarketingCalendarChange(document, action);
    const what = action.action === "prelaunch" ? `${action.id} ${change.status}` : `${action.id} ${change.status}${action.note !== undefined ? " + note" : ""}`;
    const update = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `admin: marketing calendar ${action.venture} ${what}`,
        content: Buffer.from(serialise(change.next)).toString("base64"),
        branch,
        sha: current.sha
      }),
      signal: AbortSignal.timeout(12_000)
    });
    if (update.ok) return change;
    if (update.status !== 409) throw new MarketingCalendarPersistenceError("REMOTE", `GitHub plan write failed with ${update.status}.`);
  }
  throw new MarketingCalendarPersistenceError("CONFLICT", "The plan changed during every save attempt. Reload and try again.");
}

export async function applyMarketingCalendarAction(action: MarketingCalendarAction, options: { root?: string } = {}): Promise<MarketingCalendarActionResult> {
  const relative = marketingCalendarPath(action.venture);
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) {
    const change = await writeGitHub(relative, action, token);
    return { persistence: "github", id: change.id, status: change.status, note: change.note };
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new MarketingCalendarPersistenceError("UNAVAILABLE", "GitHub writing is not configured for this admin, so the plan is read-only here.");
  }
  const change = await writeLocal(options.root ?? repositoryRoot(), relative, action);
  return { persistence: "filesystem", id: change.id, status: change.status, note: change.note };
}
