import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema, Sha256Schema, VentureIdSchema } from "../contracts/common.js";
import {
  DistributionContactEventSchema,
  DistributionContactSchema,
  SocialCampaignSchema,
  SocialShareKitOutcomeEventSchema,
  SocialShareKitSchema,
  type DistributionContact,
  type DistributionContactEvent,
  type SocialCampaign,
  type SocialShareKit,
  type SocialShareKitOutcomeEvent
} from "../contracts/social-distribution.js";
import { VentureCapabilityMapSchema, type VentureCapabilityMap } from "../contracts/venture-capability.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { resolveVentureCapabilityInMap } from "../ventures/capabilities.js";

export const NETWORK_RELATIONSHIP_BENCHMARK = 50 as const;
const MAX_IMPORT_ROWS = 100;
const MAX_IMPORT_BYTES = 128 * 1_024;
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100);

const ImportRowSchema = z.strictObject({
  label: z.string().trim().min(1).max(160),
  type: z.enum(["ambassador", "creator", "publisher", "newsletter", "community", "club", "media", "podcast", "other"]),
  publicRefKind: z.enum(["public-url", "public-email", "public-handle"]),
  publicRef: z.string().trim().min(1).max(300),
  topics: z.array(SlugSchema).max(24),
  ventures: z.array(VentureIdSchema).max(24),
  platforms: z.array(z.enum(["instagram", "threads"])).max(2),
  languages: z.array(z.enum(["cs", "en"])).min(1).max(2),
  markets: z.array(z.string().regex(/^[A-Z]{2}$/u)).min(1).max(12),
  preferredFormats: z.array(z.enum(["link", "image", "carousel", "video", "text"])).max(5),
  preferredCadence: z.string().trim().min(1).max(160).nullable(),
  relationshipStatus: z.enum(["prospect", "qualified"]),
  notes: z.string().trim().max(500)
});

export type NetworkImportRow = z.infer<typeof ImportRowSchema>;
export interface NetworkImportPreviewRow {
  row: number;
  disposition: "new" | "update" | "conflict" | "drop";
  reasons: string[];
  normalizedPublicRef: string | null;
  contact: DistributionContact | null;
}
export interface NetworkImportPreview {
  schemaVersion: "distribution-network-import-preview/1";
  batchRef: string;
  sourceFormat: "json" | "csv";
  rows: NetworkImportPreviewRow[];
  counts: Record<NetworkImportPreviewRow["disposition"], number>;
  benchmark: { target: 50; actualBefore: number; projectedAfterConfirmedNew: number; fabricatedProgress: false };
  persistenceAuthorized: false;
  outboundAuthorized: false;
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/u, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field.length > 0 || row.length > 0) { row.push(field.replace(/\r$/u, "")); rows.push(row); }
  return rows;
}

function list(value: string): string[] { return value.split("|").map((item) => item.trim()).filter(Boolean); }

function csvRows(source: string): unknown[] {
  const [headers, ...rows] = parseCsv(source); if (!headers) return [];
  const expected = ["label", "type", "publicRefKind", "publicRef", "topics", "ventures", "platforms", "languages", "markets", "preferredFormats", "preferredCadence", "relationshipStatus", "notes"];
  if (headers.length !== expected.length || headers.some((header, index) => header !== expected[index])) throw new Error("CSV headers do not match the bounded Network template");
  return rows.filter((row) => row.some((field) => field.trim())).map((row) => Object.fromEntries(expected.map((header, index) => [header, ["topics", "ventures", "platforms", "languages", "markets", "preferredFormats"].includes(header) ? list(row[index] ?? "") : header === "preferredCadence" && !(row[index] ?? "").trim() ? null : row[index] ?? ""])));
}

function unsafeImportText(value: unknown): boolean {
  const strings: string[] = [];
  const collect = (candidate: unknown): void => {
    if (typeof candidate === "string") strings.push(candidate);
    else if (Array.isArray(candidate)) candidate.forEach(collect);
    else if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) { strings.push(key); collect(item); }
    }
  };
  collect(value);
  return strings.some((candidate) => {
    const normalized = candidate.normalize("NFKC").trim();
    return /^[=+\-@]/u.test(normalized)
      || /<\/?(?:html|script|iframe|form)\b|access[_ -]?token|session[_ -]?cookie|private[_ -]?message|follower[_ -]?list|password|credential|oauth/iu.test(normalized);
  });
}

function normalizedPublicRef(kind: NetworkImportRow["publicRefKind"], value: string): string | null {
  const candidate = value.normalize("NFKC").trim();
  if (kind === "public-url") { try { const url = new URL(candidate); if (url.protocol !== "https:") return null; url.hash = ""; url.hostname = url.hostname.toLocaleLowerCase("en-US"); return url.toString().replace(/\/$/u, ""); } catch { return null; } }
  if (kind === "public-email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(candidate) ? candidate.toLocaleLowerCase("en-US") : null;
  return /^@[A-Za-z0-9._]{1,60}$/u.test(candidate) ? candidate.toLocaleLowerCase("en-US") : null;
}

function contactFromImport(row: NetworkImportRow, ref: string, batchRef: string, now: Date): DistributionContact {
  const id = `distribution-contact-${sha256(`${row.publicRefKind}:${ref}`).slice(0, 24)}`;
  return DistributionContactSchema.parse({
    schemaVersion: "distribution-contact/1", id, label: row.label, type: row.type, topics: row.topics, ventures: row.ventures,
    platforms: row.platforms, languages: row.languages, markets: row.markets,
    publicContactRefs: [{ kind: row.publicRefKind, value: ref, ownerEnteredAt: now.toISOString() }],
    relationshipStatus: row.relationshipStatus, consentEvidenceRef: null, consentRecordedAt: null,
    preferredFormats: row.preferredFormats, preferredCadence: row.preferredCadence,
    lastContactedAt: null, lastSharedAt: null, lastDeclinedAt: null, doNotContact: false, notes: row.notes,
    provenance: { source: "owner-import", evidenceRefs: [batchRef], importBatchRef: batchRef, importedAt: now.toISOString() }
  });
}

export function previewDistributionNetworkImport(input: { format: "json" | "csv"; payload: unknown; existingContacts?: readonly unknown[]; now?: Date }): NetworkImportPreview {
  const bytes = Buffer.byteLength(typeof input.payload === "string" ? input.payload : JSON.stringify(input.payload));
  const now = input.now ?? new Date(); if (Number.isNaN(now.getTime())) throw new Error("Invalid import preview time");
  const existing = (input.existingContacts ?? []).flatMap((value) => { const parsed = DistributionContactSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  let values: unknown[] = []; let parseFailure: string | null = null;
  try {
    if (input.format === "csv") {
      if (typeof input.payload !== "string") parseFailure = "CSV import payload must be text";
      else values = csvRows(input.payload);
    } else {
      const decoded = typeof input.payload === "string" ? JSON.parse(input.payload) as unknown : input.payload;
      if (!Array.isArray(decoded)) parseFailure = "JSON import payload must be an array";
      else values = decoded;
    }
  } catch (error) { parseFailure = error instanceof Error ? error.message : "Import payload could not be parsed"; }
  const batchRef = `network-import:${sha256(canonicalJson({ format: input.format, payload: input.payload })).slice(0, 24)}`;
  if (parseFailure !== null) {
    return { schemaVersion: "distribution-network-import-preview/1", batchRef, sourceFormat: input.format, rows: [{ row: 1, disposition: "drop", reasons: [parseFailure.slice(0, 200)], normalizedPublicRef: null, contact: null }], counts: { new: 0, update: 0, conflict: 0, drop: 1 }, benchmark: { target: NETWORK_RELATIONSHIP_BENCHMARK, actualBefore: existing.length, projectedAfterConfirmedNew: existing.length, fabricatedProgress: false }, persistenceAuthorized: false, outboundAuthorized: false };
  }
  if (bytes > MAX_IMPORT_BYTES || values.length > MAX_IMPORT_ROWS) {
    return { schemaVersion: "distribution-network-import-preview/1", batchRef, sourceFormat: input.format, rows: [{ row: 1, disposition: "drop", reasons: [bytes > MAX_IMPORT_BYTES ? "import-byte-cap-exceeded" : "import-row-cap-exceeded"], normalizedPublicRef: null, contact: null }], counts: { new: 0, update: 0, conflict: 0, drop: 1 }, benchmark: { target: NETWORK_RELATIONSHIP_BENCHMARK, actualBefore: existing.length, projectedAfterConfirmedNew: existing.length, fabricatedProgress: false }, persistenceAuthorized: false, outboundAuthorized: false };
  }
  const existingRefs = new Map<string, DistributionContact[]>();
  for (const contact of existing) for (const reference of contact.publicContactRefs) { const ref = normalizedPublicRef(reference.kind, reference.value); if (ref) existingRefs.set(ref, [...(existingRefs.get(ref) ?? []), contact]); }
  const batchRefs = new Map<string, number>(); const rows: NetworkImportPreviewRow[] = [];
  for (const [index, value] of values.entries()) {
    if (unsafeImportText(value)) { rows.push({ row: index + 1, disposition: "drop", reasons: ["unsafe-or-sensitive-import-field"], normalizedPublicRef: null, contact: null }); continue; }
    const parsed = ImportRowSchema.safeParse(value);
    if (!parsed.success) { rows.push({ row: index + 1, disposition: "drop", reasons: parsed.error.issues.slice(0, 6).map((issue) => issue.message), normalizedPublicRef: null, contact: null }); continue; }
    const ref = normalizedPublicRef(parsed.data.publicRefKind, parsed.data.publicRef);
    if (!ref) { rows.push({ row: index + 1, disposition: "drop", reasons: ["invalid-public-reference"], normalizedPublicRef: null, contact: null }); continue; }
    const seen = batchRefs.get(ref) ?? 0; batchRefs.set(ref, seen + 1); const matches = existingRefs.get(ref) ?? [];
    const disposition = seen > 0 || matches.length > 1 ? "conflict" : matches.length === 1 ? "update" : "new";
    rows.push({ row: index + 1, disposition, reasons: disposition === "conflict" ? ["ambiguous-or-duplicate-public-reference-owner-review-required"] : disposition === "update" ? ["explicit-public-reference-matches-existing-owner-review-required"] : ["validated-new-prospect-or-qualified-record"], normalizedPublicRef: ref, contact: contactFromImport(parsed.data, ref, batchRef, now) });
  }
  const counts = { new: 0, update: 0, conflict: 0, drop: 0 }; for (const row of rows) counts[row.disposition] += 1;
  return { schemaVersion: "distribution-network-import-preview/1", batchRef, sourceFormat: input.format, rows, counts, benchmark: { target: NETWORK_RELATIONSHIP_BENCHMARK, actualBefore: existing.length, projectedAfterConfirmedNew: existing.length + counts.new, fabricatedProgress: false }, persistenceAuthorized: false, outboundAuthorized: false };
}

export async function persistConfirmedNetworkImport(root: string, preview: NetworkImportPreview, confirmedRows: readonly number[]): Promise<{ changed: number; unchanged: number; refused: number }> {
  const confirmed = new Set(confirmedRows); const directory = path.join(root, "social/network/contacts"); await mkdir(directory, { recursive: true }); let changed = 0; let unchanged = 0; let refused = 0;
  for (const row of preview.rows) {
    if (!confirmed.has(row.row)) continue;
    if (row.disposition !== "new" || !row.contact || row.contact.relationshipStatus === "opted-in" || row.contact.relationshipStatus === "active") { refused += 1; continue; }
    const target = path.join(directory, `${row.contact.id}.json`);
    try { await writeFile(target, `${JSON.stringify(row.contact, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 }); changed += 1; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; const existing = DistributionContactSchema.safeParse(JSON.parse(await readFile(target, "utf8")) as unknown); if (existing.success && canonicalJson(existing.data) === canonicalJson(row.contact)) unchanged += 1; else refused += 1; }
  }
  return { changed, unchanged, refused };
}

function effectiveEvents(events: readonly DistributionContactEvent[]): DistributionContactEvent[] {
  const corrected = new Set(events.filter((event) => event.action === "corrected" && event.supersededEventRef).map((event) => event.supersededEventRef!));
  return events.filter((event) => event.action !== "corrected" && !corrected.has(event.eventId)).sort((left, right) => left.at.localeCompare(right.at) || left.eventId.localeCompare(right.eventId));
}

export function projectDistributionContact(contactValue: unknown, eventValues: readonly unknown[]): DistributionContact {
  let contact = DistributionContactSchema.parse(contactValue); const events = effectiveEvents(eventValues.flatMap((value) => { const parsed = DistributionContactEventSchema.safeParse(value); return parsed.success && parsed.data.contactId === contact.id ? [parsed.data] : []; }));
  for (const event of events) {
    if (event.action === "qualified") contact = { ...contact, relationshipStatus: "qualified" };
    else if (event.action === "contacted") contact = { ...contact, relationshipStatus: "contacted", lastContactedAt: event.at };
    else if (event.action === "opted-in") contact = { ...contact, relationshipStatus: "opted-in", consentEvidenceRef: event.consentEvidenceRef, consentRecordedAt: event.at, doNotContact: false };
    else if (event.action === "activated" && contact.consentEvidenceRef !== null) contact = { ...contact, relationshipStatus: "active" };
    else if (event.action === "paused") contact = { ...contact, relationshipStatus: "paused" };
    else if (event.action === "declined") contact = { ...contact, relationshipStatus: "declined", doNotContact: true, lastDeclinedAt: event.at };
    else if (event.action === "do-not-contact") contact = { ...contact, relationshipStatus: "do-not-contact", doNotContact: true, lastDeclinedAt: event.at };
    else if (event.action === "retired") contact = { ...contact, relationshipStatus: "retired", doNotContact: true };
  }
  return DistributionContactSchema.parse(contact);
}

const ShareKitDraftSchema = z.strictObject({
  channel: z.enum(["instagram", "threads"]), locale: z.enum(["cs", "en"]), topics: z.array(SlugSchema).min(1).max(24), market: z.string().regex(/^[A-Z]{2}$/u),
  factualSummary: z.string().trim().min(1).max(800), relevanceReason: z.string().trim().min(1).max(500), talkingPoints: z.array(z.string().trim().min(1).max(300)).max(6),
  assets: z.array(z.strictObject({ ref: EvidenceRefSchema, hash: Sha256Schema, altText: z.string().trim().min(1).max(1_000) })).max(10),
  link: HttpsUrlSchema, disclosure: z.string().trim().min(1).max(300), attribution: z.string().trim().min(1).max(300), expiresAt: DateTimeSchema,
  deliveryMode: z.enum(["copy", "download", "manual-send"]), assignmentRef: EvidenceRefSchema
});

export type ShareKitAssignmentResult = { decision: "assigned" | "held"; reasons: string[]; kit: SocialShareKit | null; authorityGranted: false; outboundAuthorized: false };

function exactCapability(map: VentureCapabilityMap, campaign: SocialCampaign) {
  const result = resolveVentureCapabilityInMap(map, { source: campaign.sourceVentureId, target: "social-distribution", capability: "approved-publish-package", schemaVersion: "approved-publish-package/1" });
  return result.decision === "allowed" && result.edge && campaign.sourceCapabilityRef.mapVersion === map.mapVersion && campaign.sourceCapabilityRef.decisionReference === result.edge.governingReference ? campaign.sourceCapabilityRef : null;
}

export function assignSocialShareKit(input: { campaign: unknown; contact: unknown; capabilityMap: unknown; draft: unknown; now?: Date }): ShareKitAssignmentResult {
  const campaign = SocialCampaignSchema.parse(input.campaign); const contact = DistributionContactSchema.parse(input.contact); const map = VentureCapabilityMapSchema.parse(input.capabilityMap); const draft = ShareKitDraftSchema.parse(input.draft); const now = input.now ?? new Date(); const reasons: string[] = [];
  if (["personal-growth", "kvorum", "goviral", "contest-radar"].includes(campaign.sourceVentureId)) reasons.push("isolated-or-deferred-source");
  if (!["approved", "partially-approved"].includes(campaign.status)) reasons.push("campaign-owner-approval-required");
  if (!["opted-in", "active"].includes(contact.relationshipStatus) || contact.consentEvidenceRef === null || contact.consentRecordedAt === null) reasons.push("explicit-opt-in-required");
  if (contact.doNotContact || ["declined", "do-not-contact", "retired"].includes(contact.relationshipStatus)) reasons.push("do-not-contact-block");
  if (!contact.ventures.includes(campaign.sourceVentureId)) reasons.push("venture-fit-missing");
  if (!draft.topics.some((topic) => contact.topics.includes(topic))) reasons.push("topic-fit-missing");
  if (!contact.platforms.includes(draft.channel)) reasons.push("platform-fit-missing");
  if (!contact.languages.includes(draft.locale)) reasons.push("language-fit-missing");
  if (!contact.markets.includes(draft.market)) reasons.push("market-fit-missing");
  const capability = exactCapability(map, campaign); if (!capability) reasons.push("missing-stale-held-or-denied-capability");
  if (Date.parse(draft.expiresAt) <= now.getTime()) reasons.push("share-kit-expired");
  if (campaign.sourceVentureId === "door-money" && !campaign.sourcePackage.artifactRef.startsWith("state/ventures/door-money/")) reasons.push("door-money-private-boundary");
  if (reasons.length > 0 || !capability) return { decision: "held", reasons: [...new Set(reasons)], kit: null, authorityGranted: false, outboundAuthorized: false };
  const suffix = sha256(canonicalJson({ campaignId: campaign.id, contactId: contact.id, channel: draft.channel, locale: draft.locale, packageHash: campaign.sourcePackage.packageHash })).slice(0, 20);
  const kit = SocialShareKitSchema.parse({
    schemaVersion: "social-share-kit/1", id: `social-share-kit-${suffix}`, campaignId: campaign.id, contactId: contact.id, sourceVentureId: campaign.sourceVentureId,
    sourceCapabilityRef: capability, sourcePackageHash: campaign.sourcePackage.packageHash, assignmentRef: draft.assignmentRef, contactConsentRef: contact.consentEvidenceRef,
    channel: draft.channel, locale: draft.locale, factualSummary: draft.factualSummary, relevanceReason: draft.relevanceReason, talkingPoints: draft.talkingPoints,
    assets: draft.assets, link: draft.link, disclosure: draft.disclosure, attribution: draft.attribution,
    utm: { source: contact.id.replace(/^distribution-contact-/u, "").slice(0, 100), medium: "manual_share", campaign: campaign.releaseId, content: `kit-${suffix}` },
    expiresAt: draft.expiresAt, status: "assigned", deliveryMode: draft.deliveryMode, deliveryEvidenceRef: null,
    outcome: { state: "assigned", recordedAt: now.toISOString(), evidenceRef: draft.assignmentRef, attribution: "owner-manual", identityInferred: false, consentInferred: false },
    createdAt: now.toISOString(), updatedAt: now.toISOString()
  });
  return { decision: "assigned", reasons: ["explicit-opt-in-and-exact-fit"], kit, authorityGranted: false, outboundAuthorized: false };
}

export function projectSocialShareKit(kitValue: unknown, outcomeValues: readonly unknown[], now = new Date()): SocialShareKit {
  let kit = SocialShareKitSchema.parse(kitValue); const events = outcomeValues.flatMap((value) => { const parsed = SocialShareKitOutcomeEventSchema.safeParse(value); return parsed.success && parsed.data.kitId === kit.id ? [parsed.data] : []; }).sort((left, right) => left.at.localeCompare(right.at) || left.eventId.localeCompare(right.eventId));
  for (const event of events) kit = SocialShareKitSchema.parse({ ...kit, status: event.outcome, deliveryEvidenceRef: ["delivered", "shared"].includes(event.outcome) ? event.evidenceRef : null, outcome: { state: event.outcome, recordedAt: event.at, evidenceRef: event.evidenceRef, attribution: event.attribution, identityInferred: false, consentInferred: false }, updatedAt: event.at });
  if (!["shared", "declined", "expired"].includes(kit.status) && Date.parse(kit.expiresAt) <= now.getTime()) kit = SocialShareKitSchema.parse({ ...kit, status: "expired", deliveryEvidenceRef: null, outcome: { state: "expired", recordedAt: now.toISOString(), evidenceRef: null, attribution: "none", identityInferred: false, consentInferred: false }, updatedAt: now.toISOString() });
  return kit;
}

export function recordSocialShareKitOutcome(value: unknown): SocialShareKitOutcomeEvent { return SocialShareKitOutcomeEventSchema.parse(value); }
