import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DateSchema } from "../../../contracts/common.js";
import { WebDevSourceSchema, type WebDevSource } from "../../../contracts/webdev-signal.js";
import { configRoot as defaultConfigRoot } from "../../../paths.js";

export const WebDevSourceRegistrySchema = z.strictObject({
  schemaVersion: z.literal("webdev-source-registry/1"),
  verifiedAt: DateSchema,
  sources: z.array(WebDevSourceSchema).min(1).max(50)
}).superRefine((registry, context) => {
  const ids = registry.sources.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["sources"], message: "source ids must be unique" });
  }
  for (const [index, source] of registry.sources.entries()) {
    if (source.verifiedAt !== registry.verifiedAt) {
      context.addIssue({ code: "custom", path: ["sources", index, "verifiedAt"], message: "source verification must match registry verification" });
    }
    if (source.sourceKind.startsWith("github-") && source.canonicalHost !== "api.github.com") {
      context.addIssue({ code: "custom", path: ["sources", index, "canonicalHost"], message: "GitHub adapters require the canonical API host" });
    }
    if (source.sourceKind === "github-releases" && source.repositoryRef === null) {
      context.addIssue({ code: "custom", path: ["sources", index, "repositoryRef"], message: "release sources require an exact repository allowlist" });
    }
  }
});

export type WebDevSourceRegistry = z.infer<typeof WebDevSourceRegistrySchema>;

export async function loadWebDevSourceRegistry(configRoot = defaultConfigRoot): Promise<WebDevSourceRegistry> {
  return WebDevSourceRegistrySchema.parse(JSON.parse(await readFile(path.join(configRoot, "webdev-signal-sources.json"), "utf8")));
}

export function collectableWebDevSources(registry: WebDevSourceRegistry, includeOptional = false): WebDevSource[] {
  return registry.sources.filter(({ state }) => state === "enabled" || (includeOptional && state === "optional"));
}

export function webDevSourceHosts(registry: WebDevSourceRegistry, includeOptional = true): string[] {
  return [...new Set(collectableWebDevSources(registry, includeOptional).map(({ canonicalHost }) => canonicalHost))].sort();
}
