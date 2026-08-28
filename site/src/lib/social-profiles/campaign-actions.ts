import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSocialCampaign, parseSocialCampaignEvent, type SocialCampaignEventRecord, type SocialCampaignRecord } from "./campaign-model";
import { campaignItemBindingHash, campaignTargetApprovalHash, projectAdminCampaign } from "./campaign-projection";
import { rawRecord } from "./model";

const TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";
const campaignId = /^social-campaign-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const hash = /^[a-f0-9]{64}$/u;
const sensitive = /(access[_ -]?token|client[_ -]?secret|authorization\s*[:=]|bearer\s+[a-z0-9._-]+|gh[opsu]_[a-z0-9]+|session[_ -]?cookie)/iu;

export type SocialCampaignAdminAction = {
  type: "approve-target" | "reject-target" | "correct-item" | "change-window" | "hold" | "cancel";
  campaignId: string;
  targetId: string | null;
  itemId: string | null;
  expectedBindingHash: string | null;
  reason: string;
  replacement: { text: string | null; destination: string | null; altText: string | null; notBefore: string | null; notAfter: string | null } | null;
};

export class SocialCampaignActionError extends Error {
  constructor(readonly code: "INVALID" | "REFUSED" | "CORRUPT" | "CONFLICT" | "UNCONFIGURED" | "REMOTE", message: string) { super(message); }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
function normalized(value: unknown, max: number): string | null { if (typeof value !== "string") return null; const result = value.normalize("NFKC").trim(); return result.length > 0 && result.length <= max && !sensitive.test(result) ? result : null; }

export function parseSocialCampaignAdminAction(value: unknown): SocialCampaignAdminAction | null {
  const item = rawRecord(value); if (!item || !exactKeys(item, ["type", "campaignId", "targetId", "itemId", "expectedBindingHash", "reason", "replacement"])) return null;
  const type = ["approve-target", "reject-target", "correct-item", "change-window", "hold", "cancel"].includes(String(item.type)) ? item.type as SocialCampaignAdminAction["type"] : null;
  const id = typeof item.campaignId === "string" && campaignId.test(item.campaignId) ? item.campaignId : null; const reason = normalized(item.reason, 500);
  const targetId = item.targetId === null ? null : typeof item.targetId === "string" && slug.test(item.targetId) ? item.targetId : undefined;
  const itemId = item.itemId === null ? null : typeof item.itemId === "string" && slug.test(item.itemId) ? item.itemId : undefined;
  const expected = item.expectedBindingHash === null ? null : typeof item.expectedBindingHash === "string" && hash.test(item.expectedBindingHash) ? item.expectedBindingHash : undefined;
  if (!type || !id || !reason || targetId === undefined || itemId === undefined || expected === undefined) return null;
  const targetAction = ["approve-target", "reject-target"].includes(type); const itemAction = ["correct-item", "change-window"].includes(type);
  if (targetAction !== (targetId !== null) || itemAction !== (itemId !== null) || ["approve-target", "reject-target", "correct-item", "change-window"].includes(type) !== (expected !== null)) return null;
  if (itemAction !== (item.replacement !== null)) return null;
  let replacement: SocialCampaignAdminAction["replacement"] = null;
  if (itemAction) {
    const raw = rawRecord(item.replacement); if (!raw || !exactKeys(raw, ["text", "destination", "altText", "notBefore", "notAfter"])) return null;
    const text = raw.text === null ? null : normalized(raw.text, 2_200); const destination = raw.destination === null ? null : normalized(raw.destination, 500); const altText = raw.altText === null ? null : normalized(raw.altText, 1_000); const notBefore = raw.notBefore === null ? null : typeof raw.notBefore === "string" && !Number.isNaN(Date.parse(raw.notBefore)) ? new Date(raw.notBefore).toISOString() : undefined; const notAfter = raw.notAfter === null ? null : typeof raw.notAfter === "string" && !Number.isNaN(Date.parse(raw.notAfter)) ? new Date(raw.notAfter).toISOString() : undefined;
    if (text === undefined || destination === undefined || altText === undefined || notBefore === undefined || notAfter === undefined || (destination !== null && !destination.startsWith("https://"))) return null;
    if (type === "correct-item" && text === null && destination === null && altText === null) return null;
    if (type === "change-window" && (notBefore === null || notAfter === null || Date.parse(notAfter) <= Date.parse(notBefore) || text !== null || destination !== null || altText !== null)) return null;
    replacement = { text, destination, altText, notBefore, notAfter };
  }
  return { type, campaignId: id, targetId, itemId, expectedBindingHash: expected, reason, replacement };
}

function repositoryRoot(explicit?: string): string { return explicit ?? process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), ".."); }

async function campaignState(root: string, id: string): Promise<{ immutable: SocialCampaignRecord; projected: SocialCampaignRecord; events: SocialCampaignEventRecord[] }> {
  const directory = path.join(root, "state/social/campaigns"); const eventDirectory = path.join(root, "state/social/campaign-events");
  const files = await readdir(directory).catch(() => []); let immutable: SocialCampaignRecord | null = null;
  for (const file of files.filter((name) => name.endsWith(".json") && !name.endsWith(".decision.json"))) {
    try { const parsed = parseSocialCampaign(JSON.parse(await readFile(path.join(directory, file), "utf8")) as unknown); if (parsed?.id === id) { immutable = parsed; break; } } catch { /* fail closed below */ }
  }
  if (!immutable) throw new SocialCampaignActionError("REFUSED", "The selected campaign is not a validated verified-release record.");
  const events: SocialCampaignEventRecord[] = [];
  for (const file of await readdir(eventDirectory).catch(() => [])) {
    if (!file.endsWith(".json")) continue;
    try { const parsed = parseSocialCampaignEvent(JSON.parse(await readFile(path.join(eventDirectory, file), "utf8")) as unknown); if (parsed?.campaignId === id) events.push(parsed); } catch { /* malformed event cannot grant authority */ }
  }
  return { immutable, projected: projectAdminCampaign(immutable, events).campaign, events };
}

function authorize(action: SocialCampaignAdminAction, campaign: SocialCampaignRecord): { item: SocialCampaignRecord["channelItems"][number] | null; replacementBindingHash: string | null } {
  if (["completed", "expired"].includes(campaign.status)) throw new SocialCampaignActionError("REFUSED", "A completed or expired campaign cannot receive this action.");
  if (action.type === "approve-target" || action.type === "reject-target") {
    if (action.type === "approve-target" && campaign.status === "held") throw new SocialCampaignActionError("REFUSED", "A held campaign must remain held; its stop control wins over approval.");
    const target = campaign.targets.find((candidate) => candidate.id === action.targetId); const items = campaign.channelItems.filter((item) => item.targetId === action.targetId);
    if (!target || target.fit !== "eligible" || items.length === 0) throw new SocialCampaignActionError("REFUSED", "Only an eligible owned target with immutable items can receive an owner decision.");
    if (campaignTargetApprovalHash(items) !== action.expectedBindingHash) throw new SocialCampaignActionError("CONFLICT", "The target content or window changed; reload before deciding.");
    return { item: null, replacementBindingHash: null };
  }
  if (action.type === "hold" || action.type === "cancel") return { item: null, replacementBindingHash: null };
  const item = campaign.channelItems.find((candidate) => candidate.id === action.itemId);
  if (!item || ["queued", "publishing", "published", "expired", "cancelled"].includes(item.status)) throw new SocialCampaignActionError("REFUSED", "Only an unqueued owned campaign item can receive a bounded edit.");
  if (item.approval.bindingHash !== action.expectedBindingHash || !action.replacement) throw new SocialCampaignActionError("CONFLICT", "The item content or window changed; reload before editing.");
  const copy = { ...item.copy, text: action.replacement.text ?? item.copy.text, destination: action.replacement.destination ?? item.copy.destination, assets: action.replacement.altText === null ? item.copy.assets : item.copy.assets.map((asset, index) => index === 0 ? { ...asset, altText: action.replacement!.altText! } : asset) };
  if (action.replacement.altText !== null && item.copy.assets.length === 0) throw new SocialCampaignActionError("REFUSED", "Alt text cannot be attached to an item without an approved asset.");
  const window = action.replacement.notBefore && action.replacement.notAfter ? { notBefore: action.replacement.notBefore, notAfter: action.replacement.notAfter } : item.window;
  if (Date.parse(window.notBefore) < Date.parse(campaign.createdAt)) throw new SocialCampaignActionError("REFUSED", "A replacement window cannot precede campaign creation.");
  return { item, replacementBindingHash: campaignItemBindingHash({ targetHash: item.targetHash, copy, window, policyHash: item.policyHash }) };
}

function eventFor(action: SocialCampaignAdminAction, bindingHash: string | null, now: Date): SocialCampaignEventRecord {
  const completeReplacement = action.replacement ? { ...action.replacement, bindingHash: bindingHash! } : null;
  const digest = createHash("sha256").update(JSON.stringify({ ...action, replacement: completeReplacement })).digest("hex").slice(0, 24);
  return { eventId: `social-campaign-event-admin-${digest}`, campaignId: action.campaignId, targetId: action.targetId, itemId: action.itemId, action: action.type, at: now.toISOString(), actor: "owner", reason: action.reason, expectedBindingHash: action.expectedBindingHash, replacement: completeReplacement };
}

function sameEvent(left: SocialCampaignEventRecord, right: SocialCampaignEventRecord): boolean {
  return left.eventId === right.eventId && left.campaignId === right.campaignId && left.action === right.action && left.targetId === right.targetId && left.itemId === right.itemId && left.reason === right.reason && left.expectedBindingHash === right.expectedBindingHash && JSON.stringify(left.replacement) === JSON.stringify(right.replacement);
}

function sameRequestedAction(event: SocialCampaignEventRecord, action: SocialCampaignAdminAction): boolean {
  return event.campaignId === action.campaignId && event.action === action.type && event.targetId === action.targetId && event.itemId === action.itemId && event.reason === action.reason && event.expectedBindingHash === action.expectedBindingHash
    && (action.replacement === null ? event.replacement === null : event.replacement !== null && event.replacement.text === action.replacement.text && event.replacement.destination === action.replacement.destination && event.replacement.altText === action.replacement.altText && event.replacement.notBefore === action.replacement.notBefore && event.replacement.notAfter === action.replacement.notAfter);
}

async function writeLocal(root: string, event: SocialCampaignEventRecord): Promise<{ changed: boolean; persistence: "filesystem" }> {
  const directory = path.join(root, "state/social/campaign-events"); const target = path.join(directory, `${event.eventId}.json`); await mkdir(directory, { recursive: true });
  try { await writeFile(target, `${JSON.stringify({ schemaVersion: "social-campaign-event/1", ...event }, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 }); return { changed: true, persistence: "filesystem" }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; try { const existing = parseSocialCampaignEvent(JSON.parse(await readFile(target, "utf8")) as unknown); if (existing && sameEvent(existing, event)) return { changed: false, persistence: "filesystem" }; } catch { /* conflict below */ } throw new SocialCampaignActionError("CONFLICT", "The campaign event id already belongs to different evidence."); }
}

function githubContext(): { repository: string; branch: string; token: string } | null { const token = process.env[TOKEN_ENV]; return token ? { repository: process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum", branch: process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main", token } : null; }

async function writeGitHub(event: SocialCampaignEventRecord, context: NonNullable<ReturnType<typeof githubContext>>): Promise<{ changed: boolean; persistence: "github" }> {
  const relative = `state/social/campaign-events/${event.eventId}.json`; const endpoint = `https://api.github.com/repos/${context.repository}/contents/${relative}`; const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${context.token}`, "X-GitHub-Api-Version": "2026-03-10" }; const content = `${JSON.stringify({ schemaVersion: "social-campaign-event/1", ...event }, null, 2)}\n`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await fetch(`${endpoint}?ref=${encodeURIComponent(context.branch)}`, { headers, cache: "no-store" });
    if (current.ok) { const body = await current.json() as { content?: string; encoding?: string }; const existing = body.encoding === "base64" && body.content ? parseSocialCampaignEvent(JSON.parse(Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8")) as unknown) : null; if (existing && sameEvent(existing, event)) return { changed: false, persistence: "github" }; throw new SocialCampaignActionError("CONFLICT", "The campaign event id already belongs to different remote evidence."); }
    if (current.status !== 404) throw new SocialCampaignActionError("REMOTE", `GitHub campaign-event read failed with ${current.status}.`);
    const response = await fetch(endpoint, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ message: `admin(social): record ${event.action} for ${event.campaignId}`, content: Buffer.from(content, "utf8").toString("base64"), branch: context.branch }) });
    if (response.ok) return { changed: true, persistence: "github" }; if (![409, 422].includes(response.status)) throw new SocialCampaignActionError("REMOTE", `GitHub campaign-event write failed with ${response.status}.`);
  }
  throw new SocialCampaignActionError("CONFLICT", "The campaign event changed during every retry.");
}

export async function applySocialCampaignAdminAction(value: unknown, options: { root?: string; now?: Date } = {}): Promise<{ changed: boolean; event: SocialCampaignEventRecord; persistence: "filesystem" | "github" }> {
  const action = parseSocialCampaignAdminAction(value); if (!action) throw new SocialCampaignActionError("INVALID", "The campaign action is invalid or contains an unsafe field.");
  const now = options.now ?? new Date(); if (Number.isNaN(now.getTime())) throw new SocialCampaignActionError("INVALID", "The campaign event time is invalid.");
  const root = repositoryRoot(options.root); const state = await campaignState(root, action.campaignId); const existing = state.events.find((event) => sameRequestedAction(event, action)); if (existing) return { changed: false, event: existing, persistence: githubContext() ? "github" : "filesystem" }; const authorization = authorize(action, state.projected); const event = eventFor(action, authorization.replacementBindingHash, now); const parsed = parseSocialCampaignEvent({ schemaVersion: "social-campaign-event/1", ...event }); if (!parsed) throw new SocialCampaignActionError("CORRUPT", "The bounded campaign event could not be validated.");
  const remote = githubContext(); if (remote) return { ...await writeGitHub(event, remote), event }; if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new SocialCampaignActionError("UNCONFIGURED", "GitHub writing is not configured for this Admin."); return { ...await writeLocal(root, event), event };
}
