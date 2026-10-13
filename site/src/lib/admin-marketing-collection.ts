import "server-only";
import { collectMarketingSources, validateCollectionQuery, type DneskaiFeedRequest } from "@boardlessai/orchestrator/marketing-source";
import { readAdminJson } from "./admin-repository";
import { queueRepositoryRoot } from "./admin-queue/state";

export async function readAdminMarketingCollection(query: DneskaiFeedRequest, now: Date, signal: AbortSignal) {
  if (process.env.NODE_ENV === "production" && !process.env.BOARDLESSAI_GITHUB_TOKEN) throw new Error("Current configuration authority unavailable");
  const root = queueRepositoryRoot();
  const [registry, network] = await Promise.all([
    readAdminJson(root, "config/sources.json"), readAdminJson(root, "config/network-allowlist.json")
  ]);
  signal.throwIfAborted();
  validateCollectionQuery(query, registry);
  return collectMarketingSources({ query, registry, network, now, signal });
}
