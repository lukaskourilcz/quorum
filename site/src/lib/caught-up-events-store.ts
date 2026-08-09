import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The events the owner maintains by hand for the DNESKAi /akce page.
 *
 * Nothing fetches these: they are the one manual category in the magazine, so
 * the store's whole job is to keep a human edit honest. Future events are
 * editable; a past event is not, because it is a record of something that
 * already happened and silently rewriting it would be indistinguishable from
 * inventing it.
 */
export const EVENT_SCOPES = ["cz", "global"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export interface MagazineEvent {
  id: string;
  scope: EventScope;
  title: string;
  description?: string;
  starts: string;
  ends?: string;
  city?: string;
  venue?: string;
  online: boolean;
  url: string;
  price?: string;
  organizer?: string;
  added?: string;
  /** Set only by an explicit correction to a past event, never by an edit. */
  corrected?: string;
}

export interface EventsFile {
  schemaVersion: "boardless-events/1";
  updated: string;
  events: MagazineEvent[];
}

export class EventsPersistenceError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/u;

const RELATIVE_STORE = "state/ventures/caught-up/events/events.json";
const RELATIVE_RECEIPTS = "state/ventures/caught-up/events/receipts";

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

/** One event from untrusted admin input, or null when it cannot be trusted. */
export function parseEvent(value: unknown): MagazineEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;

  const id = text(v.id, 80);
  const title = text(v.title, 120);
  if (!id || !SLUG.test(id)) return null;
  if (!title) return null;
  if (typeof v.scope !== "string" || !(EVENT_SCOPES as readonly string[]).includes(v.scope)) return null;
  if (typeof v.starts !== "string" || !DATE.test(v.starts)) return null;
  if (typeof v.url !== "string" || !v.url.startsWith("https://")) return null;
  try {
    new URL(v.url);
  } catch {
    return null;
  }
  const ends = typeof v.ends === "string" && DATE.test(v.ends) ? v.ends : undefined;
  if (ends && ends < v.starts) return null;

  return {
    id,
    scope: v.scope as EventScope,
    title,
    starts: v.starts,
    online: v.online === true,
    url: v.url,
    ...(ends ? { ends } : {}),
    ...(text(v.description, 280) ? { description: text(v.description, 280) } : {}),
    ...(text(v.city, 80) ? { city: text(v.city, 80) } : {}),
    ...(text(v.venue, 120) ? { venue: text(v.venue, 120) } : {}),
    ...(text(v.price, 80) ? { price: text(v.price, 80) } : {}),
    ...(text(v.organizer, 120) ? { organizer: text(v.organizer, 120) } : {}),
    ...(typeof v.added === "string" && DATE.test(v.added) ? { added: v.added } : {}),
    ...(typeof v.corrected === "string" && DATE.test(v.corrected) ? { corrected: v.corrected } : {}),
  };
}

export function parseEventsFile(value: unknown): EventsFile | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== "boardless-events/1") return null;
  if (typeof v.updated !== "string" || !DATE.test(v.updated)) return null;
  if (!Array.isArray(v.events)) return null;
  const events: MagazineEvent[] = [];
  const seen = new Set<string>();
  for (const raw of v.events) {
    const event = parseEvent(raw);
    if (!event || seen.has(event.id)) return null;
    seen.add(event.id);
    events.push(event);
  }
  return { schemaVersion: "boardless-events/1", updated: v.updated, events };
}

export function emptyEventsFile(today: string): EventsFile {
  return { schemaVersion: "boardless-events/1", updated: today, events: [] };
}

export interface ApplyResult {
  file: EventsFile;
  action: "created" | "updated" | "archived";
}

/**
 * Apply one admin save.
 *
 * A past event is immutable unless the caller says, in the payload, that this
 * is a correction. That flag is the whole difference between fixing a record
 * and quietly rewriting history, so it has to be stated rather than inferred.
 */
export function applyEvent(
  current: EventsFile,
  incoming: MagazineEvent,
  options: { today: string; correction?: boolean; archive?: boolean },
): ApplyResult {
  const existing = current.events.find((event) => event.id === incoming.id);
  const isPast = (event: MagazineEvent) => (event.ends ?? event.starts) < options.today;

  if (existing && isPast(existing) && !options.correction) {
    throw new EventsPersistenceError("A past event can only be changed as an explicit correction.");
  }
  if (options.archive) {
    if (!existing) throw new EventsPersistenceError("Nothing to archive under that id.");
    return {
      file: {
        ...current,
        updated: options.today,
        events: current.events.filter((event) => event.id !== incoming.id),
      },
      action: "archived",
    };
  }

  const next: MagazineEvent = {
    ...incoming,
    added: existing?.added ?? incoming.added ?? options.today,
    ...(existing && isPast(existing) && options.correction ? { corrected: options.today } : {}),
  };

  const events = existing
    ? current.events.map((event) => (event.id === incoming.id ? next : event))
    : [...current.events, next];
  events.sort((a, b) => a.starts.localeCompare(b.starts) || a.title.localeCompare(b.title));

  return {
    file: { ...current, updated: options.today, events },
    action: existing ? "updated" : "created",
  };
}

function repositoryRoot(): string {
  return path.resolve(process.cwd(), "..");
}

function resolveInsideRepo(relative: string): string {
  const root = repositoryRoot();
  const target = path.join(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
    throw new EventsPersistenceError("The events path escaped the repository.");
  }
  return target;
}

export async function readEventsFile(today: string): Promise<EventsFile> {
  try {
    const raw = await readFile(resolveInsideRepo(RELATIVE_STORE), "utf8");
    return parseEventsFile(JSON.parse(raw)) ?? emptyEventsFile(today);
  } catch {
    return emptyEventsFile(today);
  }
}

async function writeFilesystem(file: EventsFile, receipt: unknown, id: string): Promise<"filesystem"> {
  const target = resolveInsideRepo(RELATIVE_STORE);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${id}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  const receiptPath = resolveInsideRepo(`${RELATIVE_RECEIPTS}/${file.updated}-${id}.json`);
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return "filesystem";
}

async function putGitHub(relative: string, body: string, message: string, token: string): Promise<void> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  const base = `https://api.github.com/repos/${repository}/contents/${encoded}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2026-03-10",
  };
  // The store is one file rewritten in place, so the update needs the blob sha
  // it is replacing. Without it GitHub refuses the write rather than clobbering.
  const head = await fetch(`${base}?ref=${encodeURIComponent(branch)}`, { headers });
  const sha = head.ok ? ((await head.json()) as { sha?: string }).sha : undefined;
  const response = await fetch(base, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message,
      content: Buffer.from(body, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) throw new EventsPersistenceError(`GitHub events write failed with ${response.status}.`);
}

export async function saveEventsFile(
  file: EventsFile,
  receipt: unknown,
  id: string,
): Promise<"filesystem" | "github"> {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) {
    await putGitHub(RELATIVE_STORE, `${JSON.stringify(file, null, 2)}\n`, `admin: save DNESKAi event ${id}`, token);
    await putGitHub(
      `${RELATIVE_RECEIPTS}/${file.updated}-${id}.json`,
      `${JSON.stringify(receipt, null, 2)}\n`,
      `admin: event receipt ${file.updated}-${id}`,
      token,
    );
    return "github";
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new EventsPersistenceError("Event storage is not configured for this deployment.");
  }
  return writeFilesystem(file, receipt, id);
}
