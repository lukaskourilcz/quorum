import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { WebDevScoreComponentNameSchema } from "../../../contracts/webdev-signal.js";
import { configRoot as defaultConfigRoot } from "../../../paths.js";

const VersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const WebDevSelectionConfigSchema = z.strictObject({
  schemaVersion: z.literal("webdev-selection-config/1"),
  canonicalizationVersion: VersionSchema,
  extractionVersion: VersionSchema,
  scoringVersion: VersionSchema,
  trackingParameters: z.array(z.string().regex(/^[a-z0-9_]+$/)).max(50),
  trackingPrefixes: z.array(z.string().regex(/^[a-z0-9_]+$/)).max(20),
  semanticQueryParameters: z.array(z.string().regex(/^[a-z0-9_]+$/)).max(50),
  redirectWrappers: z.array(z.strictObject({
    host: z.hostname(),
    path: z.string().startsWith("/").max(200),
    targetParameter: z.string().regex(/^[a-z0-9_]+$/)
  })).max(10),
  projectAliases: z.record(z.string().regex(/^[a-z0-9]+$/), z.string().trim().min(1).max(120)),
  thresholds: z.strictObject({
    minimumBaseScore: z.number().min(0).max(100),
    minimumConfidence: z.number().min(0).max(1),
    minimumWinnerMargin: z.number().min(0).max(100),
    freshnessDays: z.number().int().min(1).max(30),
    securityFreshnessDays: z.number().int().min(1).max(90),
    projectCooldownDays: z.number().int().min(1).max(90),
    topicCooldownDays: z.number().int().min(1).max(90),
    maximumGoViralContribution: z.number().min(0).max(5)
  }),
  weights: z.record(WebDevScoreComponentNameSchema, z.number().min(0).max(1))
}).superRefine((config, context) => {
  const names = WebDevScoreComponentNameSchema.options;
  if (names.some((name) => config.weights[name] === undefined) || Object.keys(config.weights).length !== names.length) {
    context.addIssue({ code: "custom", path: ["weights"], message: "every score component must have exactly one centralized weight" });
  }
  if (config.thresholds.maximumGoViralContribution > config.weights["authority-evidence"] * 100
    || config.thresholds.maximumGoViralContribution > config.weights["developer-impact"] * 100) {
    context.addIssue({ code: "custom", path: ["thresholds", "maximumGoViralContribution"], message: "GoVIRAL must remain below authority and impact components" });
  }
});

export type WebDevSelectionConfig = z.infer<typeof WebDevSelectionConfigSchema>;

export async function loadWebDevSelectionConfig(configRoot = defaultConfigRoot): Promise<WebDevSelectionConfig> {
  return WebDevSelectionConfigSchema.parse(JSON.parse(await readFile(path.join(configRoot, "webdev-signal-selection.json"), "utf8")));
}
