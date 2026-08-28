import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { estimateTextCall } from "../../../budget.js";
import type { WebDevEditionPackage, WebDevEvidenceBrief, WebDevRecord } from "../../../contracts/webdev-signal.js";
import { WebDevEditionPackageSchema, validateWebDevEditionAgainstBrief } from "../../../contracts/webdev-signal.js";
import { configRoot as defaultConfigRoot } from "../../../paths.js";
import {
  createDeterministicWebDevPackages,
  holdWebDevPackage,
  validateGeneratedWebDevPackages,
  type WebDevPackagePair,
  type WebDevSocialContentLimits
} from "./packages.js";

const VersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const WebDevEditorConfigSchema = z.strictObject({
  schemaVersion: z.literal("webdev-editor-config/1"),
  modelRole: z.literal("WEBDEV_SIGNAL_EDITOR"),
  roleVersion: VersionSchema,
  promptVersion: VersionSchema,
  localePolicyVersion: VersionSchema,
  deterministicFirst: z.literal(true),
  cacheAcceptedPackages: z.literal(true),
  maximumSynthesisCalls: z.literal(1),
  maximumRepairCalls: z.literal(1),
  maximumSelectedDayUsd: z.literal(0.03),
  persistRawProviderOutput: z.literal(false)
});

export type WebDevEditorConfig = z.infer<typeof WebDevEditorConfigSchema>;

export const WebDevEditorModelRouteSchema = z.strictObject({
  role: z.literal("WEBDEV_SIGNAL_EDITOR"),
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().trim().min(1).max(120),
  maxInputTokens: z.number().int().positive().max(4_000),
  maxOutputTokens: z.number().int().positive().max(1_500)
});

export type WebDevEditorModelRoute = z.infer<typeof WebDevEditorModelRouteSchema>;

export const WebDevEditorialReceiptSchema = z.strictObject({
  schemaVersion: z.literal("webdev-editorial-receipt/1"),
  outcome: z.enum(["generated", "reused", "held", "NO_PACKAGE"]),
  briefHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  localeStates: z.strictObject({ cs: z.enum(["draft", "held", "none"]), en: z.enum(["draft", "held", "none"]) }),
  modelRole: z.literal("WEBDEV_SIGNAL_EDITOR"),
  provider: z.enum(["openai", "anthropic"]).nullable(),
  model: z.string().trim().min(1).max(120).nullable(),
  reservations: z.number().int().min(0).max(2),
  calls: z.number().int().min(0).max(2),
  repairCalls: z.number().int().min(0).max(1),
  reservedUsd: z.number().min(0).max(0.03),
  actualUsd: z.number().min(0).max(1),
  packageHashes: z.strictObject({ cs: z.string().regex(/^[a-f0-9]{64}$/).nullable(), en: z.string().regex(/^[a-f0-9]{64}$/).nullable() }),
  reasons: z.array(z.string().trim().min(1).max(240)).max(20),
  rawProviderOutputPersisted: z.literal(false)
});

export type WebDevEditorialReceipt = z.infer<typeof WebDevEditorialReceiptSchema>;

export async function loadWebDevEditorConfig(configRoot = defaultConfigRoot): Promise<WebDevEditorConfig> {
  return WebDevEditorConfigSchema.parse(JSON.parse(await readFile(path.join(configRoot, "webdev-signal-editor.json"), "utf8")));
}

export async function loadWebDevEditorModelRoute(configRoot = defaultConfigRoot): Promise<WebDevEditorModelRoute> {
  const parsed = JSON.parse(await readFile(path.join(configRoot, "models.json"), "utf8")) as { roles?: Record<string, unknown> };
  const raw = parsed.roles?.WEBDEV_SIGNAL_EDITOR as Record<string, unknown> | undefined;
  return WebDevEditorModelRouteSchema.parse({
    role: "WEBDEV_SIGNAL_EDITOR",
    provider: raw?.provider,
    model: raw?.model,
    maxInputTokens: raw?.maxInputTokens,
    maxOutputTokens: raw?.maxOutputTokens
  });
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cacheKey(brief: WebDevEvidenceBrief, config: WebDevEditorConfig, route: WebDevEditorModelRoute | null): string {
  return hash({ briefHash: brief.contentHash, localePolicyVersion: config.localePolicyVersion, promptVersion: config.promptVersion, roleVersion: config.roleVersion, modelRole: config.modelRole, model: route?.model ?? "deterministic" });
}

function receipt(input: Omit<WebDevEditorialReceipt, "schemaVersion" | "modelRole" | "rawProviderOutputPersisted">): WebDevEditorialReceipt {
  return WebDevEditorialReceiptSchema.parse({
    schemaVersion: "webdev-editorial-receipt/1",
    modelRole: "WEBDEV_SIGNAL_EDITOR",
    rawProviderOutputPersisted: false,
    ...input
  });
}

function parsePair(raw: string): { cs: WebDevEditionPackage | null; en: WebDevEditionPackage | null; reasons: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { cs: null, en: null, reasons: ["provider-json-malformed"] };
  }
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const cs = WebDevEditionPackageSchema.safeParse(object.cs);
  const en = WebDevEditionPackageSchema.safeParse(object.en);
  return {
    cs: cs.success ? cs.data : null,
    en: en.success ? en.data : null,
    reasons: [...(!cs.success ? ["cs:schema-invalid"] : []), ...(!en.success ? ["en:schema-invalid"] : [])]
  };
}

function stampModelProvenance(pack: WebDevEditionPackage, route: WebDevEditorModelRoute, config: WebDevEditorConfig): WebDevEditionPackage {
  const { contentHash: _oldHash, ...withoutHash } = pack;
  const value = {
    ...withoutHash,
    status: "draft" as const,
    heldReason: null,
    editorialProvenance: {
      modelRole: "WEBDEV_SIGNAL_EDITOR" as const,
      promptVersion: config.promptVersion,
      localePolicyVersion: config.localePolicyVersion,
      provider: route.provider,
      model: route.model,
      deterministic: false
    }
  };
  return WebDevEditionPackageSchema.parse({ ...value, contentHash: hash(value) });
}

export interface WebDevEditorGenerateResult {
  text: string;
  usd: number;
}

export interface WebDevEditorRunResult {
  brief: WebDevEvidenceBrief | null;
  packages: { cs: WebDevEditionPackage | null; en: WebDevEditionPackage | null };
  receipt: WebDevEditorialReceipt;
  cacheEntry: WebDevPackagePair | null;
}

export async function runWebDevEditor(input: {
  brief: WebDevEvidenceBrief | null;
  briefRef: string | null;
  record: WebDevRecord | null;
  limits: WebDevSocialContentLimits;
  strategy?: "deterministic" | "model";
  authorityAvailable: boolean;
  authorityCeilingUsd: number | null;
  companyHeadroomUsd: number;
  ventureMonthRemainingUsd: number;
  now: string;
  config: WebDevEditorConfig;
  route: WebDevEditorModelRoute | null;
  cache?: Readonly<Record<string, WebDevPackagePair>>;
  generate?: (request: { attempt: 1 | 2; route: WebDevEditorModelRoute; system: string; input: string; maximumReservedUsd: number }) => Promise<WebDevEditorGenerateResult>;
}): Promise<WebDevEditorRunResult> {
  if (!input.brief || !input.record || !input.briefRef) {
    return {
      brief: input.brief,
      packages: { cs: null, en: null },
      cacheEntry: null,
      receipt: receipt({ outcome: "NO_PACKAGE", briefHash: input.brief?.contentHash ?? null, cacheKey: null, localeStates: { cs: "none", en: "none" }, provider: null, model: null, reservations: 0, calls: 0, repairCalls: 0, reservedUsd: 0, actualUsd: 0, packageHashes: { cs: null, en: null }, reasons: ["no-selected-brief"] })
    };
  }
  const strategy = input.strategy ?? "deterministic";
  const key = cacheKey(input.brief, input.config, strategy === "model" ? input.route : null);
  const cached = input.cache?.[key];
  if (cached) {
    return {
      brief: input.brief,
      packages: cached,
      cacheEntry: cached,
      receipt: receipt({ outcome: "reused", briefHash: input.brief.contentHash, cacheKey: key, localeStates: { cs: "draft", en: "draft" }, provider: strategy === "model" ? input.route?.provider ?? null : null, model: strategy === "model" ? input.route?.model ?? null : null, reservations: 0, calls: 0, repairCalls: 0, reservedUsd: 0, actualUsd: 0, packageHashes: { cs: cached.cs.contentHash, en: cached.en.contentHash }, reasons: ["accepted-package-cache-hit"] })
    };
  }
  if (strategy === "deterministic") {
    const packages = createDeterministicWebDevPackages({ brief: input.brief, briefRef: input.briefRef, record: input.record, limits: input.limits });
    const reasons = validateGeneratedWebDevPackages({ brief: input.brief, record: input.record, packages, limits: input.limits });
    const pairReasons = reasons.pair;
    const csReasons = [...reasons.cs, ...pairReasons];
    const enReasons = [...reasons.en, ...pairReasons];
    const cs = csReasons.length > 0 ? holdWebDevPackage(packages.cs, csReasons) : packages.cs;
    const en = enReasons.length > 0 ? holdWebDevPackage(packages.en, enReasons) : packages.en;
    const accepted = cs.status === "draft" && en.status === "draft";
    return {
      brief: input.brief,
      packages: { cs, en },
      cacheEntry: accepted ? { cs, en } : null,
      receipt: receipt({ outcome: accepted ? "generated" : "held", briefHash: input.brief.contentHash, cacheKey: key, localeStates: { cs: cs.status === "held" ? "held" : "draft", en: en.status === "held" ? "held" : "draft" }, provider: null, model: null, reservations: 0, calls: 0, repairCalls: 0, reservedUsd: 0, actualUsd: 0, packageHashes: { cs: cs.contentHash, en: en.contentHash }, reasons: accepted ? ["deterministic-packages-accepted"] : [...csReasons.map((value) => `cs:${value}`), ...enReasons.map((value) => `en:${value}`)] })
    };
  }
  if (!input.authorityAvailable || input.authorityCeilingUsd === null || !input.route || !input.generate) {
    return {
      brief: input.brief,
      packages: { cs: null, en: null },
      cacheEntry: null,
      receipt: receipt({ outcome: "held", briefHash: input.brief.contentHash, cacheKey: key, localeStates: { cs: "held", en: "held" }, provider: input.route?.provider ?? null, model: input.route?.model ?? null, reservations: 0, calls: 0, repairCalls: 0, reservedUsd: 0, actualUsd: 0, packageHashes: { cs: null, en: null }, reasons: [!input.authorityAvailable || input.authorityCeilingUsd === null ? "editorial-authority-missing" : !input.route ? "editor-model-route-missing" : "editor-provider-unavailable"] })
    };
  }
  const system = "Produce one strict JSON object with independent cs and en webdev-edition-package/1 values. Use only the accepted brief. Do not add facts, links, urgency, benchmarks, engagement bait, credentials, rendering or publishing fields.";
  const prompt = JSON.stringify({ brief: input.brief, limits: input.limits, promptVersion: input.config.promptVersion, localePolicyVersion: input.config.localePolicyVersion });
  const estimate = estimateTextCall({ provider: input.route.provider, model: input.route.model, promptChars: system.length + prompt.length, maxOutputTokens: input.route.maxOutputTokens, at: new Date(input.now) });
  const ceiling = Math.min(input.config.maximumSelectedDayUsd, input.authorityCeilingUsd, input.companyHeadroomUsd, input.ventureMonthRemainingUsd);
  if (estimate.estimatedUsd > ceiling) {
    return {
      brief: input.brief,
      packages: { cs: null, en: null },
      cacheEntry: null,
      receipt: receipt({ outcome: "held", briefHash: input.brief.contentHash, cacheKey: key, localeStates: { cs: "held", en: "held" }, provider: input.route.provider, model: input.route.model, reservations: 0, calls: 0, repairCalls: 0, reservedUsd: 0, actualUsd: 0, packageHashes: { cs: null, en: null }, reasons: ["editorial-budget-reservation-refused"] })
    };
  }

  let calls = 0;
  let reservations = 0;
  let repairCalls = 0;
  let reservedUsd = 0;
  let actualUsd = 0;
  let parsed = { cs: null, en: null, reasons: ["provider-not-called"] } as ReturnType<typeof parsePair>;
  for (const attempt of [1, 2] as const) {
    if (attempt === 2) {
      if (parsed.reasons.length === 0 || repairCalls >= input.config.maximumRepairCalls || actualUsd + estimate.estimatedUsd > ceiling) break;
      repairCalls += 1;
    }
    reservations += 1;
    reservedUsd += estimate.estimatedUsd;
    const generated = await input.generate({ attempt, route: input.route, system, input: attempt === 1 ? prompt : JSON.stringify({ acceptedBrief: input.brief, repairOnly: parsed.reasons }), maximumReservedUsd: estimate.estimatedUsd });
    calls += 1;
    actualUsd += Math.max(0, generated.usd);
    parsed = parsePair(generated.text);
    if (parsed.reasons.length === 0) break;
  }
  const reasons: string[] = [...parsed.reasons];
  let cs = parsed.cs ? stampModelProvenance(parsed.cs, input.route, input.config) : null;
  let en = parsed.en ? stampModelProvenance(parsed.en, input.route, input.config) : null;
  if (cs) reasons.push(...validateWebDevEditionAgainstBrief({ brief: input.brief, edition: cs }).map((value) => `cs:${value}`));
  if (en) reasons.push(...validateWebDevEditionAgainstBrief({ brief: input.brief, edition: en }).map((value) => `en:${value}`));
  if (cs && en) {
    const validated = validateGeneratedWebDevPackages({ brief: input.brief, record: input.record, packages: { cs, en }, limits: input.limits });
    reasons.push(...validated.cs.map((value) => `cs:${value}`), ...validated.en.map((value) => `en:${value}`), ...validated.pair.map((value) => `pair:${value}`));
    if (validated.cs.length > 0 || validated.pair.length > 0) cs = holdWebDevPackage(cs, [...validated.cs, ...validated.pair]);
    if (validated.en.length > 0 || validated.pair.length > 0) en = holdWebDevPackage(en, [...validated.en, ...validated.pair]);
  }
  if (actualUsd > ceiling) reasons.push("actual-cost-exceeded-authorized-ceiling");
  const accepted = cs?.status === "draft" && en?.status === "draft" && reasons.length === 0;
  return {
    brief: input.brief,
    packages: { cs, en },
    cacheEntry: accepted ? { cs: cs!, en: en! } : null,
    receipt: receipt({
      outcome: accepted ? "generated" : "held",
      briefHash: input.brief.contentHash,
      cacheKey: key,
      localeStates: { cs: cs?.status === "draft" ? "draft" : "held", en: en?.status === "draft" ? "draft" : "held" },
      provider: input.route.provider,
      model: input.route.model,
      reservations,
      calls,
      repairCalls,
      reservedUsd: Math.min(0.03, Number(reservedUsd.toFixed(8))),
      actualUsd: Number(actualUsd.toFixed(8)),
      packageHashes: { cs: cs?.contentHash ?? null, en: en?.contentHash ?? null },
      reasons: accepted ? ["model-packages-accepted"] : [...new Set(reasons)].slice(0, 20)
    })
  };
}
