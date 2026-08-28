import type {
  AmplificationPolicyRecord,
  AmplifierProposalRecord,
  SocialCapabilityReference,
  SocialPlatform
} from "./model";
import { rawRecord } from "./model";

export interface AmplifierPortfolioRecord {
  version: string;
  ownerRef: string;
  updatedAt: string;
  ownerDecisionRef: string;
  proposals: AmplifierProposalRecord[];
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

function textArray(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const parsed = value.map((entry) => text(entry, 500));
  if (parsed.some((entry) => entry === null)) return null;
  const result = parsed as string[];
  return new Set(result).size === result.length ? result : null;
}

function numberValue(value: unknown, minimum: number, maximum: number, integer = false): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum && (!integer || Number.isInteger(value)) ? value : null;
}

function parseCapability(value: unknown): SocialCapabilityReference | null {
  const item = rawRecord(value);
  const mapVersion = text(item?.mapVersion, 40); const source = text(item?.source, 100); const decisionReference = text(item?.decisionReference, 300);
  return item?.target === "social-distribution" && item.capability === "approved-publish-package" && item.dataSchemaVersion === "approved-publish-package/1" && mapVersion && source && decisionReference
    ? { mapVersion, source, target: "social-distribution", capability: "approved-publish-package", dataSchemaVersion: "approved-publish-package/1", decisionReference }
    : null;
}

function parseFormats(value: unknown): AmplifierProposalRecord["repeatableFormats"] | null {
  if (!Array.isArray(value) || value.length > 12) return null;
  const formats = value.map((entry) => {
    const item = rawRecord(entry); const id = text(item?.id, 100); const name = text(item?.name, 160); const description = text(item?.description); const sourcePlan = text(item?.sourcePlan);
    return id && name && description && sourcePlan ? { id, name, description, sourcePlan } : null;
  });
  if (formats.some((entry) => entry === null)) return null;
  const parsed = formats as AmplifierProposalRecord["repeatableFormats"];
  return new Set(parsed.map(({ id }) => id)).size === parsed.length ? parsed : null;
}

function parseHistory(value: unknown): AmplifierProposalRecord["history"] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) return null;
  const result = value.map((entry) => {
    const item = rawRecord(entry); const revision = numberValue(item?.revision, 1, 100_000, true); const action = text(item?.action, 40); const actor = enumValue(item?.actor, ["owner", "system"] as const); const evidenceRef = text(item?.evidenceRef, 300); const reason = text(item?.reason); const supersedesRevision = item?.supersedesRevision === null ? null : numberValue(item?.supersedesRevision, 1, 100_000, true);
    return revision && dateTime(item?.at) && action && actor && evidenceRef && reason && supersedesRevision !== undefined ? { revision, at: item.at as string, action, actor, evidenceRef, reason, supersedesRevision } : null;
  });
  if (result.some((entry) => entry === null)) return null;
  const parsed = result as AmplifierProposalRecord["history"];
  return parsed.every((entry, index) => index === 0 || entry.revision > parsed[index - 1]!.revision) ? parsed : null;
}

export function parseAmplifierProposal(value: unknown): AmplifierProposalRecord | null {
  const item = rawRecord(value); const expectedCadence = rawRecord(item?.expectedCadence); const runway = rawRecord(item?.launchRunway); const overlap = rawRecord(item?.overlapAnalysis); const direction = rawRecord(item?.platformDirection); const validation = rawRecord(item?.validationPlan); const decision = item?.ownerDecision === null ? null : rawRecord(item?.ownerDecision);
  const id = text(item?.id, 140); const targetProfile = text(item?.profileId, 120); const workingName = text(item?.workingName, 180); const names = textArray(item?.publicNameCandidates, 8); const handles = textArray(item?.publicHandleCandidates, 8);
  const ownerRef = text(item?.ownerRef, 100); const archetype = text(item?.archetype, 100); const purpose = text(item?.purpose); const audience = text(item?.audience); const independent = text(item?.independentReasonToFollow);
  const languages = textArray(item?.languages, 2); const markets = textArray(item?.markets, 12); const topics = textArray(item?.supportedTopics, 24); const ventures = textArray(item?.supportedVentures, 24);
  const rawCapabilities = Array.isArray(item?.capabilityRefs) && item.capabilityRefs.length <= 24 ? item.capabilityRefs.map(parseCapability) : null;
  const promise = text(item?.originalContentPromise); const formats = parseFormats(item?.repeatableFormats); const postsPerWeek = numberValue(expectedCadence?.postsPerWeek, 0, 14, true); const cadenceSource = text(expectedCadence?.sourcePlan);
  const requiredPosts = numberValue(runway?.requiredOriginalPosts, 1, 30, true); const completedPosts = numberValue(runway?.completedOriginalPosts, 0, 30, true); const concepts = Array.isArray(runway?.firstOriginalConcepts) && runway.firstOriginalConcepts.length <= 30 ? runway.firstOriginalConcepts : null; const runwayEvidence = textArray(runway?.evidenceRefs, 24);
  const maximumSupportRatio = numberValue(item?.maximumSupportRatio, 0, 1); const reviewed = textArray(overlap?.reviewedProfileIds, 100); const overlapSummary = text(overlap?.summary); const warnings = textArray(overlap?.collisionWarnings, 24);
  const platforms = textArray(direction?.platforms, 2); const directionMarkets = textArray(direction?.markets, 12); const directionVerdict = enumValue(direction?.verdict, ["pending", "approved", "rejected"] as const); const ownerEvidenceRef = nullableText(direction?.ownerEvidenceRef, 300);
  const factualBio = text(item?.factualBio, 300); const logoAvatarRef = text(item?.logoAvatarRef, 300); const canonicalDestination = text(item?.canonicalDestination, 500); const lifecycle = enumValue(item?.lifecycle, ["idea", "proposed", "setup-needed", "connected", "active", "paused", "retired", "rejected"] as const);
  const ownerVerdict = decision ? enumValue(decision.verdict, ["accept", "hold", "reject"] as const) : null; const reviewAfterDays = numberValue(validation?.reviewAfterDays, 60, 90, true); const requirements = textArray(validation?.evidenceRequirements, 7); const stopConditions = textArray(validation?.stopConditions, 20); const history = parseHistory(item?.history);
  if (item?.schemaVersion !== "social-amplifier-proposal/1" || item.profileKind !== "owned-brand" || item.profileRole !== "owned-amplifier" || item.proposalOrigin !== "owner-proposal"
    || !id || !targetProfile || !workingName || !names || names.length === 0 || !handles || !ownerRef || !archetype || !purpose || !audience || !independent || !languages || languages.length === 0 || !markets || markets.length === 0 || !topics || topics.length === 0 || !ventures
    || !rawCapabilities || rawCapabilities.some((edge) => edge === null) || !promise || !formats || postsPerWeek === null || !cadenceSource || requiredPosts === null || completedPosts === null || !concepts || !runwayEvidence || completedPosts > concepts.length
    || maximumSupportRatio === null || !reviewed || !overlapSummary || !warnings || !platforms || platforms.some((platform) => platform !== "instagram" && platform !== "threads") || !directionMarkets || !directionVerdict || ownerEvidenceRef === undefined
    || !factualBio || !logoAvatarRef || !canonicalDestination || !canonicalDestination.startsWith("https://") || !lifecycle || reviewAfterDays === null || !requirements || requirements.length !== 7 || !stopConditions || stopConditions.length === 0 || !history || !dateTime(item.createdAt) || !dateTime(item.updatedAt)) return null;
  const ownerDecision = decision && ownerVerdict && dateTime(decision.at) && text(decision.evidenceRef, 300) && text(decision.reason)
    ? { verdict: ownerVerdict, at: decision.at as string, evidenceRef: text(decision.evidenceRef, 300)!, reason: text(decision.reason)! }
    : null;
  if (item.ownerDecision !== null && !ownerDecision) return null;
  return { id, profileId: targetProfile, workingName, publicNameCandidates: names, publicHandleCandidates: handles, ownerRef, archetype, purpose, audience, independentReasonToFollow: independent, languages, markets, supportedTopics: topics, supportedVentures: ventures, capabilityRefs: rawCapabilities as SocialCapabilityReference[], originalContentPromise: promise, repeatableFormats: formats, expectedCadence: { postsPerWeek, sourcePlan: cadenceSource }, launchRunway: { requiredOriginalPosts: requiredPosts, completedOriginalPosts: completedPosts, firstOriginalConcepts: concepts, evidenceRefs: runwayEvidence }, maximumSupportRatio, overlapAnalysis: { reviewedProfileIds: reviewed, summary: overlapSummary, collisionWarnings: warnings }, platformDirection: { platforms: platforms as SocialPlatform[], markets: directionMarkets, verdict: directionVerdict, ownerEvidenceRef }, factualBio, logoAvatarRef, canonicalDestination, lifecycle, ownerDecision, validationPlan: { reviewAfterDays, evidenceRequirements: requirements, stopConditions }, history, createdAt: item.createdAt as string, updatedAt: item.updatedAt as string };
}

export function parseAmplifierPortfolio(value: unknown): { portfolio: AmplifierPortfolioRecord | null; droppedProposals: number } {
  const item = rawRecord(value); const version = text(item?.version, 40); const ownerRef = text(item?.ownerRef, 100); const ownerDecisionRef = text(item?.ownerDecisionRef, 300);
  if (item?.schemaVersion !== "social-amplifier-portfolio/1" || !version || !ownerRef || !ownerDecisionRef || !dateTime(item.updatedAt) || !Array.isArray(item.proposals) || item.proposals.length > 100 || !Array.isArray(item.history) || item.history.length === 0 || item.history.length > 100) return { portfolio: null, droppedProposals: 0 };
  const proposals = item.proposals.map(parseAmplifierProposal); const accepted = proposals.filter((entry): entry is AmplifierProposalRecord => entry !== null);
  return { portfolio: { version, ownerRef, updatedAt: item.updatedAt as string, ownerDecisionRef, proposals: accepted }, droppedProposals: proposals.length - accepted.length };
}

export function parseAmplificationPolicy(value: unknown): AmplificationPolicyRecord | null {
  const item = rawRecord(value); const values = rawRecord(item?.values); const version = text(item?.version, 40); const ownerDecisionRef = text(item?.ownerDecisionRef, 300);
  if (item?.schemaVersion !== "amplification-policy/1" || item.id !== "amplification-policy-central" || !version || !ownerDecisionRef || !values) return null;
  const minimumOriginalContentRatio = numberValue(values.minimumOriginalContentRatio, 0, 1); const maximumVentureSupportRatio = numberValue(values.maximumVentureSupportRatio, 0, 1); const rollingWindowPosts = numberValue(values.rollingWindowPosts, 1, 365, true); const originalContentRunwayPosts = numberValue(values.originalContentRunwayPosts, 1, 100, true); const sameSourceVentureCooldownDays = numberValue(values.sameSourceVentureCooldownDays, 0, 365, true); const maximumActiveSupportCampaigns = numberValue(values.maximumActiveSupportCampaigns, 0, 20, true); const duplicateCaptionThreshold = numberValue(values.duplicateCaptionThreshold, 0, 1); const minimumStaggerHours = numberValue(values.minimumStaggerHours, 0, 168, true);
  if (minimumOriginalContentRatio === null || maximumVentureSupportRatio === null || Math.abs(minimumOriginalContentRatio + maximumVentureSupportRatio - 1) > Number.EPSILON * 4 || rollingWindowPosts === null || originalContentRunwayPosts === null || sameSourceVentureCooldownDays === null || maximumActiveSupportCampaigns === null || duplicateCaptionThreshold === null || minimumStaggerHours === null || typeof values.duplicateAssetRejected !== "boolean" || typeof values.audienceSpecificAngleRequired !== "boolean" || typeof values.staggerRequired !== "boolean") return null;
  return { version, ownerDecisionRef, values: { minimumOriginalContentRatio, maximumVentureSupportRatio, rollingWindowPosts, originalContentRunwayPosts, sameSourceVentureCooldownDays, maximumActiveSupportCampaigns, duplicateCaptionThreshold, duplicateAssetRejected: values.duplicateAssetRejected, audienceSpecificAngleRequired: values.audienceSpecificAngleRequired, staggerRequired: values.staggerRequired, minimumStaggerHours } };
}
