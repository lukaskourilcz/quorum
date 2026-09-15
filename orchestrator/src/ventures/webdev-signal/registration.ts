import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { WebDevRunSchema, type WebDevRun } from "../../contracts/webdev-signal.js";
import { configRoot as defaultConfigRoot } from "../../paths.js";

const FeatureStateSchema = z.enum(["enabled", "held", "disabled"]);

export const WebDevSignalRegistrationSchema = z.strictObject({
  schemaVersion: z.literal("webdev-signal-registration/1"),
  ventureId: z.literal("webdev-signal"),
  ledgerNamespace: z.literal("webdev-signal"),
  foundingDecisionRef: z.literal("state/decisions/2026-08-28-webdev-signal-founding.md"),
  foundingCountersigned: z.boolean(),
  editions: z.array(z.strictObject({
    locale: z.enum(["cs", "en"]),
    id: z.enum(["webdev-signal-cs", "webdev-signal-en"]),
    profileRef: z.enum(["social-profile-webdev-signal-cs", "social-profile-webdev-signal-en"]),
    state: z.literal("held")
  })).length(2),
  features: z.strictObject({
    ventureRegistration: FeatureStateSchema,
    directSources: FeatureStateSchema,
    secondaryDiscovery: FeatureStateSchema,
    goviralOverlay: FeatureStateSchema,
    bilingualSynthesis: FeatureStateSchema,
    designLabRendering: FeatureStateSchema,
    czechProfileDelivery: FeatureStateSchema,
    englishProfileDelivery: FeatureStateSchema,
    instagramPublishing: FeatureStateSchema,
    threadsPublishing: FeatureStateSchema,
    metricsCollection: FeatureStateSchema
  }),
  budget: z.strictObject({
    currency: z.literal("USD"),
    directCollectionUsd: z.literal(0),
    fixtureRunUsd: z.literal(0),
    perSelectedDayCeilingUsd: z.number().positive().max(0.03),
    monthlyCeilingUsd: z.number().positive().max(0.75),
    maximumSynthesisCalls: z.literal(1),
    maximumRepairCalls: z.literal(1),
    borrowingAllowed: z.literal(false),
    automaticIncreaseAllowed: z.literal(false),
    purchaseAllowed: z.literal(false)
  }),
  schedule: z.strictObject({
    phase: z.literal("webdev-signal-daily"),
    timezone: z.literal("Europe/Prague"),
    pragueHour: z.literal(5),
    // The Prague 05:00 dispatcher, which is DNESKAi's day since `operations-2026-08c` folded the
    // edition and product rooms into one slot. WebDev Signal still rides it and still adds no cron
    // of its own; only the name of the dispatch it rides changed.
    dispatcherAnchorPhase: z.literal("cu-day"),
    position: z.literal("before-anchor"),
    newCron: z.literal(false),
    publicMeeting: z.literal(false),
    statePath: z.literal("state/ventures/webdev-signal/runs")
  }),
  operationalSeams: z.strictObject({
    healthRef: z.string().trim().min(1).max(160),
    capacityRef: z.literal("operations-capacity-plan/1"),
    recoveryRef: z.string().trim().min(1).max(160),
    progressRef: z.string().trim().min(1).max(160),
    adminRef: z.literal("admin-service:owner-only"),
    ownerAttentionRef: z.literal("owner-attention/1"),
    pauseRef: z.literal("state/operations/pauses/webdev-signal.json")
  })
}).superRefine((registration, context) => {
  const locales = registration.editions.map(({ locale }) => locale).sort().join(",");
  if (locales !== "cs,en") {
    context.addIssue({ code: "custom", path: ["editions"], message: "one Czech and one English edition are required" });
  }
  if (registration.editions.some((edition) => !edition.id.endsWith(`-${edition.locale}`) || !edition.profileRef.endsWith(`-${edition.locale}`))) {
    context.addIssue({ code: "custom", path: ["editions"], message: "edition and profile identity must match locale" });
  }
});

export type WebDevSignalRegistration = z.infer<typeof WebDevSignalRegistrationSchema>;
export type WebDevSignalFeature = keyof WebDevSignalRegistration["features"];

export async function loadWebDevSignalRegistration(configRoot = defaultConfigRoot): Promise<WebDevSignalRegistration> {
  return WebDevSignalRegistrationSchema.parse(JSON.parse(await readFile(path.join(configRoot, "webdev-signal.json"), "utf8")));
}

export function resolveWebDevSignalFeature(input: {
  registration: WebDevSignalRegistration;
  feature: WebDevSignalFeature;
  authorityAvailable?: boolean;
}): { decision: "allowed" | "held" | "denied"; reason: string; authorityGranted: false } {
  const configured = input.registration.features[input.feature];
  if (configured === "disabled") return { decision: "denied", reason: `${input.feature}-disabled`, authorityGranted: false };
  if (configured === "held") return { decision: "held", reason: `${input.feature}-held`, authorityGranted: false };
  if (input.feature !== "ventureRegistration" && (!input.registration.foundingCountersigned || input.authorityAvailable !== true)) {
    return { decision: "held", reason: "founding-or-independent-authority-missing", authorityGranted: false };
  }
  return { decision: "allowed", reason: `${input.feature}-configured`, authorityGranted: false };
}

export function resolveWebDevSignalSynthesisBudget(input: {
  registration: WebDevSignalRegistration;
  selected: boolean;
  authorityCeilingUsd: number | null;
  companyHeadroomUsd: number;
  ventureMonthSpentUsd: number;
}): { decision: "not-needed" | "held" | "reserved"; ceilingUsd: number; reason: string; borrowingAllowed: false } {
  if (!input.selected) return { decision: "not-needed", ceilingUsd: 0, reason: "no-selected-story", borrowingAllowed: false };
  if (!input.registration.foundingCountersigned || input.registration.features.bilingualSynthesis !== "enabled" || input.authorityCeilingUsd === null) {
    return { decision: "held", ceilingUsd: 0, reason: "synthesis-authority-missing", borrowingAllowed: false };
  }
  const monthRemaining = Math.max(0, input.registration.budget.monthlyCeilingUsd - input.ventureMonthSpentUsd);
  const ceilingUsd = Math.max(0, Math.min(
    input.registration.budget.perSelectedDayCeilingUsd,
    input.authorityCeilingUsd,
    input.companyHeadroomUsd,
    monthRemaining
  ));
  if (ceilingUsd <= 0) return { decision: "held", ceilingUsd: 0, reason: "nested-budget-exhausted", borrowingAllowed: false };
  return { decision: "reserved", ceilingUsd: Number(ceilingUsd.toFixed(8)), reason: "lower-of-authorities", borrowingAllowed: false };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** One run per Prague day and mode; a second firing on the same key finds the first receipt. */
export function webDevRunIdempotencyKey(pragueDate: string, mode: "fixture" | "live"): string {
  return sha256(`${pragueDate}:webdev-signal-daily:${mode}`);
}

/** A receipt for a day that did no work: nothing fetched, judged, written or spent. */
export function webDevZeroRun(input: {
  pragueDate: string;
  mode: "fixture" | "live";
  errors: WebDevRun["errors"];
  nextSafeAction: string;
}): WebDevRun {
  return WebDevRunSchema.parse({
    schemaVersion: "webdev-run/1",
    phase: "webdev-signal-daily",
    pragueDate: input.pragueDate,
    mode: input.mode,
    idempotencyKey: webDevRunIdempotencyKey(input.pragueDate, input.mode),
    sourceOutcomes: [],
    counts: { candidates: 0, new: 0, updated: 0, duplicate: 0, malformed: 0 },
    selectionOutcome: "held",
    selectionRef: null,
    briefRef: null,
    packageRefs: [],
    renderRefs: [],
    queueRefs: [],
    model: { reservations: 0, calls: 0, provider: null, model: null, reservedUsd: 0, actualUsd: 0 },
    cache: { unchangedSources: 0, reusedArtifacts: 0, providerCallsAvoided: 0 },
    errors: input.errors,
    nextSafeAction: input.nextSafeAction
  });
}

export type WebDevSignalDispatch =
  /** Direct collection is not authorised; `run` is the honest zero-cost receipt for the day. */
  | { decision: "held"; reason: string; run: WebDevRun }
  /** The registration authorises the daily chain, which writes its own receipt under this key. */
  | { decision: "run"; idempotencyKey: string };

/**
 * Whether this dispatcher firing is WebDev Signal's, and whether the day may do live work.
 *
 * `null` means the phase is not the anchor the registration names, so the caller is not this
 * venture's dispatcher at all. Otherwise the answer is the `directSources` gate: the founding
 * countersignature and an audited source registry with at least one enabled source, supplied by
 * the caller as `sourceAuthorityAvailable` because the registration cannot see the registry.
 */
export function dispatchWebDevSignalRegistration(input: {
  registration: WebDevSignalRegistration;
  dispatcherPhase: string;
  pragueDate: string;
  mode: "fixture" | "live";
  sourceAuthorityAvailable?: boolean;
}): WebDevSignalDispatch | null {
  if (input.dispatcherPhase !== input.registration.schedule.dispatcherAnchorPhase) return null;
  const sources = resolveWebDevSignalFeature({
    registration: input.registration,
    feature: "directSources",
    authorityAvailable: input.sourceAuthorityAvailable === true
  });
  const idempotencyKey = webDevRunIdempotencyKey(input.pragueDate, input.mode);
  if (sources.decision === "allowed") return { decision: "run", idempotencyKey };
  return {
    decision: "held",
    reason: sources.reason,
    run: webDevZeroRun({
      pragueDate: input.pragueDate,
      mode: input.mode,
      errors: [{ code: "held", sourceId: null, message: sources.reason }],
      nextSafeAction: sources.reason === "founding-or-independent-authority-missing"
        ? "Keep live work held until founding and independent source authority exist."
        : "Direct sources are switched off in config/webdev-signal.json; enable them once the source audit allows it."
    })
  };
}
