import "server-only";
import { readAdminJson, listAdminJson } from "./admin-repository";
import { queueRepositoryRoot } from "./admin-queue/state";
import { NEWS_FRESHNESS_HOURS, readNoEditionDates, readSources, type SourceReader, invalidation,
  parseSourcePacket, sha256, type SourceQuery, resolveVentureCapabilityInMap, VentureCapabilityMapSchema } from "@boardlessai/orchestrator/marketing-source";

export { SourceQuerySchema } from "@boardlessai/orchestrator/marketing-source";

export async function readAdminMarketingSources(query: SourceQuery, now = new Date()) {
  if (process.env.NODE_ENV === "production" && !process.env.BOARDLESSAI_GITHUB_TOKEN) throw new Error("Current source authority requires configured repository access");
  const root = queueRepositoryRoot();
  const read = async (relative: string): Promise<unknown> => {
    try { return await readAdminJson(root, `state/${relative}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  };
  if (await read("PAUSED") !== null) throw new Error("Repository pause holds source export");
  const map = VentureCapabilityMapSchema.parse(await readAdminJson(root, "config/venture-capabilities.json"));
  const capability = resolveVentureCapabilityInMap(map, { source: "caught-up", target: "own-dashboard", capability: "approved-publish-package", schemaVersion: "marketing-source/1" });
  if (capability.decision !== "allowed") throw new Error("Source export capability is held");
  const siteUrl = process.env.CAUGHT_UP_SITE_URL;
  if (!siteUrl) throw new Error("DNESKAi canonical site is not configured");
  const reader: SourceReader = { read, list: async relative => {
    try { const files = await listAdminJson(root, `state/${relative}`); if (files.length > 100) throw new Error("Source inventory needs archival"); return files; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  } };
  const snapshot = await readSources({ reader, siteUrl, now, freshnessHours: NEWS_FRESHNESS_HOURS, sourceIds: query.sourceIds });
  const noEditions = query.sourceIds ? { dates: [], dropped: 0 } : await readNoEditionDates(reader);
  snapshot.dropped += noEditions.dropped;
  const excluded = query.sourceIds ? 0 : Math.max(0, snapshot.sources.length - 20);
  if (!query.sourceIds) snapshot.sources = snapshot.sources.slice(-20);
  for (const source of snapshot.sources) {
    if (source.packet) continue;
    const previous = await read(`marketing-source/current/${sha256(source.sourceId)}.json`);
    if (previous !== null) source.packet = invalidation(parseSourcePacket(previous), source.reason, now);
  }
  return { schemaVersion: "marketing-source-query/1" as const, brand: "dneskai" as const,
    observedAt: now.toISOString(), socialApproval: "required-separately" as const, excluded, noEditionDates: noEditions.dates.slice(-20), ...snapshot };
}
