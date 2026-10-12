import { z } from "zod";
import { access } from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson, readJson, withFileLock } from "../state.js";
import { resolveVentureCapability } from "../ventures/capabilities.js";
import { parseSourcePacket, sha256, signature, SourcePacketSchema, type SourcePacket } from "./contract.js";
import { localSourceReader, readNoEditionDates, readSources } from "./producer.js";

const EntrySchema = z.strictObject({
  schemaVersion: z.literal("marketing-source-outbox/1"), packet: SourcePacketSchema,
  status: z.enum(["pending", "delivered", "reconciliation", "superseded"]),
  attempts: z.number().int().nonnegative().max(3), nextAttemptAt: z.iso.datetime({ offset: true }).nullable(),
  responseCode: z.number().int().nullable(), deliveredAt: z.iso.datetime({ offset: true }).nullable()
});
export type OutboxEntry = z.infer<typeof EntrySchema>;
export const packetKey = (packet: SourcePacket) => sha256([packet.sourceId, packet.sourceRevision, packet.contentHash]);
const currentPath = (sourceId: string) => `marketing-source/current/${sha256(sourceId)}.json`;
const outboxPath = (packet: SourcePacket) => `marketing-source/outbox/${packetKey(packet)}.json`;

export function invalidation(previous: SourcePacket, reason: string, now: Date): SourcePacket {
  if (!previous.eligible && previous.eligibilityReason === reason) return { ...previous, observedAt: now.toISOString() };
  return parseSourcePacket({ ...previous, sourceRevision: sha256({ previousRevision: previous.sourceRevision, reason }),
    eligible: false, eligibilityReason: reason, observedAt: now.toISOString() });
}
async function assertCapability(root: string, configurationRoot?: string): Promise<void> {
  let paused = false;
  try { await access(path.join(root, "PAUSED")); paused = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (paused) throw new Error("Repository pause holds source export");
  const resolution = await resolveVentureCapability({ source: "caught-up", target: "own-dashboard",
    capability: "approved-publish-package", schemaVersion: "marketing-source/1" }, { configRoot: configurationRoot });
  if (resolution.decision !== "allowed") throw new Error("DNESKAi source export capability is held");
}

export async function reconcileSources(input: { root: string; siteUrl: string; now: Date; freshnessHours: number;
  configurationRoot?: string; write?: boolean }): Promise<{ packets: SourcePacket[]; held: number; dropped: number; noEditionDates: string[] }> {
  await assertCapability(input.root, input.configurationRoot);
  const operation = async () => {
    const reader = localSourceReader(input.root);
    const snapshot = await readSources({ ...input, reader });
    const current = new Map<string, SourcePacket>();
    for (const file of await reader.list("marketing-source/current")) {
      try { const packet = parseSourcePacket(await reader.read(`marketing-source/current/${file}`)); current.set(packet.sourceId, packet); }
      catch { snapshot.dropped++; }
    }
    const packets: SourcePacket[] = [];
    const present = new Set(snapshot.sources.map(source => source.sourceId));
    for (const source of snapshot.sources) {
      const previous = current.get(source.sourceId);
      if (source.packet) packets.push(source.packet);
      else if (previous?.eligible) packets.push(invalidation(previous, source.reason, input.now));
    }
    for (const [sourceId, previous] of current) {
      if (!present.has(sourceId) && previous.eligible) packets.push(invalidation(previous, "article-review-removed", input.now));
    }
    const noEditions = await readNoEditionDates(reader);
    const noEditionDates = noEditions.dates;
    snapshot.dropped += noEditions.dropped;
    if (input.write) await atomicWriteJson(input.root, `marketing-source/observations/${input.now.toISOString().slice(0, 10)}.json`, {
      schemaVersion: "marketing-source-observation/1", observedAt: input.now.toISOString(), held: snapshot.sources.filter(source => !source.packet).length,
      dropped: snapshot.dropped, noEditionDates: [...new Set(noEditionDates)].sort(), socialApproval: "required-separately" });
    if (input.write) for (const packet of packets) {
      const previous = current.get(packet.sourceId);
      if (previous && packetKey(previous) !== packetKey(packet)) {
        const old = EntrySchema.safeParse(await readJson(input.root, outboxPath(previous), null));
        if (old.success && old.data.status !== "delivered") await atomicWriteJson(input.root, outboxPath(previous), { ...old.data, status: "superseded" });
      }
      const existing = await readJson(input.root, outboxPath(packet), null);
      if (existing === null) await atomicWriteJson(input.root, outboxPath(packet), EntrySchema.parse({
        schemaVersion: "marketing-source-outbox/1", packet, status: "pending", attempts: 0,
        nextAttemptAt: null, responseCode: null, deliveredAt: null }));
      else EntrySchema.parse(existing);
      await atomicWriteJson(input.root, currentPath(packet.sourceId), packet);
    }
    return { packets, held: snapshot.sources.filter(source => !source.packet).length, dropped: snapshot.dropped, noEditionDates: [...new Set(noEditionDates)].sort() };
  };
  return input.write ? withFileLock(input.root, "marketing-source/.lock", operation) : operation();
}

export async function deliverSources(input: { root: string; siteUrl: string; now: Date; freshnessHours: number;
  endpoint: string; secret: string; enabled: boolean; configurationRoot?: string; fetcher?: typeof fetch }): Promise<{ delivered: number; held: number }> {
  if (!input.enabled || input.secret.length < 32) throw new Error("DNESKAi source delivery is not configured or enabled");
  const endpoint = new URL(input.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.pathname !== "/api/marketing/automation" || endpoint.search || endpoint.hash) throw new Error("Invalid OwnDashboard source endpoint");
  await assertCapability(input.root, input.configurationRoot);
  return withFileLock(input.root, "marketing-source/.lock", async () => {
    // A queued revision is sent only while the authoritative article decision still matches.
    const snapshot = await readSources({ ...input, reader: localSourceReader(input.root) });
    const approved = new Map(snapshot.sources.map(source => [source.sourceId, source.packet]));
    let delivered = 0;
    let held = snapshot.dropped;
    for (const file of await localSourceReader(input.root).list("marketing-source/outbox")) {
      const parsed = EntrySchema.safeParse(await readJson(input.root, `marketing-source/outbox/${file}`, null).catch(() => null));
      if (!parsed.success) { held++; continue; }
      const entry = parsed.data;
      try { parseSourcePacket(entry.packet); } catch { held++; continue; }
      if (entry.status !== "pending" || (entry.nextAttemptAt && Date.parse(entry.nextAttemptAt) > input.now.getTime())) continue;
      const current = await readJson(input.root, currentPath(entry.packet.sourceId), null).catch(() => null);
      let latest: SourcePacket | null = null;
      try { latest = current === null ? null : parseSourcePacket(current); }
      catch { held++; continue; }
      if (!latest || packetKey(latest) !== packetKey(entry.packet)) { held++; continue; }
      const actual = approved.get(entry.packet.sourceId);
      if (entry.packet.eligible && (!actual || packetKey(actual) !== packetKey(entry.packet))) { held++; continue; }
      if (!entry.packet.eligible && actual) { held++; continue; }
      const packet = { ...entry.packet, observedAt: input.now.toISOString() };
      const body = JSON.stringify({ action: "source", packet });
      const timestamp = String(Math.floor(input.now.getTime() / 1000));
      let responseCode: number | null = null;
      try {
        const response = await (input.fetcher ?? fetch)(endpoint.href, { method: "POST", redirect: "error", signal: AbortSignal.timeout(12000),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.secret}`,
            "X-Marketing-Timestamp": timestamp, "X-Marketing-Signature": signature(input.secret, timestamp, body) }, body });
        responseCode = response.status;
      } catch { /* Network outcomes are retried with the identical source identity, never response text or credentials. */ }
      const accepted = responseCode !== null && responseCode >= 200 && responseCode < 300;
      const attempts = entry.attempts + 1;
      const retryable = responseCode === null || responseCode === 429 || responseCode >= 500;
      const next = EntrySchema.parse({ ...entry, packet, attempts, responseCode,
        status: accepted ? "delivered" : retryable && attempts < 3 ? "pending" : "reconciliation",
        nextAttemptAt: accepted || !retryable || attempts === 3 ? null : new Date(input.now.getTime() + [60000, 300000][attempts - 1]!).toISOString(),
        deliveredAt: accepted ? input.now.toISOString() : null });
      await atomicWriteJson(input.root, `marketing-source/outbox/${file}`, next);
      if (accepted) delivered++; else held++;
    }
    return { delivered, held };
  });
}
