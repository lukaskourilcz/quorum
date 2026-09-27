import { SocialReferenceMonitorSchema, SocialReferenceQuotaSchema, ReferenceAccountSchema } from "../contracts/social-reference-monitor.js";
import { APIFY_MONTHLY_CREDIT_USD, fetchApifyMonthlyUsageUsd, runApifyActor } from "./apify.js";
import { atomicWriteJson, readJson } from "../state.js";
import { loadVentureCapabilityMap, resolveVentureCapabilityInMap } from "../ventures/capabilities.js";

export const REFERENCE_COST_CEILING_USD = 0.03;
const QUOTA = "goviral/reference-monitor/quota.json";
export const REFERENCE_SNAPSHOT = "goviral/reference-monitor/latest.json";
const ACCOUNTS = ReferenceAccountSchema.options;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Only bounded format measurements cross the boundary; captions and third-party image bytes never do. */
export function referencePosts(rows: Record<string, unknown>[]) {
  return rows.slice(0, 8).flatMap(row => {
    const account = ReferenceAccountSchema.safeParse(row.ownerUsername);
    const shortCode = typeof row.shortCode === "string" ? row.shortCode : null;
    if (!account.success || !shortCode || !/^[A-Za-z0-9_-]{1,80}$/u.test(shortCode) || typeof row.timestamp !== "string") return [];
    const date = new Date(row.timestamp);
    if (Number.isNaN(date.getTime())) return [];
    const caption = typeof row.caption === "string" ? row.caption.slice(0, 20_000) : "";
    return [{ id: shortCode, account: account.data, url: `https://www.instagram.com/p/${shortCode}/`, postedAt: date.toISOString(),
      slideCount: Math.min(20, Math.max(1, Array.isArray(row.childPosts) ? row.childPosts.length : Array.isArray(row.images) ? row.images.length : 1)),
      captionWords: Math.min(2000, caption.trim() ? caption.trim().split(/\s+/u).length : 0), questionHook: caption.split(/[\n.!]/u)[0]?.includes("?") ?? false }];
  });
}

/** Reserve and commit this result before calling runReservedReferences. A failed call keeps the full reservation. */
export async function reserveReferences(input: { root: string; now: Date; token?: string; usage?: () => Promise<number | null> }) {
  const previousRaw = await readJson<unknown>(input.root, QUOTA, null);
  const previous = SocialReferenceQuotaSchema.safeParse(previousRaw);
  if (previousRaw !== null && !previous.success) return { ready: false, reason: "Reference quota is malformed" };
  if (previous.success && input.now.getTime() - Date.parse(previous.data.attemptedAt) < INTERVAL_MS) return { ready: false, reason: "Six-hour polling window already reserved" };
  if (!input.token) return { ready: false, reason: "APIFY_TOKEN unavailable" };
  const usage = await (input.usage ?? (() => fetchApifyMonthlyUsageUsd({ token: input.token! })))();
  if (usage === null || usage + REFERENCE_COST_CEILING_USD > APIFY_MONTHLY_CREDIT_USD) return { ready: false, reason: "Fresh shared-account credit unavailable" };
  const month = input.now.toISOString().slice(0, 7);
  const spent = previous.success && previous.data.month === month ? previous.data.reservedUsd : 0;
  if (spent + REFERENCE_COST_CEILING_USD > 5) return { ready: false, reason: "Reference monitoring monthly ceiling reached" };
  await atomicWriteJson(input.root, QUOTA, SocialReferenceQuotaSchema.parse({ schemaVersion: "social-reference-quota/1", month,
    reservedUsd: Number((spent + REFERENCE_COST_CEILING_USD).toFixed(6)), attemptedAt: input.now.toISOString(), pending: true, status: "reserved" }));
  return { ready: true, reason: "Reserved within the existing shared Apify credit" };
}

export async function runReservedReferences(input: { root: string; now: Date; token: string; run?: () => Promise<Record<string, unknown>[]> }) {
  const quota = SocialReferenceQuotaSchema.parse(await readJson(input.root, QUOTA, null));
  if (!quota.pending || input.now.getTime() - Date.parse(quota.attemptedAt) > 30 * 60_000 || input.now.getTime() < Date.parse(quota.attemptedAt)) throw new Error("No current reference reservation");
  try {
    const rows = await (input.run ?? (() => runApifyActor({ actor: { actorSlug: "apify/instagram-scraper" }, token: input.token,
      maxTotalChargeUsd: REFERENCE_COST_CEILING_USD, payload: { directUrls: ACCOUNTS.map(account => `https://www.instagram.com/${account}/`), resultsType: "posts", resultsLimit: 4, addParentData: false } })))();
    const prior = SocialReferenceMonitorSchema.safeParse(await readJson(input.root, REFERENCE_SNAPSHOT, null));
    const old = prior.success ? prior.data.posts : [];
    const seen = new Set(old.map(post => `${post.account}:${post.id}`));
    const posts = referencePosts(rows);
    // A provider error/shape change cannot renew stale evidence.
    if (!posts.length) throw new Error("No usable public reference posts returned");
    const combined = new Map([...old, ...posts].map(post => [`${post.account}:${post.id}`, post]));
    const snapshot = SocialReferenceMonitorSchema.parse({ schemaVersion: "social-reference-monitor/1", sampledAt: input.now.toISOString(),
      expiresAt: new Date(input.now.getTime() + 7 * 86400_000).toISOString(), posts: [...combined.values()].sort((a, b) => b.postedAt.localeCompare(a.postedAt)).slice(0, 80),
      newPostIds: [...new Set(posts.filter(post => !seen.has(`${post.account}:${post.id}`)).map(post => `${post.account}:${post.id}`))], publishingAuthorized: false });
    await atomicWriteJson(input.root, REFERENCE_SNAPSHOT, snapshot);
    await atomicWriteJson(input.root, QUOTA, { ...quota, pending: false, status: "complete" });
    return { observed: posts.length, newPosts: snapshot.newPostIds.length };
  } catch {
    await atomicWriteJson(input.root, QUOTA, { ...quota, pending: false, status: "failed" });
    throw new Error("Reference monitor failed; prior evidence and the spending reservation were retained");
  }
}

/** Design Lab sees only an exact authorized, validated, nonexpired format packet. */
export async function referenceFormat(root: string, configurationRoot: string, now = new Date()) {
  const map = await loadVentureCapabilityMap(configurationRoot);
  const edge = resolveVentureCapabilityInMap(map, { source: "goviral", target: "design-lab", capability: "intelligence-read", schemaVersion: "social-reference-monitor/1" });
  if (edge.decision !== "allowed") return null;
  const parsed = SocialReferenceMonitorSchema.safeParse(await readJson(root, REFERENCE_SNAPSHOT, null));
  if (!parsed.success || Date.parse(parsed.data.expiresAt) <= now.getTime() || Date.parse(parsed.data.sampledAt) > now.getTime()) return null;
  const posts = parsed.data.posts;
  if (!ACCOUNTS.every(account => posts.some(post => post.account === account))) return null;
  return { carouselLed: posts.filter(post => post.slideCount > 1).length >= posts.length / 2,
    shortCaptions: posts.reduce((sum, post) => sum + post.captionWords, 0) / posts.length < 80 };
}
