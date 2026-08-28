import { rawRecord, type SocialCapabilityReference, type SocialPlatform } from "./model";

export type NetworkRelationshipStatus = "prospect" | "qualified" | "contacted" | "opted-in" | "active" | "paused" | "declined" | "do-not-contact" | "retired";

export interface DistributionContactRecord {
  id: string;
  label: string;
  type: "ambassador" | "creator" | "publisher" | "newsletter" | "community" | "club" | "media" | "podcast" | "other";
  topics: string[];
  ventures: string[];
  platforms: SocialPlatform[];
  languages: Array<"cs" | "en">;
  markets: string[];
  publicContactRefs: Array<{ kind: "public-url" | "public-email" | "public-handle"; value: string; ownerEnteredAt: string }>;
  relationshipStatus: NetworkRelationshipStatus;
  consentEvidenceRef: string | null;
  consentRecordedAt: string | null;
  preferredFormats: Array<"link" | "image" | "carousel" | "video" | "text">;
  preferredCadence: string | null;
  lastContactedAt: string | null;
  lastSharedAt: string | null;
  lastDeclinedAt: string | null;
  doNotContact: boolean;
  notes: string;
  provenance: { source: "owner-entered-public-record" | "owner-import"; evidenceRefs: string[]; importBatchRef: string | null; importedAt: string | null };
}

export interface DistributionContactEventRecord {
  eventId: string;
  contactId: string;
  at: string;
  action: "created" | "qualified" | "contacted" | "opted-in" | "activated" | "paused" | "declined" | "do-not-contact" | "retired" | "corrected";
  actor: "owner";
  reason: string;
  consentEvidenceRef: string | null;
  supersededEventRef: string | null;
}

export interface SocialShareKitRecord {
  id: string;
  campaignId: string;
  contactId: string;
  sourceVentureId: string;
  sourceCapabilityRef: SocialCapabilityReference;
  sourcePackageHash: string;
  assignmentRef: string;
  contactConsentRef: string;
  channel: SocialPlatform;
  locale: "cs" | "en";
  factualSummary: string;
  relevanceReason: string;
  talkingPoints: string[];
  assets: Array<{ ref: string; hash: string; altText: string }>;
  link: string;
  disclosure: string;
  attribution: string;
  utm: { source: string; medium: "manual_share"; campaign: string; content: string };
  expiresAt: string;
  status: "assigned" | "delivered" | "shared" | "declined" | "expired" | "unknown";
  deliveryMode: "copy" | "download" | "manual-send";
  deliveryEvidenceRef: string | null;
  outcome: { state: "assigned" | "delivered" | "shared" | "declined" | "expired" | "unknown"; recordedAt: string; evidenceRef: string | null; attribution: "owner-manual" | "aggregate" | "none"; identityInferred: false; consentInferred: false };
  createdAt: string;
  updatedAt: string;
}

export interface SocialShareKitOutcomeEventRecord {
  eventId: string;
  kitId: string;
  at: string;
  actor: "owner";
  outcome: "delivered" | "shared" | "declined" | "expired" | "unknown";
  attribution: "owner-manual" | "aggregate" | "none";
  evidenceRef: string | null;
  reason: string;
  identityInferred: false;
  consentInferred: false;
}

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const contactId = /^distribution-contact-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const contactEventId = /^distribution-contact-event-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const campaignId = /^social-campaign-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const kitId = /^social-share-kit-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const outcomeId = /^social-share-kit-outcome-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const digest = /^[a-f0-9]{64}$/u;

function text(value: unknown, max = 500): string | null { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null; }
function nullableText(value: unknown, max = 500): string | null | undefined { return value === null ? null : text(value, max) ?? undefined; }
function dateTime(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value; }
function oneOf<T extends string>(value: unknown, values: readonly T[]): T | null { return typeof value === "string" && values.includes(value as T) ? value as T : null; }
function texts(value: unknown, max: number, pattern?: RegExp): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const parsed = value.map((item) => text(item, 300)); if (parsed.some((item) => item === null)) return null;
  const result = parsed as string[]; return new Set(result).size === result.length && (!pattern || result.every((item) => pattern.test(item))) ? result : null;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }

function capability(value: unknown): SocialCapabilityReference | null {
  const item = rawRecord(value); const mapVersion = text(item?.mapVersion, 40); const source = text(item?.source, 100); const reference = text(item?.decisionReference, 300);
  return item?.target === "social-distribution" && item.capability === "approved-publish-package" && item.dataSchemaVersion === "approved-publish-package/1" && mapVersion && source && slug.test(source) && reference
    ? { mapVersion, source, target: "social-distribution", capability: "approved-publish-package", dataSchemaVersion: "approved-publish-package/1", decisionReference: reference } : null;
}

export function parseDistributionContact(value: unknown): DistributionContactRecord | null {
  const item = rawRecord(value); const provenance = rawRecord(item?.provenance); const id = text(item?.id, 140); const label = text(item?.label, 160);
  const type = oneOf(item?.type, ["ambassador", "creator", "publisher", "newsletter", "community", "club", "media", "podcast", "other"] as const);
  const topics = texts(item?.topics, 24, slug); const ventures = texts(item?.ventures, 24, slug); const platforms = texts(item?.platforms, 2); const languages = texts(item?.languages, 2); const markets = texts(item?.markets, 12, /^[A-Z]{2}$/u); const formats = texts(item?.preferredFormats, 5);
  const status = oneOf(item?.relationshipStatus, ["prospect", "qualified", "contacted", "opted-in", "active", "paused", "declined", "do-not-contact", "retired"] as const);
  const consentRef = nullableText(item?.consentEvidenceRef, 300); const consentAt = item?.consentRecordedAt === null ? null : dateTime(item?.consentRecordedAt) ? item.consentRecordedAt : undefined;
  const preferredCadence = nullableText(item?.preferredCadence, 160); const lastContactedAt = item?.lastContactedAt === null ? null : dateTime(item?.lastContactedAt) ? item.lastContactedAt : undefined; const lastSharedAt = item?.lastSharedAt === null ? null : dateTime(item?.lastSharedAt) ? item.lastSharedAt : undefined; const lastDeclinedAt = item?.lastDeclinedAt === null ? null : dateTime(item?.lastDeclinedAt) ? item.lastDeclinedAt : undefined;
  const source = oneOf(provenance?.source, ["owner-entered-public-record", "owner-import"] as const); const evidenceRefs = texts(provenance?.evidenceRefs, 8); const importBatchRef = nullableText(provenance?.importBatchRef, 300); const importedAt = provenance?.importedAt === null ? null : dateTime(provenance?.importedAt) ? provenance.importedAt : undefined;
  if (item?.schemaVersion !== "distribution-contact/1" || !id || !contactId.test(id) || !label || !type || !topics || !ventures || !platforms || platforms.some((entry) => !["instagram", "threads"].includes(entry)) || !languages || languages.length === 0 || languages.some((entry) => !["cs", "en"].includes(entry)) || !markets || markets.length === 0 || !formats || formats.some((entry) => !["link", "image", "carousel", "video", "text"].includes(entry)) || !status || consentRef === undefined || consentAt === undefined || preferredCadence === undefined || lastContactedAt === undefined || lastSharedAt === undefined || lastDeclinedAt === undefined || typeof item.doNotContact !== "boolean" || typeof item.notes !== "string" || item.notes.length > 500 || !source || !evidenceRefs?.length || importBatchRef === undefined || importedAt === undefined) return null;
  if (!Array.isArray(item.publicContactRefs) || item.publicContactRefs.length < 1 || item.publicContactRefs.length > 4) return null;
  const publicContactRefs = item.publicContactRefs.flatMap((raw): DistributionContactRecord["publicContactRefs"] => { const ref = rawRecord(raw); const kind = oneOf(ref?.kind, ["public-url", "public-email", "public-handle"] as const); const contact = text(ref?.value, 300); return kind && contact && dateTime(ref?.ownerEnteredAt) ? [{ kind, value: contact, ownerEnteredAt: ref.ownerEnteredAt }] : []; });
  if (publicContactRefs.length !== item.publicContactRefs.length || (["opted-in", "active"].includes(status) && (!consentRef || !consentAt)) || (["declined", "do-not-contact"].includes(status) && (!item.doNotContact || !lastDeclinedAt)) || (item.doNotContact && !["declined", "do-not-contact", "retired"].includes(status)) || (source === "owner-import") !== (importBatchRef !== null && importedAt !== null)) return null;
  return { id, label, type, topics, ventures, platforms: platforms as SocialPlatform[], languages: languages as Array<"cs" | "en">, markets, publicContactRefs, relationshipStatus: status, consentEvidenceRef: consentRef, consentRecordedAt: consentAt, preferredFormats: formats as DistributionContactRecord["preferredFormats"], preferredCadence, lastContactedAt, lastSharedAt, lastDeclinedAt, doNotContact: item.doNotContact, notes: item.notes, provenance: { source, evidenceRefs, importBatchRef, importedAt } };
}

export function parseDistributionContactEvent(value: unknown): DistributionContactEventRecord | null {
  const item = rawRecord(value); const id = text(item?.eventId, 180); const target = text(item?.contactId, 140); const action = oneOf(item?.action, ["created", "qualified", "contacted", "opted-in", "activated", "paused", "declined", "do-not-contact", "retired", "corrected"] as const); const reason = text(item?.reason); const consent = nullableText(item?.consentEvidenceRef, 300); const superseded = nullableText(item?.supersededEventRef, 300);
  if (item?.schemaVersion !== "distribution-contact-event/1" || !id || !contactEventId.test(id) || !target || !contactId.test(target) || !dateTime(item.at) || !action || item.actor !== "owner" || !reason || consent === undefined || superseded === undefined || (action === "opted-in" && consent === null) || ((action === "corrected") !== (superseded !== null))) return null;
  return { eventId: id, contactId: target, at: item.at as string, action, actor: "owner", reason, consentEvidenceRef: consent, supersededEventRef: superseded };
}

export function projectAdminDistributionContact(base: DistributionContactRecord, records: readonly DistributionContactEventRecord[]): DistributionContactRecord {
  const related = records.filter((event) => event.contactId === base.id); const corrected = new Set(related.filter((event) => event.action === "corrected" && event.supersededEventRef).map((event) => event.supersededEventRef!)); let contact = { ...base };
  for (const event of related.filter((event) => event.action !== "corrected" && !corrected.has(event.eventId)).sort((left, right) => left.at.localeCompare(right.at) || left.eventId.localeCompare(right.eventId))) {
    if (event.action === "qualified") contact = { ...contact, relationshipStatus: "qualified" };
    else if (event.action === "contacted") contact = { ...contact, relationshipStatus: "contacted", lastContactedAt: event.at };
    else if (event.action === "opted-in") contact = { ...contact, relationshipStatus: "opted-in", consentEvidenceRef: event.consentEvidenceRef, consentRecordedAt: event.at, doNotContact: false };
    else if (event.action === "activated" && contact.consentEvidenceRef) contact = { ...contact, relationshipStatus: "active" };
    else if (event.action === "paused") contact = { ...contact, relationshipStatus: "paused" };
    else if (event.action === "declined") contact = { ...contact, relationshipStatus: "declined", doNotContact: true, lastDeclinedAt: event.at };
    else if (event.action === "do-not-contact") contact = { ...contact, relationshipStatus: "do-not-contact", doNotContact: true, lastDeclinedAt: event.at };
    else if (event.action === "retired") contact = { ...contact, relationshipStatus: "retired", doNotContact: true };
  }
  return contact;
}

export function parseSocialShareKit(value: unknown): SocialShareKitRecord | null {
  const item = rawRecord(value); const sourceCapabilityRef = capability(item?.sourceCapabilityRef); const utm = rawRecord(item?.utm); const outcome = rawRecord(item?.outcome); const id = text(item?.id, 140); const campaign = text(item?.campaignId, 140); const contact = text(item?.contactId, 140); const source = text(item?.sourceVentureId, 100); const channel = oneOf(item?.channel, ["instagram", "threads"] as const); const locale = oneOf(item?.locale, ["cs", "en"] as const); const status = oneOf(item?.status, ["assigned", "delivered", "shared", "declined", "expired", "unknown"] as const); const mode = oneOf(item?.deliveryMode, ["copy", "download", "manual-send"] as const); const outcomeState = oneOf(outcome?.state, ["assigned", "delivered", "shared", "declined", "expired", "unknown"] as const); const outcomeAttribution = oneOf(outcome?.attribution, ["owner-manual", "aggregate", "none"] as const);
  const sourceHash = text(item?.sourcePackageHash, 64); const assignmentRef = text(item?.assignmentRef, 300); const consentRef = text(item?.contactConsentRef, 300); const summary = text(item?.factualSummary, 800); const relevance = text(item?.relevanceReason); const points = texts(item?.talkingPoints, 6); const link = text(item?.link, 500); const disclosure = text(item?.disclosure, 300); const attribution = text(item?.attribution, 300); const deliveryEvidence = nullableText(item?.deliveryEvidenceRef, 300); const outcomeEvidence = nullableText(outcome?.evidenceRef, 300);
  if (item?.schemaVersion !== "social-share-kit/1" || !id || !kitId.test(id) || !campaign || !campaignId.test(campaign) || !contact || !contactId.test(contact) || !source || !slug.test(source) || ["personal-growth", "kvorum", "goviral", "contest-radar"].includes(source) || !sourceCapabilityRef || sourceCapabilityRef.source !== source || !sourceHash || !digest.test(sourceHash) || !assignmentRef || !consentRef || !channel || !locale || !summary || !relevance || !points || !link?.startsWith("https://") || !disclosure || !attribution || !utm || !text(utm.source, 100) || utm.medium !== "manual_share" || !text(utm.campaign, 100) || !text(utm.content, 100) || !dateTime(item.expiresAt) || !status || !mode || deliveryEvidence === undefined || !outcomeState || status !== outcomeState || !dateTime(outcome?.recordedAt) || outcomeEvidence === undefined || !outcomeAttribution || outcome?.identityInferred !== false || outcome?.consentInferred !== false || !dateTime(item.createdAt) || !dateTime(item.updatedAt)) return null;
  if ((["delivered", "shared"].includes(status)) !== (deliveryEvidence !== null) || (outcomeAttribution === "aggregate" && outcomeState === "shared") || !Array.isArray(item.assets) || item.assets.length > 10) return null;
  const assets = item.assets.flatMap((raw): SocialShareKitRecord["assets"] => { const asset = rawRecord(raw); const ref = text(asset?.ref, 300); const hash = text(asset?.hash, 64); const altText = text(asset?.altText, 1_000); return ref && hash && digest.test(hash) && altText ? [{ ref, hash, altText }] : []; }); if (assets.length !== item.assets.length) return null;
  return { id, campaignId: campaign, contactId: contact, sourceVentureId: source, sourceCapabilityRef, sourcePackageHash: sourceHash, assignmentRef, contactConsentRef: consentRef, channel, locale, factualSummary: summary, relevanceReason: relevance, talkingPoints: points, assets, link, disclosure, attribution, utm: { source: utm.source as string, medium: "manual_share", campaign: utm.campaign as string, content: utm.content as string }, expiresAt: item.expiresAt as string, status, deliveryMode: mode, deliveryEvidenceRef: deliveryEvidence, outcome: { state: outcomeState, recordedAt: outcome.recordedAt as string, evidenceRef: outcomeEvidence, attribution: outcomeAttribution, identityInferred: false, consentInferred: false }, createdAt: item.createdAt as string, updatedAt: item.updatedAt as string };
}

export function parseSocialShareKitOutcomeEvent(value: unknown): SocialShareKitOutcomeEventRecord | null {
  const item = rawRecord(value); const id = text(item?.eventId, 180); const target = text(item?.kitId, 140); const outcome = oneOf(item?.outcome, ["delivered", "shared", "declined", "expired", "unknown"] as const); const attribution = oneOf(item?.attribution, ["owner-manual", "aggregate", "none"] as const); const evidenceRef = nullableText(item?.evidenceRef, 300); const reason = text(item?.reason);
  if (item?.schemaVersion !== "social-share-kit-outcome-event/1" || !id || !outcomeId.test(id) || !target || !kitId.test(target) || !dateTime(item.at) || item.actor !== "owner" || !outcome || !attribution || evidenceRef === undefined || !reason || item.identityInferred !== false || item.consentInferred !== false || (["delivered", "shared"].includes(outcome) && (attribution !== "owner-manual" || evidenceRef === null)) || (attribution === "aggregate" && outcome !== "unknown")) return null;
  return { eventId: id, kitId: target, at: item.at as string, actor: "owner", outcome, attribution, evidenceRef, reason, identityInferred: false, consentInferred: false };
}

export function projectAdminSocialShareKit(base: SocialShareKitRecord, events: readonly SocialShareKitOutcomeEventRecord[], now: Date): SocialShareKitRecord {
  let kit = { ...base };
  for (const event of events.filter((candidate) => candidate.kitId === base.id).sort((left, right) => left.at.localeCompare(right.at) || left.eventId.localeCompare(right.eventId))) kit = { ...kit, status: event.outcome, deliveryEvidenceRef: ["delivered", "shared"].includes(event.outcome) ? event.evidenceRef : null, outcome: { state: event.outcome, recordedAt: event.at, evidenceRef: event.evidenceRef, attribution: event.attribution, identityInferred: false, consentInferred: false }, updatedAt: event.at };
  if (!["shared", "declined", "expired"].includes(kit.status) && Date.parse(kit.expiresAt) <= now.getTime()) kit = { ...kit, status: "expired", deliveryEvidenceRef: null, outcome: { state: "expired", recordedAt: now.toISOString(), evidenceRef: null, attribution: "none", identityInferred: false, consentInferred: false }, updatedAt: now.toISOString() };
  return kit;
}

export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { return exactKeys(value, keys); }
