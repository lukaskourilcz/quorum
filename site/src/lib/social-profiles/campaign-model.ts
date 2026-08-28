import { rawRecord } from "./model";

export type CampaignTargetRole = "primary" | "umbrella" | "amplifier";
export type CampaignStatus = "draft" | "needs-owner-review" | "approved" | "partially-approved" | "held" | "queued" | "in-progress" | "completed" | "cancelled" | "expired";

export interface CampaignHardGateRecord {
  gate: string;
  status: "pass" | "hold" | "reject";
  reason: string;
  evidenceRef: string | null;
}

export interface CampaignScoreComponentRecord {
  component: string;
  value: number | null;
  weight: number;
  reason: string;
  evidenceRef: string | null;
}

export interface SocialCampaignTargetRecord {
  id: string;
  role: CampaignTargetRole;
  profileId: string;
  ventureRef: string | null;
  fit: "eligible" | "held" | "rejected";
  reasons: string[];
  capabilityReference: string | null;
  amplifierEligibilityRef: string | null;
  selection: { hardGates: CampaignHardGateRecord[]; score: { total: number | null; components: CampaignScoreComponentRecord[] } };
}

export interface SocialCampaignItemRecord {
  id: string;
  targetId: string;
  channel: "instagram" | "threads";
  locale: "cs" | "en";
  connectionRef: string | null;
  providerRef: string | null;
  objective: "qualified-visit" | "trust" | "release-awareness" | "community-value";
  audience: string;
  copy: {
    text: string;
    commentaryType: string;
    destination: string;
    factualClaimRefs: string[];
    evidenceRefs: string[];
    rendererRef: string;
    assets: Array<{ ref: string; hash: string; altText: string }>;
  };
  contentHash: string;
  assetHashes: string[];
  targetHash: string;
  windowHash: string;
  policyHash: string;
  window: { notBefore: string; notAfter: string };
  utm: { source: "instagram" | "threads"; medium: "organic_social"; campaign: string; content: string };
  approval: { status: "needs-owner-review" | "approved" | "rejected" | "invalidated"; bindingHash: string; approvalRef: string | null; approvedAt: string | null; approvedBy: "owner" | null };
  status: "draft" | "approved" | "held" | "queued" | "publishing" | "published" | "failed" | "needs-reconciliation" | "expired" | "cancelled";
}

export interface SocialCampaignRecord {
  id: string;
  campaignVersion: string;
  idempotencyKey: string;
  releaseId: string;
  releaseVerification: { verifiedAt: string; evidenceRef: string };
  contentIds: string[];
  inputHash: string;
  sourceVentureId: string;
  sourcePrimaryProfileId: string;
  sourceCapabilityRef: { mapVersion: string; decisionReference: string };
  sourcePackage: { artifactRef: string; packageHash: string };
  objective: "qualified-visit" | "trust" | "release-awareness" | "community-value";
  audience: string;
  effectiveDecision: { capabilityMapVersion: string; capabilitySetHash: string; policyVersion: string; policyHash: string; selectorVersion: string };
  schedulePolicy: { timezone: "Europe/Prague"; primaryOffsetHours: 0; umbrellaOffsetHours: number; amplifierOffsetHours: [number, number] };
  targets: SocialCampaignTargetRecord[];
  contactAssignments: [];
  channelItems: SocialCampaignItemRecord[];
  selectionOutcome: "selected" | "primary-only" | "held";
  status: CampaignStatus;
  holdReasons: string[];
  providerAvailability: "available" | "unavailable" | "held" | "not-configured";
  measurementAvailability: "available" | "unavailable" | "held" | "manual-only";
  createdAt: string;
  updatedAt: string;
}

export interface SocialCampaignEventRecord {
  eventId: string;
  campaignId: string;
  targetId: string | null;
  itemId: string | null;
  action: "approve-target" | "reject-target" | "correct-item" | "change-window" | "hold" | "cancel";
  at: string;
  actor: "owner";
  reason: string;
  expectedBindingHash: string | null;
  replacement: { text: string | null; destination: string | null; altText: string | null; notBefore: string | null; notAfter: string | null; bindingHash: string } | null;
}

export interface SocialCampaignDecisionRecord {
  id: string;
  releaseId: string;
  sourceVentureId: string;
  decision: "created" | "duplicate" | "skip" | "held";
  reasons: string[];
  campaignId: string | null;
  evidenceRefs: string[];
  decidedAt: string;
}

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const campaignId = /^social-campaign-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const profileId = /^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const connectionId = /^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const hash = /^[a-f0-9]{64}$/u;

function text(value: unknown, max = 2_200): string | null { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null; }
function nullableText(value: unknown, max = 2_200): string | null | undefined { return value === null ? null : text(value, max) ?? undefined; }
function dateTime(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value; }
function oneOf<T extends string>(value: unknown, values: readonly T[]): T | null { return typeof value === "string" && values.includes(value as T) ? value as T : null; }
function texts(value: unknown, max: number): string[] | null { if (!Array.isArray(value) || value.length > max) return null; const result = value.map((entry) => text(entry, 500)); return result.some((entry) => entry === null) ? null : result as string[]; }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }

function target(value: unknown): SocialCampaignTargetRecord | null {
  const item = rawRecord(value); const selection = rawRecord(item?.selection); const score = rawRecord(selection?.score);
  const id = text(item?.id, 100); const role = oneOf(item?.role, ["primary", "umbrella", "amplifier"] as const); const profile = text(item?.profileId, 120); const venture = nullableText(item?.ventureRef, 80);
  const fit = oneOf(item?.fit, ["eligible", "held", "rejected"] as const); const reasons = texts(item?.reasons, 16); const amplifierRef = nullableText(item?.amplifierEligibilityRef, 160);
  const capability = item?.capabilityRef === null ? null : rawRecord(item?.capabilityRef); const decisionReference = capability ? text(capability.decisionReference, 160) : null;
  const rawGates = Array.isArray(selection?.hardGates) ? selection.hardGates : null; const rawComponents = Array.isArray(score?.components) ? score.components : null;
  if (!item || !id || !slug.test(id) || !role || !profile || !profileId.test(profile) || venture === undefined || !fit || !reasons || reasons.length === 0 || amplifierRef === undefined || !selection || !score || !rawGates || !rawComponents || rawGates.length === 0 || rawGates.length > 18 || rawComponents.length > 7) return null;
  const hardGates = rawGates.flatMap((raw): CampaignHardGateRecord[] => { const gate = rawRecord(raw); const name = text(gate?.gate, 100); const status = oneOf(gate?.status, ["pass", "hold", "reject"] as const); const reason = text(gate?.reason, 500); const evidenceRef = nullableText(gate?.evidenceRef, 160); return name && status && reason && evidenceRef !== undefined ? [{ gate: name, status, reason, evidenceRef }] : []; });
  const components = rawComponents.flatMap((raw): CampaignScoreComponentRecord[] => { const component = rawRecord(raw); const name = text(component?.component, 100); const value = component?.value === null ? null : typeof component?.value === "number" && component.value >= 0 && component.value <= 100 ? component.value : undefined; const weight = typeof component?.weight === "number" && component.weight >= 0 && component.weight <= 1 ? component.weight : null; const reason = text(component?.reason, 500); const evidenceRef = nullableText(component?.evidenceRef, 160); return name && value !== undefined && weight !== null && reason && evidenceRef !== undefined ? [{ component: name, value, weight, reason, evidenceRef }] : []; });
  const total = score.total === null ? null : typeof score.total === "number" && score.total >= 0 && score.total <= 100 ? score.total : undefined;
  if (hardGates.length !== rawGates.length || components.length !== rawComponents.length || total === undefined || (role === "amplifier" && venture !== null) || (capability !== null && !decisionReference)) return null;
  return { id, role, profileId: profile, ventureRef: venture, fit, reasons, capabilityReference: decisionReference, amplifierEligibilityRef: amplifierRef, selection: { hardGates, score: { total, components } } };
}

function campaignItem(value: unknown): SocialCampaignItemRecord | null {
  const item = rawRecord(value); const copy = rawRecord(item?.copy); const window = rawRecord(item?.window); const utm = rawRecord(item?.utm); const approval = rawRecord(item?.approval);
  const id = text(item?.id, 100); const targetId = text(item?.targetId, 100); const channel = oneOf(item?.channel, ["instagram", "threads"] as const); const locale = oneOf(item?.locale, ["cs", "en"] as const); const connection = nullableText(item?.connectionRef, 140); const provider = nullableText(item?.providerRef, 100); const objective = oneOf(item?.objective, ["qualified-visit", "trust", "release-awareness", "community-value"] as const); const audience = text(item?.audience, 500);
  const copyText = text(copy?.text); const commentaryType = text(copy?.commentaryType, 100); const destination = text(copy?.destination, 500); const factual = texts(copy?.factualClaimRefs, 24); const evidence = texts(copy?.evidenceRefs, 24); const renderer = text(copy?.rendererRef, 160); const rawAssets = Array.isArray(copy?.assets) ? copy.assets : null;
  const assets = rawAssets?.flatMap((raw): SocialCampaignItemRecord["copy"]["assets"] => { const asset = rawRecord(raw); const ref = text(asset?.ref, 160); const digest = text(asset?.hash, 64); const altText = text(asset?.altText, 1_000); return ref && digest && hash.test(digest) && altText ? [{ ref, hash: digest, altText }] : []; }) ?? null;
  const contentHash = text(item?.contentHash, 64); const assetHashes = texts(item?.assetHashes, 10); const targetHash = text(item?.targetHash, 64); const windowHash = text(item?.windowHash, 64); const policyHash = text(item?.policyHash, 64); const notBefore = text(window?.notBefore, 40); const notAfter = text(window?.notAfter, 40);
  const utmSource = oneOf(utm?.source, ["instagram", "threads"] as const); const utmCampaign = text(utm?.campaign, 100); const utmContent = text(utm?.content, 100); const approvalStatus = oneOf(approval?.status, ["needs-owner-review", "approved", "rejected", "invalidated"] as const); const bindingHash = text(approval?.bindingHash, 64); const approvalRef = nullableText(approval?.approvalRef, 160); const approvedAt = approval?.approvedAt === null ? null : dateTime(approval?.approvedAt) ? approval.approvedAt : undefined; const approvedBy = approval?.approvedBy === null ? null : approval?.approvedBy === "owner" ? "owner" as const : undefined; const status = oneOf(item?.status, ["draft", "approved", "held", "queued", "publishing", "published", "failed", "needs-reconciliation", "expired", "cancelled"] as const);
  if (!item || !id || !slug.test(id) || !targetId || !slug.test(targetId) || !channel || !locale || connection === undefined || (connection && !connectionId.test(connection)) || provider === undefined || !objective || !audience || !copyText || !commentaryType || !destination?.startsWith("https://") || !factual?.length || !evidence?.length || !renderer || !assets || assets.length !== rawAssets?.length || !contentHash || !hash.test(contentHash) || !assetHashes || assetHashes.some((digest) => !hash.test(digest)) || !targetHash || !hash.test(targetHash) || !windowHash || !hash.test(windowHash) || !policyHash || !hash.test(policyHash) || !notBefore || !notAfter || !dateTime(notBefore) || !dateTime(notAfter) || Date.parse(notAfter) <= Date.parse(notBefore) || !utmSource || utmSource !== channel || utm?.medium !== "organic_social" || !utmCampaign || !utmContent || !approvalStatus || !bindingHash || !hash.test(bindingHash) || approvalRef === undefined || approvedAt === undefined || approvedBy === undefined || !status) return null;
  if (assets.map(({ hash: digest }) => digest).join(":") !== assetHashes.join(":")) return null;
  return { id, targetId, channel, locale, connectionRef: connection, providerRef: provider, objective, audience, copy: { text: copyText, commentaryType, destination, factualClaimRefs: factual, evidenceRefs: evidence, rendererRef: renderer, assets }, contentHash, assetHashes, targetHash, windowHash, policyHash, window: { notBefore, notAfter }, utm: { source: utmSource, medium: "organic_social", campaign: utmCampaign, content: utmContent }, approval: { status: approvalStatus, bindingHash, approvalRef, approvedAt, approvedBy }, status };
}

export function parseSocialCampaign(value: unknown): SocialCampaignRecord | null {
  const item = rawRecord(value); if (!item || !exactKeys(item, ["schemaVersion", "campaignVersion", "id", "idempotencyKey", "releaseId", "releaseVerification", "contentIds", "inputHash", "sourceVentureId", "sourcePrimaryProfileId", "sourceCapabilityRef", "sourcePackage", "objective", "audience", "effectiveDecision", "schedulePolicy", "targets", "contactAssignments", "channelItems", "selectionOutcome", "status", "holdReasons", "providerAvailability", "measurementAvailability", "history", "createdAt", "updatedAt"])) return null;
  const verification = rawRecord(item.releaseVerification); const capability = rawRecord(item.sourceCapabilityRef); const pack = rawRecord(item.sourcePackage); const effective = rawRecord(item.effectiveDecision); const schedule = rawRecord(item.schedulePolicy);
  const id = text(item.id, 140); const campaignVersion = text(item.campaignVersion, 40); const key = text(item.idempotencyKey, 64); const releaseId = text(item.releaseId, 100); const contentIds = texts(item.contentIds, 24); const inputHash = text(item.inputHash, 64); const source = text(item.sourceVentureId, 80); const primary = text(item.sourcePrimaryProfileId, 120); const objective = oneOf(item.objective, ["qualified-visit", "trust", "release-awareness", "community-value"] as const); const audience = text(item.audience, 500); const selectionOutcome = oneOf(item.selectionOutcome, ["selected", "primary-only", "held"] as const); const status = oneOf(item.status, ["draft", "needs-owner-review", "approved", "partially-approved", "held", "queued", "in-progress", "completed", "cancelled", "expired"] as const); const holds = texts(item.holdReasons, 11); const provider = oneOf(item.providerAvailability, ["available", "unavailable", "held", "not-configured"] as const); const measurement = oneOf(item.measurementAvailability, ["available", "unavailable", "held", "manual-only"] as const);
  const verifiedAt = text(verification?.verifiedAt, 40); const verificationRef = text(verification?.evidenceRef, 160); const mapVersion = text(capability?.mapVersion, 40); const decisionReference = text(capability?.decisionReference, 160); const artifactRef = text(pack?.artifactRef, 160); const packageHash = text(pack?.packageHash, 64);
  const capabilityMapVersion = text(effective?.capabilityMapVersion, 40); const capabilitySetHash = text(effective?.capabilitySetHash, 64); const policyVersion = text(effective?.policyVersion, 40); const policyHash = text(effective?.policyHash, 64); const selectorVersion = text(effective?.selectorVersion, 40);
  const rawTargets = Array.isArray(item.targets) ? item.targets : null; const rawItems = Array.isArray(item.channelItems) ? item.channelItems : null; const targets = rawTargets?.map(target).filter((entry): entry is SocialCampaignTargetRecord => entry !== null) ?? null; const channelItems = rawItems?.map(campaignItem).filter((entry): entry is SocialCampaignItemRecord => entry !== null) ?? null;
  if (item.schemaVersion !== "social-campaign/1" || !id || !campaignId.test(id) || !campaignVersion || !key || !hash.test(key) || !releaseId || !slug.test(releaseId) || verification?.sourceType !== "verified-venture-release" || verification?.status !== "verified" || !verifiedAt || !dateTime(verifiedAt) || !verificationRef || !contentIds?.length || !inputHash || !hash.test(inputHash) || !source || ["personal-growth", "kvorum", "goviral", "contest-radar"].includes(source) || !primary || !profileId.test(primary) || capability?.source !== source || capability?.target !== "social-distribution" || capability?.capability !== "approved-publish-package" || capability?.dataSchemaVersion !== "approved-publish-package/1" || !mapVersion || !decisionReference || pack?.schemaVersion !== "approved-publish-package/1" || !artifactRef || !packageHash || !hash.test(packageHash) || !objective || !audience || !capabilityMapVersion || !capabilitySetHash || !hash.test(capabilitySetHash) || !policyVersion || !policyHash || !hash.test(policyHash) || !selectorVersion || schedule?.timezone !== "Europe/Prague" || schedule?.primaryOffsetHours !== 0 || typeof schedule?.umbrellaOffsetHours !== "number" || !Array.isArray(schedule?.amplifierOffsetHours) || schedule.amplifierOffsetHours.length !== 2 || !targets || targets.length !== rawTargets?.length || !channelItems || channelItems.length !== rawItems?.length || !Array.isArray(item.contactAssignments) || item.contactAssignments.length !== 0 || !selectionOutcome || !status || !holds || !provider || !measurement || !dateTime(item.createdAt) || !dateTime(item.updatedAt)) return null;
  const targetIds = new Set(targets.map((candidate) => candidate.id)); if (!targets.some((candidate) => candidate.role === "primary" && candidate.profileId === primary && candidate.ventureRef === source) || channelItems.some((entry) => !targetIds.has(entry.targetId))) return null;
  return { id, campaignVersion, idempotencyKey: key, releaseId, releaseVerification: { verifiedAt, evidenceRef: verificationRef }, contentIds, inputHash, sourceVentureId: source, sourcePrimaryProfileId: primary, sourceCapabilityRef: { mapVersion, decisionReference }, sourcePackage: { artifactRef, packageHash }, objective, audience, effectiveDecision: { capabilityMapVersion, capabilitySetHash, policyVersion, policyHash, selectorVersion }, schedulePolicy: { timezone: "Europe/Prague", primaryOffsetHours: 0, umbrellaOffsetHours: schedule.umbrellaOffsetHours as number, amplifierOffsetHours: schedule.amplifierOffsetHours as [number, number] }, targets, contactAssignments: [], channelItems, selectionOutcome, status, holdReasons: holds, providerAvailability: provider, measurementAvailability: measurement, createdAt: item.createdAt, updatedAt: item.updatedAt };
}

export function parseSocialCampaignEvent(value: unknown): SocialCampaignEventRecord | null {
  const item = rawRecord(value); const replacement = item?.replacement === null ? null : rawRecord(item?.replacement); const eventId = text(item?.eventId, 180); const campaign = text(item?.campaignId, 140); const targetId = nullableText(item?.targetId, 100); const itemId = nullableText(item?.itemId, 100); const action = oneOf(item?.action, ["approve-target", "reject-target", "correct-item", "change-window", "hold", "cancel"] as const); const reason = text(item?.reason, 500); const expected = nullableText(item?.expectedBindingHash, 64);
  const parsedReplacement = replacement ? { text: nullableText(replacement.text), destination: nullableText(replacement.destination, 500), altText: nullableText(replacement.altText, 1_000), notBefore: nullableText(replacement.notBefore, 40), notAfter: nullableText(replacement.notAfter, 40), bindingHash: text(replacement.bindingHash, 64) } : null;
  if (item?.schemaVersion !== "social-campaign-event/1" || !eventId || !/^social-campaign-event-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(eventId) || !campaign || !campaignId.test(campaign) || targetId === undefined || itemId === undefined || !action || !dateTime(item.at) || item.actor !== "owner" || !reason || expected === undefined || (expected !== null && !hash.test(expected)) || (replacement && (!parsedReplacement || Object.values(parsedReplacement).some((field) => field === undefined) || !parsedReplacement.bindingHash || !hash.test(parsedReplacement.bindingHash)))) return null;
  const targetAction = ["approve-target", "reject-target"].includes(action); const itemAction = ["correct-item", "change-window"].includes(action); if (targetAction !== (targetId !== null) || itemAction !== (itemId !== null) || itemAction !== (replacement !== null) || ["approve-target", "reject-target", "correct-item", "change-window"].includes(action) !== (expected !== null)) return null;
  return { eventId, campaignId: campaign, targetId, itemId, action, at: item.at, actor: "owner", reason, expectedBindingHash: expected, replacement: parsedReplacement as SocialCampaignEventRecord["replacement"] };
}

export function parseSocialCampaignDecision(value: unknown): SocialCampaignDecisionRecord | null {
  const item = rawRecord(value); const id = text(item?.id, 80); const releaseId = text(item?.releaseId, 100); const source = text(item?.sourceVentureId, 80); const decision = oneOf(item?.decision, ["created", "duplicate", "skip", "held"] as const); const reasons = texts(item?.reasons, 12); const campaign = nullableText(item?.campaignId, 140); const evidence = texts(item?.evidenceRefs, 24);
  return item?.schemaVersion === "social-campaign-generation-decision/1" && id && /^social-campaign-decision-[a-f0-9]{20}$/u.test(id) && releaseId && slug.test(releaseId) && source && !["personal-growth", "kvorum", "contest-radar"].includes(source) && decision && reasons?.length && campaign !== undefined && (campaign === null || campaignId.test(campaign)) && evidence?.length && dateTime(item.decidedAt) ? { id, releaseId, sourceVentureId: source, decision, reasons, campaignId: campaign, evidenceRefs: evidence, decidedAt: item.decidedAt } : null;
}

