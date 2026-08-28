export const SOCIAL_PROFILE_SECTIONS = [
  { id: "venture-profiles", label: "Venture Profiles" },
  { id: "amplification-profiles", label: "Amplification Profiles" },
  { id: "campaigns", label: "Campaigns" },
  { id: "today", label: "Today" },
  { id: "network", label: "Network" },
  { id: "providers", label: "Providers & automation health" },
  { id: "content-runway", label: "Content runway" },
  { id: "results", label: "Results" },
  { id: "activity-setup", label: "Activity & setup" }
] as const;

export type SocialProfileSectionId = (typeof SOCIAL_PROFILE_SECTIONS)[number]["id"];
export type SocialPlatform = "instagram" | "threads";
export type SocialProfileLifecycle = "idea" | "proposed" | "setup-needed" | "active" | "paused" | "retired" | "rejected" | "simulation";

export interface SocialCapabilityReference {
  mapVersion: string;
  source: string;
  target: "social-distribution";
  capability: "approved-publish-package";
  dataSchemaVersion: "approved-publish-package/1";
  decisionReference: string;
}

export interface SocialProfileRecord {
  id: string;
  displayLabel: string;
  kind: "owned-brand" | "owner-personal" | "simulation";
  role: "venture-primary" | "company-umbrella" | "owned-amplifier" | "owner-personal" | "simulation";
  ownerRef: string;
  ventureRef: string | null;
  brandRef: string | null;
  purpose: string;
  audience: string;
  languages: string[];
  markets: string[];
  supportedTopics: string[];
  supportedVentures: string[];
  capabilityRefs: SocialCapabilityReference[];
  amplifierArchetype: string | null;
  amplifierEligibility: { verdict: "accept" | "hold" | "reject"; evaluatedAt: string; purposeGateRef: string; canonicalPolicyRef: string | null } | null;
  originalContentPromise: string | null;
  recurringFormatRefs: string[];
  avatar: { kind: "asset" | "descriptor" | "identicon" | "none"; descriptor: string | null; reference: string | null };
  lifecycle: SocialProfileLifecycle;
  liveEligible: boolean;
  createdAt: string;
  updatedAt: string;
  provenance: { source: "owner" | "migration" | "fixture"; recordedBy: "owner" | "system"; evidenceRefs: string[]; fixtureKey: string | null };
  notes: string;
}

export interface SocialConnectionRecord {
  id: string;
  profileId: string;
  platform: SocialPlatform;
  publicHandle: string | null;
  connector: { id: string; version: string; providerId: string; apiVersion: string; loginMode: string };
  credentialRef: string | null;
  nativeAccountIdRef: string | null;
  approvedScopes: string[];
  supportedCapabilities: Array<"publish-original" | "own-insights">;
  mode: "draft" | "held" | "autopublish";
  health: { status: "healthy" | "unavailable" | "expired" | "reauthorisation-required" | "unverified" | "paused"; unavailableReason: string | null };
  tokenExpiresAt: string | null;
  appReviewExpiresAt: string | null;
  enabledByHumanAt: string | null;
  cadence: { maxOrganicPostsPerDay: number; minHoursBetweenPosts: number; timezone: "Europe/Prague" };
  lastVerified: { at: string; evidenceRefs: string[] } | null;
}

export interface SocialProfileEventRecord {
  eventId: string;
  at: string;
  profileId: string;
  connectionId: string | null;
  action: "proposed" | "setup-requested" | "connected" | "activated" | "paused" | "reauthorisation-requested" | "disconnected" | "retired" | "rejected" | "corrected";
  actor: "owner" | "system";
  provenanceRef: string;
  reason: string;
  supersededEventRef: string | null;
}

export interface AmplifierProposalRecord {
  id: string;
  profileId: string;
  workingName: string;
  publicNameCandidates: string[];
  publicHandleCandidates: string[];
  ownerRef: string;
  archetype: string;
  purpose: string;
  audience: string;
  independentReasonToFollow: string;
  languages: string[];
  markets: string[];
  supportedTopics: string[];
  supportedVentures: string[];
  capabilityRefs: SocialCapabilityReference[];
  originalContentPromise: string;
  repeatableFormats: Array<{ id: string; name: string; description: string; sourcePlan: string }>;
  expectedCadence: { postsPerWeek: number; sourcePlan: string };
  launchRunway: { requiredOriginalPosts: number; completedOriginalPosts: number; firstOriginalConcepts: unknown[]; evidenceRefs: string[] };
  maximumSupportRatio: number;
  overlapAnalysis: { reviewedProfileIds: string[]; summary: string; collisionWarnings: string[] };
  platformDirection: { platforms: SocialPlatform[]; markets: string[]; verdict: "pending" | "approved" | "rejected"; ownerEvidenceRef: string | null };
  factualBio: string;
  logoAvatarRef: string;
  canonicalDestination: string;
  lifecycle: "idea" | "proposed" | "setup-needed" | "connected" | "active" | "paused" | "retired" | "rejected";
  ownerDecision: { verdict: "accept" | "hold" | "reject"; at: string; evidenceRef: string; reason: string } | null;
  validationPlan: { reviewAfterDays: number; evidenceRequirements: string[]; stopConditions: string[] };
  history: Array<{ revision: number; at: string; action: string; actor: "owner" | "system"; evidenceRef: string; reason: string; supersedesRevision: number | null }>;
  createdAt: string;
  updatedAt: string;
}

export interface AmplificationPolicyRecord {
  version: string;
  ownerDecisionRef: string;
  values: {
    minimumOriginalContentRatio: number;
    maximumVentureSupportRatio: number;
    rollingWindowPosts: number;
    originalContentRunwayPosts: number;
    sameSourceVentureCooldownDays: number;
    maximumActiveSupportCampaigns: number;
    duplicateCaptionThreshold: number;
    duplicateAssetRejected: boolean;
    audienceSpecificAngleRequired: boolean;
    staggerRequired: boolean;
    minimumStaggerHours: number;
  };
}

type RawRecord = Record<string, unknown>;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const profileId = /^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const connectionId = /^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const eventId = /^social-profile-event-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const envRef = /^[A-Z][A-Z0-9_]{2,119}$/u;

export function rawRecord(value: unknown): RawRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as RawRecord : null;
}

function text(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

function nullableText(value: unknown, max = 500): string | null | undefined {
  return value === null ? null : text(value, max) ?? undefined;
}

function dateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === "string" && values.includes(value as T) ? value as T : null;
}

function textArray(value: unknown, max: number, pattern?: RegExp): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const parsed = value.map((entry) => text(entry, 300));
  if (parsed.some((entry) => entry === null)) return null;
  const result = parsed as string[];
  return new Set(result).size === result.length && (!pattern || result.every((entry) => pattern.test(entry))) ? result : null;
}

function capability(value: unknown): SocialCapabilityReference | null {
  const item = rawRecord(value);
  const mapVersion = text(item?.mapVersion, 40);
  const source = text(item?.source, 100);
  const decisionReference = text(item?.decisionReference, 300);
  return item?.target === "social-distribution" && item.capability === "approved-publish-package" && item.dataSchemaVersion === "approved-publish-package/1"
    && mapVersion && source && slug.test(source) && decisionReference
    ? { mapVersion, source, target: "social-distribution", capability: "approved-publish-package", dataSchemaVersion: "approved-publish-package/1", decisionReference }
    : null;
}

function capabilities(value: unknown): SocialCapabilityReference[] | null {
  if (!Array.isArray(value) || value.length > 24) return null;
  const parsed = value.map(capability);
  return parsed.some((entry) => entry === null) ? null : parsed as SocialCapabilityReference[];
}

export function parseSocialProfile(value: unknown): SocialProfileRecord | null {
  const item = rawRecord(value);
  const avatar = rawRecord(item?.avatar);
  const provenance = rawRecord(item?.provenance);
  const eligibility = item?.amplifierEligibility === null ? null : rawRecord(item?.amplifierEligibility);
  const id = text(item?.id, 120);
  const displayLabel = text(item?.displayLabel, 180);
  const kind = enumValue(item?.kind, ["owned-brand", "owner-personal", "simulation"] as const);
  const role = enumValue(item?.role, ["venture-primary", "company-umbrella", "owned-amplifier", "owner-personal", "simulation"] as const);
  const lifecycle = enumValue(item?.lifecycle, ["idea", "proposed", "setup-needed", "active", "paused", "retired", "rejected", "simulation"] as const);
  const ownerRef = text(item?.ownerRef, 100);
  const purpose = text(item?.purpose);
  const audience = text(item?.audience);
  const languages = textArray(item?.languages, 2);
  const markets = textArray(item?.markets, 12, /^[A-Z]{2}$/u);
  const supportedTopics = textArray(item?.supportedTopics, 24, slug);
  const supportedVentures = textArray(item?.supportedVentures, 24, slug);
  const capabilityRefs = capabilities(item?.capabilityRefs);
  const recurringFormatRefs = textArray(item?.recurringFormatRefs, 12, slug);
  const evidenceRefs = textArray(provenance?.evidenceRefs, 12);
  const avatarKind = enumValue(avatar?.kind, ["asset", "descriptor", "identicon", "none"] as const);
  const provenanceSource = enumValue(provenance?.source, ["owner", "migration", "fixture"] as const);
  const recordedBy = enumValue(provenance?.recordedBy, ["owner", "system"] as const);
  const amplifierVerdict = eligibility ? enumValue(eligibility.verdict, ["accept", "hold", "reject"] as const) : null;
  if (item?.schemaVersion !== "social-profile/1" || !id || !profileId.test(id) || !displayLabel || !kind || !role || !lifecycle || !ownerRef || !slug.test(ownerRef)
    || !purpose || !audience || !languages || languages.length === 0 || !markets || markets.length === 0 || !supportedTopics || !supportedVentures || !capabilityRefs
    || !recurringFormatRefs || !avatarKind || !provenanceSource || !recordedBy || !evidenceRefs || evidenceRefs.length === 0 || typeof item.liveEligible !== "boolean"
    || !dateTime(item.createdAt) || !dateTime(item.updatedAt) || typeof item.notes !== "string" || item.notes.length > 500) return null;
  const ventureRef = item.ventureRef === null ? null : text(item.ventureRef, 100);
  const brandRef = item.brandRef === null ? null : text(item.brandRef, 100);
  const archetype = item.amplifierArchetype === null ? null : text(item.amplifierArchetype, 100);
  const originalContentPromise = nullableText(item.originalContentPromise);
  const avatarDescriptor = nullableText(avatar!.descriptor, 240);
  const avatarReference = nullableText(avatar!.reference, 300);
  const fixtureKey = provenance!.fixtureKey === null ? null : text(provenance!.fixtureKey, 100);
  if (ventureRef === undefined || brandRef === undefined || originalContentPromise === undefined || avatarDescriptor === undefined || avatarReference === undefined || fixtureKey === undefined) return null;
  const parsedEligibility = eligibility && amplifierVerdict && dateTime(eligibility.evaluatedAt) && text(eligibility.purposeGateRef, 300)
    ? { verdict: amplifierVerdict, evaluatedAt: eligibility.evaluatedAt as string, purposeGateRef: text(eligibility.purposeGateRef, 300)!, canonicalPolicyRef: eligibility.canonicalPolicyRef === null ? null : text(eligibility.canonicalPolicyRef, 300) }
    : null;
  if ((item.amplifierEligibility !== null && (!parsedEligibility || parsedEligibility.canonicalPolicyRef === undefined)) || (role === "venture-primary" && ventureRef === null)) return null;
  if ((kind === "simulation") !== (role === "simulation" && lifecycle === "simulation" && provenanceSource === "fixture" && fixtureKey !== null && item.liveEligible === false)) return null;
  if (kind !== "simulation" && (role === "simulation" || lifecycle === "simulation" || provenanceSource === "fixture" || fixtureKey !== null)) return null;
  if (role === "owned-amplifier" && (!archetype || !originalContentPromise || recurringFormatRefs.length < 2)) return null;
  if (role !== "owned-amplifier" && (archetype !== null || parsedEligibility !== null)) return null;
  return { id, displayLabel, kind, role, ownerRef, ventureRef, brandRef, purpose, audience, languages, markets, supportedTopics, supportedVentures, capabilityRefs, amplifierArchetype: archetype, amplifierEligibility: parsedEligibility, originalContentPromise, recurringFormatRefs, avatar: { kind: avatarKind, descriptor: avatarDescriptor, reference: avatarReference }, lifecycle, liveEligible: item.liveEligible, createdAt: item.createdAt as string, updatedAt: item.updatedAt as string, provenance: { source: provenanceSource, recordedBy, evidenceRefs, fixtureKey }, notes: item.notes };
}

export function parseSocialConnection(value: unknown): SocialConnectionRecord | null {
  const item = rawRecord(value); const connector = rawRecord(item?.connector); const health = rawRecord(item?.health); const cadence = rawRecord(item?.cadence);
  const id = text(item?.id, 140); const targetProfile = text(item?.profileId, 120); const platform = enumValue(item?.platform, ["instagram", "threads"] as const);
  const mode = enumValue(item?.mode, ["draft", "held", "autopublish"] as const); const healthStatus = enumValue(health?.status, ["healthy", "unavailable", "expired", "reauthorisation-required", "unverified", "paused"] as const);
  const scopes = textArray(item?.approvedScopes, 12); const supported = textArray(item?.supportedCapabilities, 2); const publicHandle = nullableText(item?.publicHandle, 61);
  const credentialRef = nullableText(item?.credentialRef, 120); const nativeAccountIdRef = nullableText(item?.nativeAccountIdRef, 120); const unavailableReason = nullableText(health?.unavailableReason, 100);
  const last = item?.lastVerified === null ? null : rawRecord(item?.lastVerified); const lastEvidence = last ? textArray(last.evidenceRefs, 8) : null;
  if (item?.schemaVersion !== "social-connection/1" || !id || !connectionId.test(id) || !targetProfile || !profileId.test(targetProfile) || !platform || !mode || !healthStatus || !scopes || !supported
    || supported.some((entry) => entry !== "publish-original" && entry !== "own-insights") || publicHandle === undefined || credentialRef === undefined || nativeAccountIdRef === undefined || unavailableReason === undefined
    || !connector || !text(connector.id, 100) || !text(connector.version, 40) || !text(connector.providerId, 100) || !text(connector.apiVersion, 40) || !text(connector.loginMode, 100)
    || !cadence || !Number.isInteger(cadence.maxOrganicPostsPerDay) || !Number.isInteger(cadence.minHoursBetweenPosts) || cadence.timezone !== "Europe/Prague"
    || (item.tokenExpiresAt !== null && !dateTime(item.tokenExpiresAt)) || (item.appReviewExpiresAt !== null && !dateTime(item.appReviewExpiresAt)) || (item.enabledByHumanAt !== null && !dateTime(item.enabledByHumanAt))
    || (last !== null && (!dateTime(last.at) || !lastEvidence || lastEvidence.length === 0)) || (healthStatus === "healthy") !== (unavailableReason === null)) return null;
  if ((credentialRef && !envRef.test(credentialRef)) || (nativeAccountIdRef && !envRef.test(nativeAccountIdRef))) return null;
  return { id, profileId: targetProfile, platform, publicHandle, connector: { id: connector.id as string, version: connector.version as string, providerId: connector.providerId as string, apiVersion: connector.apiVersion as string, loginMode: connector.loginMode as string }, credentialRef, nativeAccountIdRef, approvedScopes: scopes, supportedCapabilities: supported as SocialConnectionRecord["supportedCapabilities"], mode, health: { status: healthStatus, unavailableReason }, tokenExpiresAt: item.tokenExpiresAt as string | null, appReviewExpiresAt: item.appReviewExpiresAt as string | null, enabledByHumanAt: item.enabledByHumanAt as string | null, cadence: cadence as SocialConnectionRecord["cadence"], lastVerified: last ? { at: last.at as string, evidenceRefs: lastEvidence! } : null };
}

export function parseSocialProfileEvent(value: unknown): SocialProfileEventRecord | null {
  const item = rawRecord(value); const id = text(item?.eventId, 160); const targetProfile = text(item?.profileId, 120); const connection = item?.connectionId === null ? null : text(item?.connectionId, 140);
  const action = enumValue(item?.action, ["proposed", "setup-requested", "connected", "activated", "paused", "reauthorisation-requested", "disconnected", "retired", "rejected", "corrected"] as const);
  const actor = enumValue(item?.actor, ["owner", "system"] as const); const provenanceRef = text(item?.provenanceRef, 300); const reason = text(item?.reason); const superseded = item?.supersededEventRef === null ? null : text(item?.supersededEventRef, 300);
  if (item?.schemaVersion !== "social-profile-event/1" || !id || !eventId.test(id) || !dateTime(item.at) || !targetProfile || !profileId.test(targetProfile) || connection === undefined || (connection !== null && !connectionId.test(connection)) || !action || !actor || !provenanceRef || !reason || superseded === undefined || ((action === "corrected") !== (superseded !== null))) return null;
  return { eventId: id, at: item.at as string, profileId: targetProfile, connectionId: connection, action, actor, provenanceRef, reason, supersededEventRef: superseded };
}

export function resolveSocialProfileSection(value: unknown): SocialProfileSectionId {
  return SOCIAL_PROFILE_SECTIONS.some((section) => section.id === value) ? value as SocialProfileSectionId : "venture-profiles";
}
