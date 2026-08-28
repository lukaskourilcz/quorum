import { createHash } from "node:crypto";
import {
  CAROUSEL_BRANDS,
  renderCarouselPng,
  validateTemplateForBrand,
  webDevSignalSlot,
  webDevSignalTemplate,
  webDevSignalVariant,
  type CarouselPayload,
  type WebDevSignalVisualStatus
} from "@boardlessai/carousel-studio";
import {
  WebDevDesignPayloadSchema,
  WebDevRenderReceiptSchema,
  type WebDevDesignPayload,
  type WebDevEditionPackage,
  type WebDevEvidenceBrief,
  type WebDevRecord,
  type WebDevRenderReceipt
} from "../../contracts/webdev-signal.js";
import { BoundedRenderSummarySchema } from "../../contracts/venture-capability.js";
import { atomicWriteBuffer, atomicWriteJson, readJson } from "../../state.js";
import { resolveWebDevSignalOutput } from "./capabilities.js";

const BRAND_VERSION = "1.0.0";
const RENDERER_VERSION = "1.0.0";
const FONT_SET_VERSION = "committed-metrics/1";
const CAPABILITY_REF = "webdev-signal-to-design-lab:bounded-render-summary:bounded-render-summary/1" as const;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function statusFor(record: WebDevRecord, brief: WebDevEvidenceBrief): WebDevSignalVisualStatus {
  if (record.changeKind === "security-advisory") return "security";
  if (record.changeKind === "breaking-change") return "breaking";
  if (record.changeKind === "deprecation" || brief.releaseStability === "deprecated") return "deprecated";
  if (brief.releaseStability === "beta" || brief.releaseStability === "preview") return "preview";
  return "stable";
}

function identifierList(record: WebDevRecord): WebDevDesignPayload["identifiers"] {
  const classified = [
    ...record.versionRefs.map((value) => ({ value, classification: "release" as const })),
    ...record.affectedVersions.map((value) => ({ value, classification: "affected" as const })),
    ...record.fixedVersions.map((value) => ({ value, classification: "fixed" as const })),
    ...record.security.advisoryIds.map((value) => ({ value, classification: "advisory" as const }))
  ];
  return classified.filter((entry, index) => classified.findIndex((candidate) => candidate.value === entry.value) === index);
}

function semanticsFor(role: WebDevEditionPackage["instagramPanels"][number]["role"]) {
  if (role === "cover") return ["lead" as const];
  return [role] as Array<"change" | "impact" | "action" | "source">;
}

/** Select an already accepted locale package into the renderer's strict, source-locked boundary. */
export function createWebDevDesignPayload(input: {
  edition: WebDevEditionPackage;
  editionRef: string;
  brief: WebDevEvidenceBrief;
  record: WebDevRecord;
  correctionSequence?: number;
  supersedesPayloadHash?: string | null;
}): WebDevDesignPayload {
  if (input.edition.status !== "approved") throw new Error("Design Lab accepts only approved WebDev Signal locale packages");
  if (input.edition.contentHash !== hash(Object.fromEntries(Object.entries(input.edition).filter(([key]) => key !== "contentHash")))) {
    throw new Error("Edition package hash does not match its immutable content");
  }
  if (input.edition.evidenceBriefRef !== input.editionRef && input.edition.evidenceBriefRef.length === 0) {
    throw new Error("Edition package has no evidence brief reference");
  }
  const status = statusFor(input.record, input.brief);
  const identifiers = identifierList(input.record);
  const withoutHash = {
    schemaVersion: "webdev-design-payload/1" as const,
    venture: "webdev-signal" as const,
    edition: input.edition.locale === "cs" ? "CZ" as const : "EN" as const,
    locale: input.edition.locale,
    packageRef: input.editionRef,
    packageHash: input.edition.contentHash,
    project: input.record.project,
    topic: input.record.topic,
    changeKind: input.record.changeKind,
    status,
    identifiers,
    panels: input.edition.instagramPanels.map((panel, index) => ({
      id: `panel-${String(index + 1).padStart(2, "0")}`,
      semantics: semanticsFor(panel.role),
      heading: panel.heading,
      body: panel.body,
      claimIds: panel.role === "source" ? [] : input.edition.claimIdsUsed,
      sourceRefs: panel.role === "source" ? input.edition.sourceAttribution.map((source) => source.url) : []
    })),
    sources: input.brief.sources,
    altTextSemantic: input.edition.altTextInput,
    brand: { id: "webdev-signal" as const, version: BRAND_VERSION as "1.0.0" },
    template: {
      id: `webdev-signal-change-${input.edition.instagramPanels.length}`,
      version: "1.0.0" as const
    },
    correction: {
      sequence: input.correctionSequence ?? 0,
      supersedesPayloadHash: input.supersedesPayloadHash ?? null
    },
    expiresAt: input.brief.expiresAt,
    capabilityRef: CAPABILITY_REF
  };
  return WebDevDesignPayloadSchema.parse({ ...withoutHash, contentHash: hash(withoutHash) });
}

export function webDevDesignPayloadRef(payload: Pick<WebDevDesignPayload, "locale" | "packageHash" | "contentHash">): string {
  return `state/ventures/webdev-signal/design-lab/payloads/${payload.packageHash.slice(0, 16)}-${payload.locale}-${payload.contentHash.slice(0, 16)}.json`;
}

export function webDevRenderReceiptRef(payload: Pick<WebDevDesignPayload, "locale" | "contentHash">): string {
  return `state/ventures/webdev-signal/design-lab/receipts/${payload.contentHash}-${payload.locale}.json`;
}

function capabilityEnvelope(payload: WebDevDesignPayload, payloadRef: string) {
  return BoundedRenderSummarySchema.parse({
    schemaVersion: "bounded-render-summary/1",
    sourceId: "webdev-signal",
    sourceArtifactRef: payloadRef,
    locale: payload.locale,
    title: payload.panels[0]!.heading,
    points: payload.panels.map((panel) => panel.heading),
    approvalRef: payload.packageRef,
    contentHash: payload.contentHash
  });
}

export async function authorizeWebDevDesignPayload(
  payloadInput: unknown,
  payloadRef: string,
  options: { configRoot?: string } = {}
) {
  const parsed = WebDevDesignPayloadSchema.safeParse(payloadInput);
  if (!parsed.success) return { allowed: false as const, reason: "webdev-design-payload/1 is malformed" };
  const payload = parsed.data;
  if (payload.contentHash !== hash(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "contentHash")))) {
    return { allowed: false as const, reason: "payload hash does not match immutable content" };
  }
  const envelope = BoundedRenderSummarySchema.safeParse({
    schemaVersion: "bounded-render-summary/1",
    sourceId: "webdev-signal",
    sourceArtifactRef: payloadRef,
    locale: payload.locale,
    title: payload.panels[0]!.heading,
    points: payload.panels.map((panel) => panel.heading),
    approvalRef: payload.packageRef,
    contentHash: payload.contentHash
  });
  if (!envelope.success) return { allowed: false as const, reason: "bounded-render-summary/1 envelope is malformed" };
  const resolution = await resolveWebDevSignalOutput({
    target: "design-lab",
    capability: "bounded-render-summary",
    schemaVersion: "bounded-render-summary/1"
  }, options);
  return resolution.decision === "allowed"
    ? { allowed: true as const, payload, envelope: capabilityEnvelope(payload, payloadRef), resolution }
    : { allowed: false as const, reason: resolution.reason };
}

function statusLabel(status: WebDevSignalVisualStatus, locale: "cs" | "en"): string {
  const labels = {
    cs: { stable: "STABILNÍ", preview: "NÁHLED", security: "BEZPEČNOST", breaking: "NEKOMPATIBILNÍ", deprecated: "UKONČOVANÉ" },
    en: { stable: "STABLE", preview: "PREVIEW", security: "SECURITY", breaking: "BREAKING", deprecated: "DEPRECATED" }
  } as const;
  return labels[locale][status];
}

export interface WebDevRenderedDesign {
  payload: WebDevDesignPayload;
  payloadRef: string;
  receipt: WebDevRenderReceipt;
  receiptRef: string;
  assets: Array<{ ref: string; png: Buffer }>;
}

/** Render through Carousel Studio only; a failed fit is recorded as held, never rewritten. */
export async function renderWebDevSignalDesign(input: {
  payload: unknown;
  payloadRef: string;
  startedAt: string;
  completedAt: string;
  configRoot?: string;
  existingReceipt?: WebDevRenderReceipt | null;
  existingReceiptRef?: string | null;
}): Promise<WebDevRenderedDesign> {
  const authorization = await authorizeWebDevDesignPayload(input.payload, input.payloadRef, { configRoot: input.configRoot });
  if (!authorization.allowed) throw new Error(`Design Lab capability denied: ${authorization.reason}`);
  const payload = authorization.payload;
  const template = webDevSignalTemplate(payload.panels.length);
  const brand = CAROUSEL_BRANDS["webdev-signal"];
  const cacheKey = hash({
    payloadHash: payload.contentHash,
    template: `${template.id}@${template.version}`,
    brand: `${brand.id}@${BRAND_VERSION}`,
    renderer: `@boardlessai/carousel-studio@${RENDERER_VERSION}`,
    fonts: FONT_SET_VERSION,
    format: "instagram-portrait"
  });
  const receiptRef = webDevRenderReceiptRef(payload);
  if (input.existingReceipt?.outcome === "success" && input.existingReceipt.cache.key === cacheKey) {
    return {
      payload,
      payloadRef: input.payloadRef,
      receiptRef,
      receipt: WebDevRenderReceiptSchema.parse({
        ...input.existingReceipt,
        cache: { key: cacheKey, status: "reused", reusedReceiptRef: input.existingReceiptRef ?? receiptRef },
        export: { startedAt: input.startedAt, completedAt: input.completedAt, durationMs: 0 }
      }),
      assets: []
    };
  }

  const identifiers = payload.identifiers.map((identifier) => identifier.value);
  const projectLine = [payload.project, ...identifiers].join(" · ");
  const sourceLabel = payload.sources[0]!.label;
  const strings: Record<string, string> = {};
  payload.panels.forEach((panel, index) => {
    strings[webDevSignalSlot(index, "locale")] = payload.edition;
    strings[webDevSignalSlot(index, "status")] = statusLabel(payload.status, payload.locale);
    strings[webDevSignalSlot(index, "project")] = projectLine;
    strings[webDevSignalSlot(index, "heading")] = panel.heading;
    strings[webDevSignalSlot(index, "body")] = panel.body;
    strings[webDevSignalSlot(index, "footer")] = `${String(index + 1).padStart(2, "0")} / ${String(payload.panels.length).padStart(2, "0")} · ${panel.semantics.includes("source") ? sourceLabel : "OFFICIAL CHANGE RECORD"}`;
  });
  const carouselPayload: CarouselPayload = {
    locale: payload.locale,
    strings,
    variant: webDevSignalVariant(payload.status)
  };
  const templateChecks = validateTemplateForBrand(template, brand, "instagram-portrait");
  const rendered = await renderCarouselPng({ template, brand, payload: carouselPayload, format: "instagram-portrait" });
  const fitFailures = rendered.flatMap((slide) => slide.truncatedSlots);
  const exactIdentifiers = identifiers.every((identifier) => projectLine.includes(identifier));
  const sourcePlacement = payload.panels.at(-1)?.semantics.includes("source") === true
    && payload.panels.at(-1)!.sourceRefs.every((ref) => payload.sources.some((source) => source.url === ref));
  const checks = {
    schema: "pass" as const,
    capability: "pass" as const,
    textFit: fitFailures.length === 0 ? "pass" as const : "fail" as const,
    contrast: templateChecks.every((check) => check.id !== "contrast" || check.status === "pass") ? "pass" as const : "fail" as const,
    statusNonColor: Object.values(strings).includes(statusLabel(payload.status, payload.locale)) ? "pass" as const : "fail" as const,
    sourcePlacement: sourcePlacement ? "pass" as const : "fail" as const,
    altTextSemantic: payload.altTextSemantic.length > 0 ? "pass" as const : "fail" as const,
    exactIdentifiers: exactIdentifiers ? "pass" as const : "fail" as const
  };
  const failed = Object.entries(checks).filter(([, result]) => result === "fail").map(([name]) => name);
  const assets = rendered.map((slide, index) => ({
    ref: `state/ventures/webdev-signal/design-lab/assets/${payload.contentHash}/${payload.locale}/${String(index + 1).padStart(2, "0")}.png`,
    png: slide.png
  }));
  const durationMs = Math.max(0, Date.parse(input.completedAt) - Date.parse(input.startedAt));
  const receipt = WebDevRenderReceiptSchema.parse({
    schemaVersion: "webdev-render-receipt/1",
    payloadRef: input.payloadRef,
    payloadHash: payload.contentHash,
    packageRef: payload.packageRef,
    packageHash: payload.packageHash,
    locale: payload.locale,
    renderer: {
      package: "@boardlessai/carousel-studio",
      version: RENDERER_VERSION,
      templateId: template.id,
      templateVersion: template.version,
      brandId: brand.id,
      brandVersion: BRAND_VERSION,
      fontSetVersion: FONT_SET_VERSION
    },
    format: "instagram-portrait",
    dimensions: { width: 1080, height: 1350 },
    outputs: rendered.map((slide, index) => ({
      panelId: payload.panels[index]!.id,
      assetRef: assets[index]!.ref,
      svgHash: slide.svgHash,
      pngHash: slide.pngHash
    })),
    panelCount: payload.panels.length,
    checks,
    cache: { key: cacheKey, status: "new", reusedReceiptRef: null },
    export: { startedAt: input.startedAt, completedAt: input.completedAt, durationMs },
    outcome: failed.length === 0 ? "success" : "held",
    reason: failed.length === 0 ? null : `${failed.join(", ")}${fitFailures.length ? `: ${fitFailures.join(", ")}` : ""}`,
    correctionSequence: payload.correction.sequence,
    supersededReceiptRef: null,
    providerCostUsd: 0
  });
  return { payload, payloadRef: input.payloadRef, receipt, receiptRef, assets };
}

export async function persistWebDevRenderedDesign(root: string, design: WebDevRenderedDesign): Promise<void> {
  const relative = (ref: string) => ref.replace(/^state\//u, "");
  await atomicWriteJson(root, relative(design.payloadRef), design.payload);
  for (const asset of design.assets) await atomicWriteBuffer(root, relative(asset.ref), asset.png);
  await atomicWriteJson(root, relative(design.receiptRef), design.receipt);
}

export async function readWebDevRenderReceipt(root: string, receiptRef: string): Promise<WebDevRenderReceipt | null> {
  const raw = await readJson<unknown | null>(root, receiptRef.replace(/^state\//u, ""), null);
  const parsed = WebDevRenderReceiptSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
