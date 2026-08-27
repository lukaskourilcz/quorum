import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SUGGESTION_ID = /^pg-thread-[a-f0-9]{16}$/u;
const pendingWrites = new Map<string, Promise<unknown>>();

export type PersonalGrowthAdminAction =
  | {
    type: "anchor";
    lane: "okraj" | "bbarak";
    date: string;
    reason: string;
  }
  | {
    type: "timeline";
    lane: "okraj" | "bbarak";
    occurrenceDate: string;
    operation: "completed" | "skipped" | "rescheduled";
    reason: string;
    rescheduledTo: string | null;
    finalUrl: string | null;
    collaborationUrl: string | null;
  }
  | {
    type: "thread";
    suggestionId: string;
    operation: "approved" | "rejected" | "snoozed" | "posted";
    reason: string | null;
    postUrl: string | null;
  };

export type PersonalGrowthPersistenceCode =
  | "CONFLICT"
  | "INVALID"
  | "CORRUPT"
  | "UNCONFIGURED"
  | "REFUSED"
  | "REMOTE";

export class PersonalGrowthAdminStoreError extends Error {
  constructor(readonly code: PersonalGrowthPersistenceCode, message: string) {
    super(message);
  }
}

interface Persisted<T> {
  value: T;
  commit: string | null;
  idempotent: boolean;
  persistence: "filesystem" | "github";
}

type PersistMutation<T> = (current: unknown | null) => { value: T; idempotent: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function cleanText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maximum && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text) ? text : null;
}

function validDate(value: unknown): string | null {
  const text = cleanText(value, 10);
  return text && DATE.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00.000Z`)) ? text : null;
}

function validUrl(value: unknown): string | null {
  if (value === null || value === "") return null;
  const text = cleanText(value, 500);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function lane(value: unknown): "okraj" | "bbarak" | null {
  return value === "okraj" || value === "bbarak" ? value : null;
}

export function parsePersonalGrowthAdminAction(value: unknown): PersonalGrowthAdminAction | null {
  const input = record(value);
  if (!input || typeof input.type !== "string") return null;
  if (input.type === "anchor") {
    if (!hasOnlyKeys(input, ["type", "lane", "date", "reason"])) return null;
    const parsedLane = lane(input.lane);
    const parsedDate = validDate(input.date);
    const reason = cleanText(input.reason, 500);
    return parsedLane && parsedDate && reason
      ? { type: "anchor", lane: parsedLane, date: parsedDate, reason }
      : null;
  }
  if (input.type === "timeline") {
    if (!hasOnlyKeys(input, ["type", "lane", "occurrenceDate", "operation", "reason", "rescheduledTo", "finalUrl", "collaborationUrl"])) return null;
    const parsedLane = lane(input.lane);
    const occurrenceDate = validDate(input.occurrenceDate);
    const operation = input.operation === "completed" || input.operation === "skipped" || input.operation === "rescheduled"
      ? input.operation
      : null;
    const reason = cleanText(input.reason, 500);
    const rescheduledTo = validDate(input.rescheduledTo);
    const finalUrl = validUrl(input.finalUrl);
    const collaborationUrl = validUrl(input.collaborationUrl);
    if (!parsedLane || !occurrenceDate || !operation || !reason) return null;
    if ((operation === "rescheduled") !== (rescheduledTo !== null)) return null;
    if (operation !== "completed" && (finalUrl !== null || collaborationUrl !== null)) return null;
    if (input.finalUrl !== null && input.finalUrl !== "" && finalUrl === null) return null;
    if (input.collaborationUrl !== null && input.collaborationUrl !== "" && collaborationUrl === null) return null;
    return {
      type: "timeline",
      lane: parsedLane,
      occurrenceDate,
      operation,
      reason,
      rescheduledTo,
      finalUrl,
      collaborationUrl
    };
  }
  if (input.type === "thread") {
    if (!hasOnlyKeys(input, ["type", "suggestionId", "operation", "reason", "postUrl"])) return null;
    const suggestionId = cleanText(input.suggestionId, 80);
    const operation = input.operation === "approved" || input.operation === "rejected" || input.operation === "snoozed" || input.operation === "posted"
      ? input.operation
      : null;
    const reason = input.reason === null || input.reason === "" ? null : cleanText(input.reason, 500);
    const postUrl = validUrl(input.postUrl);
    if (!suggestionId?.match(SUGGESTION_ID) || !operation || (input.reason !== null && input.reason !== "" && !reason)) return null;
    if ((operation === "posted") !== (postUrl !== null)) return null;
    if (input.postUrl !== null && input.postUrl !== "" && postUrl === null) return null;
    return { type: "thread", suggestionId, operation, reason, postUrl };
  }
  return null;
}

function repositoryRoot(explicitRoot?: string): string {
  return explicitRoot ?? process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function shortHash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex").slice(0, 16);
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new PersonalGrowthAdminStoreError("CORRUPT", `${label} is not valid JSON.`);
  }
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  pendingWrites.set(key, next);
  try {
    return await next;
  } finally {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  }
}

function localPath(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
    throw new PersonalGrowthAdminStoreError("INVALID", "Personal Growth state path escaped the repository.");
  }
  return target;
}

async function writeLocal<T>(relative: string, mutate: PersistMutation<T>, root: string): Promise<Persisted<T>> {
  const target = localPath(root, relative);
  return serialized(target, async () => {
    let current: unknown | null = null;
    try {
      current = parseJson(await readFile(target, "utf8"), relative);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const changed = mutate(current);
    if (!changed.idempotent) {
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, jsonText(changed.value), { encoding: "utf8", mode: 0o600 });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    return { ...changed, commit: null, persistence: "filesystem" };
  });
}

function githubFailure(status: number, what: string): PersonalGrowthAdminStoreError {
  if (status === 401 || status === 403) {
    return new PersonalGrowthAdminStoreError(
      "REFUSED",
      `GitHub refused the Personal Growth ${what} with ${status}. ${TOKEN_ENV} is expired or lacks Contents read and write.`
    );
  }
  return new PersonalGrowthAdminStoreError("REMOTE", `GitHub Personal Growth ${what} failed with ${status}.`);
}

async function writeGitHub<T>(
  relative: string,
  mutate: PersistMutation<T>,
  message: string,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<Persisted<T>> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${relative.split("/").map(encodeURIComponent).join("/")}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10"
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetcher(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    let current: unknown | null = null;
    let sha: string | undefined;
    if (response.status !== 404) {
      if (!response.ok) throw githubFailure(response.status, "read");
      const body = await response.json() as { content?: unknown; encoding?: unknown; sha?: unknown };
      if (body.encoding !== "base64" || typeof body.content !== "string" || typeof body.sha !== "string") {
        throw new PersonalGrowthAdminStoreError("REMOTE", "GitHub returned an invalid Personal Growth file.");
      }
      current = parseJson(Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8"), relative);
      sha = body.sha;
    }
    const changed = mutate(current);
    if (changed.idempotent) return { ...changed, commit: null, persistence: "github" };
    const update = await fetcher(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(jsonText(changed.value), "utf8").toString("base64"),
        branch,
        ...(sha ? { sha } : {})
      })
    });
    if (update.ok) {
      const body = await update.json().catch(() => ({})) as { commit?: { sha?: unknown } };
      return {
        ...changed,
        commit: typeof body.commit?.sha === "string" ? body.commit.sha.slice(0, 7) : null,
        persistence: "github"
      };
    }
    if (update.status !== 409 && !(update.status === 422 && sha === undefined)) throw githubFailure(update.status, "write");
  }
  throw new PersonalGrowthAdminStoreError("CONFLICT", "Personal Growth state changed during every save attempt.");
}

async function persist<T>(
  relative: string,
  mutate: PersistMutation<T>,
  message: string,
  root: string
): Promise<Persisted<T>> {
  const token = process.env[TOKEN_ENV];
  if (token) return writeGitHub(relative, mutate, message, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new PersonalGrowthAdminStoreError(
      "UNCONFIGURED",
      `${TOKEN_ENV} is not set on this deployment, so the Personal Growth owner action was not recorded.`
    );
  }
  return writeLocal(relative, mutate, root);
}

function parsePlannerForWrite(value: unknown): { raw: Record<string, unknown>; lanes: Record<string, unknown>[] } {
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-planner-config/1" || input.ventureId !== "personal-growth" ||
      !Array.isArray(input.lanes) || input.lanes.length !== 2 || input.lanes.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth planner configuration is malformed.");
  }
  return { raw: input, lanes: input.lanes as Record<string, unknown>[] };
}

function parseAnchorHistory(value: unknown | null): { schemaVersion: "personal-growth-admin-anchor-history/1"; revisions: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-admin-anchor-history/1", revisions: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-anchor-history/1" || !Array.isArray(input.revisions) || input.revisions.length > 500 || input.revisions.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth anchor history is malformed.");
  }
  return { schemaVersion: "personal-growth-admin-anchor-history/1", revisions: input.revisions as Record<string, unknown>[] };
}

function parseTimelineHistory(value: unknown | null): { schemaVersion: "personal-growth-history/1"; events: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-history/1", events: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-history/1" || !Array.isArray(input.events) || input.events.length > 500 || input.events.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth timeline history is malformed.");
  }
  return { schemaVersion: "personal-growth-history/1", events: input.events as Record<string, unknown>[] };
}

function parseTimelineReasons(value: unknown | null): { schemaVersion: "personal-growth-admin-timeline-reasons/1"; reasons: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-admin-timeline-reasons/1", reasons: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-timeline-reasons/1" || !Array.isArray(input.reasons) || input.reasons.length > 500 || input.reasons.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth timeline correction notes are malformed.");
  }
  return { schemaVersion: "personal-growth-admin-timeline-reasons/1", reasons: input.reasons as Record<string, unknown>[] };
}

function parseThreadDecisions(value: unknown | null): { schemaVersion: "personal-growth-admin-thread-decisions/1"; decisions: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-admin-thread-decisions/1", decisions: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-thread-decisions/1" || !Array.isArray(input.decisions) || input.decisions.length > 500 || input.decisions.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth Threads decision history is malformed.");
  }
  return { schemaVersion: "personal-growth-admin-thread-decisions/1", decisions: input.decisions as Record<string, unknown>[] };
}

async function applyAnchor(
  action: Extract<PersonalGrowthAdminAction, { type: "anchor" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const configPath = "config/personal-growth-planner.json";
  const raw = parseJson(await readFile(localPath(root, configPath), "utf8"), configPath);
  const planner = parsePlannerForWrite(raw);
  const currentLane = planner.lanes.find((entry) => entry.lane === action.lane);
  if (!currentLane || validDate(currentLane.recurrenceAnchorDate) === null) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", `The ${action.lane.toUpperCase()} planner lane is malformed.`);
  }
  const previousDate = currentLane.recurrenceAnchorDate as string;
  const identity = { lane: action.lane, previousDate, nextDate: action.date, reason: action.reason };
  const id = `pg-anchor-${shortHash(identity)}`;
  if (previousDate === action.date) return { changed: false, commits: [], id };
  const historyWrite = await persist(
    "state/ventures/personal-growth/admin/anchor-history.json",
    (current) => {
      const history = parseAnchorHistory(current);
      if (history.revisions.some((entry) => entry.id === id)) return { value: history, idempotent: true };
      return {
        value: {
          ...history,
          revisions: [...history.revisions, { id, ...identity, recordedAt: now.toISOString() }]
        },
        idempotent: false
      };
    },
    `admin(personal-growth): record ${action.lane} anchor correction`,
    root
  );
  const configWrite = await persist(
    configPath,
    (current) => {
      const latest = parsePlannerForWrite(current);
      const existing = latest.lanes.find((entry) => entry.lane === action.lane);
      if (!existing) throw new PersonalGrowthAdminStoreError("CORRUPT", `The ${action.lane.toUpperCase()} planner lane is missing.`);
      if (existing.recurrenceAnchorDate === action.date) return { value: latest.raw, idempotent: true };
      return {
        value: {
          ...latest.raw,
          lanes: latest.lanes.map((entry) => entry.lane === action.lane ? { ...entry, recurrenceAnchorDate: action.date } : entry)
        },
        idempotent: false
      };
    },
    `admin(personal-growth): set ${action.lane} anchor ${action.date}`,
    root
  );
  return {
    changed: !historyWrite.idempotent || !configWrite.idempotent,
    commits: [historyWrite.commit, configWrite.commit].filter((commit): commit is string => commit !== null),
    id
  };
}

async function applyTimeline(
  action: Extract<PersonalGrowthAdminAction, { type: "timeline" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const identity = {
    lane: action.lane,
    occurrenceDate: action.occurrenceDate,
    action: action.operation,
    rescheduledTo: action.rescheduledTo,
    finalUrl: action.finalUrl,
    collaborationUrl: action.collaborationUrl,
    reason: action.reason
  };
  const eventId = `pg-event-${shortHash(identity)}`;
  const event = {
    schemaVersion: "personal-growth-history-event/1",
    eventId,
    lane: action.lane,
    occurrenceDate: action.occurrenceDate,
    action: action.operation,
    recordedAt: now.toISOString(),
    rescheduledTo: action.rescheduledTo,
    finalUrl: action.lane === "okraj" ? action.finalUrl : null,
    articleUrl: action.lane === "bbarak" ? action.finalUrl : null,
    collaborationUrl: action.lane === "bbarak" ? action.collaborationUrl : null
  };
  const historyWrite = await persist(
    "state/ventures/personal-growth/history.json",
    (current) => {
      const history = parseTimelineHistory(current);
      if (history.events.some((entry) => entry.eventId === eventId)) return { value: history, idempotent: true };
      return { value: { ...history, events: [...history.events, event] }, idempotent: false };
    },
    `admin(personal-growth): ${action.operation} ${action.lane} ${action.occurrenceDate}`,
    root
  );
  const reasonWrite = await persist(
    "state/ventures/personal-growth/admin/timeline-reasons.json",
    (current) => {
      const history = parseTimelineReasons(current);
      if (history.reasons.some((entry) => entry.eventId === eventId)) return { value: history, idempotent: true };
      return {
        value: { ...history, reasons: [...history.reasons, { eventId, reason: action.reason, recordedAt: now.toISOString() }] },
        idempotent: false
      };
    },
    `admin(personal-growth): explain ${eventId}`,
    root
  );
  return {
    changed: !historyWrite.idempotent || !reasonWrite.idempotent,
    commits: [historyWrite.commit, reasonWrite.commit].filter((commit): commit is string => commit !== null),
    id: eventId
  };
}

async function applyThread(
  action: Extract<PersonalGrowthAdminAction, { type: "thread" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const identity = {
    suggestionId: action.suggestionId,
    action: action.operation,
    reason: action.reason,
    postUrl: action.postUrl
  };
  const decisionId = `pg-thread-decision-${shortHash(identity)}`;
  const write = await persist(
    "state/ventures/personal-growth/admin/thread-decisions.json",
    (current) => {
      const history = parseThreadDecisions(current);
      if (history.decisions.some((entry) => entry.decisionId === decisionId)) return { value: history, idempotent: true };
      return {
        value: {
          ...history,
          decisions: [...history.decisions, {
            decisionId,
            suggestionId: action.suggestionId,
            action: action.operation,
            reason: action.reason,
            postUrl: action.postUrl,
            recordedAt: now.toISOString()
          }]
        },
        idempotent: false
      };
    },
    `admin(personal-growth): record Threads ${action.operation}`,
    root
  );
  return { changed: !write.idempotent, commits: write.commit ? [write.commit] : [], id: decisionId };
}

export async function applyPersonalGrowthAdminAction(
  raw: unknown,
  options: { root?: string; now?: Date } = {}
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const action = parsePersonalGrowthAdminAction(raw);
  if (!action) throw new PersonalGrowthAdminStoreError("INVALID", "The Personal Growth action is invalid or exceeds its bounded fields.");
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new PersonalGrowthAdminStoreError("INVALID", "The Personal Growth action time is invalid.");
  const root = repositoryRoot(options.root);
  if (action.type === "anchor") return applyAnchor(action, now, root);
  if (action.type === "timeline") return applyTimeline(action, now, root);
  return applyThread(action, now, root);
}
