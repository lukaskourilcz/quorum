import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSocialConnection, parseSocialProfile, parseSocialProfileEvent, rawRecord, type SocialProfileEventRecord } from "./model";

const TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";
const MAX_REASON = 500;
const identifier = /^social-(?:profile|connection)-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const sensitive = /(access[_ -]?token|client[_ -]?secret|authorization\s*[:=]|bearer\s+[a-z0-9._-]+|gh[opsu]_[a-z0-9]+)/iu;

export type SocialProfileAdminAction =
  | { type: "pause-profile" | "reject-profile" | "retire-profile" | "request-setup"; profileId: string; connectionId: null; reason: string }
  | { type: "pause-connection" | "disconnect-connection" | "request-reauthorisation"; profileId: string; connectionId: string; reason: string };

export class SocialProfileActionError extends Error {
  constructor(readonly code: "INVALID" | "REFUSED" | "CORRUPT" | "CONFLICT" | "UNCONFIGURED" | "REMOTE", message: string) { super(message); }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parseSocialProfileAdminAction(value: unknown): SocialProfileAdminAction | null {
  const item = rawRecord(value); if (!item || !exactKeys(item, ["type", "profileId", "connectionId", "reason"])) return null;
  const profileId = typeof item.profileId === "string" && identifier.test(item.profileId) && item.profileId.startsWith("social-profile-") ? item.profileId : null;
  const reason = typeof item.reason === "string" ? item.reason.normalize("NFKC").trim() : "";
  if (!profileId || reason.length < 5 || reason.length > MAX_REASON || sensitive.test(reason)) return null;
  if (["pause-profile", "reject-profile", "retire-profile", "request-setup"].includes(String(item.type))) {
    return item.connectionId === null ? { type: item.type as "pause-profile" | "reject-profile" | "retire-profile" | "request-setup", profileId, connectionId: null, reason } : null;
  }
  if (["pause-connection", "disconnect-connection", "request-reauthorisation"].includes(String(item.type)) && typeof item.connectionId === "string" && identifier.test(item.connectionId) && item.connectionId.startsWith("social-connection-")) {
    return { type: item.type as "pause-connection" | "disconnect-connection" | "request-reauthorisation", profileId, connectionId: item.connectionId, reason };
  }
  return null;
}

function repositoryRoot(explicit?: string): string {
  return explicit ?? process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function actionEvent(action: SocialProfileAdminAction, now: Date): SocialProfileEventRecord {
  const eventAction = action.type === "pause-profile" || action.type === "pause-connection" ? "paused"
    : action.type === "reject-profile" ? "rejected"
      : action.type === "retire-profile" ? "retired"
        : action.type === "request-setup" ? "setup-requested"
          : action.type === "disconnect-connection" ? "disconnected" : "reauthorisation-requested";
  const digest = createHash("sha256").update(JSON.stringify({ type: action.type, profileId: action.profileId, connectionId: action.connectionId, reason: action.reason })).digest("hex").slice(0, 20);
  return {
    eventId: `social-profile-event-admin-${digest}`,
    at: now.toISOString(),
    profileId: action.profileId,
    connectionId: action.connectionId,
    action: eventAction,
    actor: "owner",
    provenanceRef: "admin:social-profiles",
    reason: action.reason,
    supersededEventRef: null
  };
}

async function registryRecords(root: string): Promise<{ profiles: ReturnType<typeof parseSocialProfile>[]; connections: ReturnType<typeof parseSocialConnection>[] }> {
  let value: unknown;
  try { value = JSON.parse(await readFile(path.join(root, "config/social-publisher-registry.json"), "utf8")) as unknown; } catch { throw new SocialProfileActionError("CORRUPT", "The Social Profiles registry is unavailable or malformed."); }
  const registry = rawRecord(value);
  if (registry?.schemaVersion !== "social-publisher-registry/1" || !Array.isArray(registry.profiles) || !Array.isArray(registry.connections)) throw new SocialProfileActionError("CORRUPT", "The Social Profiles registry is malformed.");
  const profiles = registry.profiles.map(parseSocialProfile); const connections = registry.connections.map(parseSocialConnection);
  if (profiles.some((profile) => profile === null) || connections.some((connection) => connection === null)) throw new SocialProfileActionError("CORRUPT", "A Social Profiles registry record is malformed.");
  return { profiles, connections };
}

function authorize(action: SocialProfileAdminAction, records: Awaited<ReturnType<typeof registryRecords>>): void {
  const profile = records.profiles.find((candidate) => candidate?.id === action.profileId);
  if (!profile) throw new SocialProfileActionError("REFUSED", "The selected profile is not a validated registry record.");
  if (profile.kind !== "owned-brand" || profile.role === "simulation" || ["personal-growth", "kvorum"].includes(profile.ventureRef ?? "")) throw new SocialProfileActionError("REFUSED", "This record cannot receive Social Profiles lifecycle actions.");
  if (action.connectionId !== null) {
    const connection = records.connections.find((candidate) => candidate?.id === action.connectionId);
    if (!connection || connection.profileId !== profile.id) throw new SocialProfileActionError("REFUSED", "The selected connection is not bound to this profile.");
  }
  if (["reject-profile", "retire-profile"].includes(action.type) && profile.lifecycle === "active") throw new SocialProfileActionError("REFUSED", "Pause an active profile before rejecting or retiring it.");
}

function sameEvent(left: SocialProfileEventRecord, right: SocialProfileEventRecord): boolean {
  return left.eventId === right.eventId && left.profileId === right.profileId && left.connectionId === right.connectionId && left.action === right.action && left.actor === right.actor && left.provenanceRef === right.provenanceRef && left.reason === right.reason && left.supersededEventRef === right.supersededEventRef;
}

async function writeLocal(root: string, event: SocialProfileEventRecord): Promise<{ changed: boolean; persistence: "filesystem" }> {
  const directory = path.join(root, "state/social/profile-events"); const target = path.join(directory, `${event.eventId}.json`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(target, `${JSON.stringify({ schemaVersion: "social-profile-event/1", ...event }, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { changed: true, persistence: "filesystem" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      const existing = parseSocialProfileEvent(JSON.parse(await readFile(target, "utf8")) as unknown);
      if (existing && sameEvent(existing, event)) return { changed: false, persistence: "filesystem" };
    } catch { /* conflict below */ }
    throw new SocialProfileActionError("CONFLICT", "The lifecycle event id already belongs to different evidence.");
  }
}

function githubContext(): { repository: string; branch: string; token: string } | null {
  const token = process.env[TOKEN_ENV]; if (!token) return null;
  return { repository: process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum", branch: process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main", token };
}

async function writeGitHub(event: SocialProfileEventRecord, context: NonNullable<ReturnType<typeof githubContext>>): Promise<{ changed: boolean; persistence: "github" }> {
  const relative = `state/social/profile-events/${event.eventId}.json`; const endpoint = `https://api.github.com/repos/${context.repository}/contents/${relative}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${context.token}`, "X-GitHub-Api-Version": "2026-03-10" };
  const content = `${JSON.stringify({ schemaVersion: "social-profile-event/1", ...event }, null, 2)}\n`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await fetch(`${endpoint}?ref=${encodeURIComponent(context.branch)}`, { headers, cache: "no-store" });
    if (current.ok) {
      const body = await current.json() as { content?: string; encoding?: string };
      const existing = body.encoding === "base64" && body.content ? parseSocialProfileEvent(JSON.parse(Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8")) as unknown) : null;
      if (existing && sameEvent(existing, event)) return { changed: false, persistence: "github" };
      throw new SocialProfileActionError("CONFLICT", "The lifecycle event id already belongs to different remote evidence.");
    }
    if (current.status !== 404) throw new SocialProfileActionError("REMOTE", `GitHub lifecycle-event read failed with ${current.status}.`);
    const response = await fetch(endpoint, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ message: `admin(social): record ${event.action} for ${event.profileId}`, content: Buffer.from(content, "utf8").toString("base64"), branch: context.branch }) });
    if (response.ok) return { changed: true, persistence: "github" };
    if (![409, 422].includes(response.status)) throw new SocialProfileActionError("REMOTE", `GitHub lifecycle-event write failed with ${response.status}.`);
  }
  throw new SocialProfileActionError("CONFLICT", "The lifecycle event changed during every retry.");
}

export async function applySocialProfileAdminAction(value: unknown, options: { root?: string; now?: Date } = {}): Promise<{ changed: boolean; event: SocialProfileEventRecord; persistence: "filesystem" | "github" }> {
  const action = parseSocialProfileAdminAction(value); if (!action) throw new SocialProfileActionError("INVALID", "The Social Profiles action is invalid or contains an unsafe field.");
  const now = options.now ?? new Date(); if (Number.isNaN(now.getTime())) throw new SocialProfileActionError("INVALID", "The lifecycle time is invalid.");
  const root = repositoryRoot(options.root); authorize(action, await registryRecords(root)); const event = actionEvent(action, now);
  const parsed = parseSocialProfileEvent({ schemaVersion: "social-profile-event/1", ...event }); if (!parsed) throw new SocialProfileActionError("CORRUPT", "The bounded lifecycle event could not be validated.");
  const remote = githubContext();
  if (remote) return { ...await writeGitHub(event, remote), event };
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new SocialProfileActionError("UNCONFIGURED", "GitHub writing is not configured for this Admin.");
  return { ...await writeLocal(root, event), event };
}
