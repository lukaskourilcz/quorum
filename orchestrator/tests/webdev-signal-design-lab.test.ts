import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  WebDevCandidateSchema,
  WebDevDesignPayloadSchema,
  WebDevEditionPackageSchema,
  WebDevRenderReceiptSchema,
  type WebDevEditionPackage
} from "../src/contracts/webdev-signal.js";
import { buildWebDevEvidenceBrief } from "../src/ventures/webdev-signal/editor/brief.js";
import { createDeterministicWebDevPackages, type WebDevSocialContentLimits } from "../src/ventures/webdev-signal/editor/packages.js";
import {
  authorizeWebDevDesignPayload,
  createWebDevDesignPayload,
  persistWebDevRenderedDesign,
  readWebDevRenderReceipt,
  renderWebDevSignalDesign,
  webDevDesignPayloadRef
} from "../src/ventures/webdev-signal/design-lab.js";
import { decideWebDevEdition } from "../src/ventures/webdev-signal/selection/decision.js";
import { loadWebDevSelectionConfig } from "../src/ventures/webdev-signal/selection/config.js";
import candidateFixture from "../../contracts/fixtures/webdev-candidate.valid.json" with { type: "json" };

const NOW = "2026-08-28T08:00:00.000Z";
const DONE = "2026-08-28T08:00:00.250Z";
const LIMITS: WebDevSocialContentLimits = {
  threadsPrimaryMaxChars: 500,
  threadsContinuationMaxItems: 1,
  threadsContinuationMaxChars: 500,
  instagramCaptionMaxChars: 2_200,
  instagramPanelsMin: 4,
  instagramPanelsMax: 6
};
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function approve(pack: WebDevEditionPackage): WebDevEditionPackage {
  const { contentHash: _contentHash, ...withoutHash } = pack;
  const accepted = { ...withoutHash, status: "approved" as const, heldReason: null };
  return WebDevEditionPackageSchema.parse({ ...accepted, contentHash: digest(accepted) });
}

async function fixture() {
  const candidate = WebDevCandidateSchema.parse(candidateFixture);
  const decided = decideWebDevEdition({ candidates: [candidate], pragueDate: "2026-08-28", now: NOW, config: await loadWebDevSelectionConfig() });
  const record = decided.records[0]!;
  const brief = buildWebDevEvidenceBrief({ record, selection: decided.selection, selectionRef: "state/ventures/webdev-signal/selections/2026-08-28.json" });
  const packages = createDeterministicWebDevPackages({ brief, briefRef: "state/ventures/webdev-signal/briefs/2026-08-28.json", record, limits: LIMITS });
  return { record, brief, packages };
}

describe("WebDev Signal bounded Design Lab handoff", () => {
  it("maps approved Czech and English packages without changing their accepted panel text", async () => {
    const { record, brief, packages } = await fixture();
    for (const edition of [approve(packages.cs), approve(packages.en)]) {
      const payload = createWebDevDesignPayload({ edition, editionRef: `state/ventures/webdev-signal/packages/${edition.locale}.json`, brief, record });
      expect(WebDevDesignPayloadSchema.parse(payload)).toMatchObject({
        schemaVersion: "webdev-design-payload/1",
        edition: edition.locale === "cs" ? "CZ" : "EN",
        status: "security",
        capabilityRef: "webdev-signal-to-design-lab:bounded-render-summary:bounded-render-summary/1"
      });
      expect(payload.panels.map(({ heading, body }) => ({ heading, body }))).toEqual(edition.instagramPanels.map(({ heading, body }) => ({ heading, body })));
      expect(payload.sources.map(({ url }) => url)).toEqual(edition.sourceAttribution.map(({ url }) => url));
      expect(JSON.stringify(payload)).not.toMatch(/sourceBody|credential|providerToken|publishAuthorized/u);
      const authorized = await authorizeWebDevDesignPayload(payload, webDevDesignPayloadRef(payload));
      expect(authorized).toMatchObject({ allowed: true, envelope: { schemaVersion: "bounded-render-summary/1", sourceId: "webdev-signal" } });
    }
  });

  it("preserves real 4, 5 and 6 panel semantics, including an honest no-action state", async () => {
    const { record, brief, packages } = await fixture();
    const six = approve(packages.en);
    const five = approve(createDeterministicWebDevPackages({ brief: { ...brief, uncertainty: [] }, briefRef: "brief:five", record, limits: LIMITS }).en);
    const four = approve(createDeterministicWebDevPackages({
      brief: { ...brief, uncertainty: [], safeActions: [] }, briefRef: "brief:four", record: { ...record, safeActions: [] }, limits: LIMITS
    }).en);
    expect([four, five, six].map((edition) => edition.instagramPanels.length)).toEqual([4, 5, 6]);
    expect(four.instagramPanels[1]).toMatchObject({ role: "change-impact" });
    expect(four.instagramPanels[2]?.body).toContain("no additional action");
    for (const edition of [four, five, six]) {
      const payload = createWebDevDesignPayload({ edition, editionRef: `state/ventures/webdev-signal/packages/${edition.instagramPanels.length}.json`, brief, record });
      const semantics = new Set(payload.panels.flatMap((panel) => panel.semantics));
      expect(semantics).toEqual(new Set(["lead", "change", "impact", "action", "source", ...(edition.instagramPanels.length === 6 ? ["detail"] : [])]));
    }
  });

  it("renders deterministic reusable assets and records every gate at zero provider cost", async () => {
    const { record, brief, packages } = await fixture();
    const edition = approve(packages.cs);
    const payload = createWebDevDesignPayload({ edition, editionRef: "state/ventures/webdev-signal/packages/cs.json", brief, record });
    const payloadRef = webDevDesignPayloadRef(payload);
    const first = await renderWebDevSignalDesign({ payload, payloadRef, startedAt: NOW, completedAt: DONE });
    expect(first.receipt).toMatchObject({
      schemaVersion: "webdev-render-receipt/1",
      outcome: "success",
      locale: "cs",
      format: "instagram-portrait",
      dimensions: { width: 1080, height: 1350 },
      checks: { textFit: "pass", contrast: "pass", statusNonColor: "pass", sourcePlacement: "pass", exactIdentifiers: "pass" },
      cache: { status: "new" },
      providerCostUsd: 0
    });
    expect(first.assets).toHaveLength(payload.panels.length);
    expect(first.receipt.outputs.map(({ pngHash }) => pngHash)).toEqual(first.assets.map(({ png }) => createHash("sha256").update(png).digest("hex")));
    const reused = await renderWebDevSignalDesign({
      payload,
      payloadRef,
      startedAt: DONE,
      completedAt: DONE,
      existingReceipt: first.receipt,
      existingReceiptRef: first.receiptRef
    });
    expect(reused.assets).toEqual([]);
    expect(reused.receipt.cache).toMatchObject({ status: "reused", reusedReceiptRef: first.receiptRef });
    expect(reused.receipt.outputs).toEqual(first.receipt.outputs);
  }, 20_000);

  it("holds overflow in one locale without rewriting it or corrupting the other", async () => {
    const { record, brief, packages } = await fixture();
    const normal = approve(packages.en);
    const poisonedBase = structuredClone(packages.cs);
    poisonedBase.instagramPanels[1]!.body = "dlouhý obsah ".repeat(38).trim();
    const overflow = approve(poisonedBase);
    const cs = createWebDevDesignPayload({ edition: overflow, editionRef: "state/ventures/webdev-signal/packages/cs-overflow.json", brief, record });
    const en = createWebDevDesignPayload({ edition: normal, editionRef: "state/ventures/webdev-signal/packages/en.json", brief, record });
    const [held, success] = await Promise.all([
      renderWebDevSignalDesign({ payload: cs, payloadRef: webDevDesignPayloadRef(cs), startedAt: NOW, completedAt: DONE }),
      renderWebDevSignalDesign({ payload: en, payloadRef: webDevDesignPayloadRef(en), startedAt: NOW, completedAt: DONE })
    ]);
    expect(held.receipt).toMatchObject({ outcome: "held", checks: { textFit: "fail" } });
    expect(held.receipt.reason).toContain("panel-02-body");
    expect(held.payload.panels[1]!.body).toBe(overflow.instagramPanels[1]!.body);
    expect(success.receipt).toMatchObject({ outcome: "success", checks: { textFit: "pass" } });
  }, 20_000);

  it("denies malformed or unregistered capability input before any render", async () => {
    const { record, brief, packages } = await fixture();
    const edition = approve(packages.en);
    const payload = createWebDevDesignPayload({ edition, editionRef: "state/ventures/webdev-signal/packages/en.json", brief, record });
    expect(await authorizeWebDevDesignPayload({ ...payload, providerCredential: "poison" }, webDevDesignPayloadRef(payload))).toEqual({
      allowed: false,
      reason: "webdev-design-payload/1 is malformed"
    });
    expect((await authorizeWebDevDesignPayload(payload, webDevDesignPayloadRef(payload), { configRoot: "/unavailable" })).allowed).toBe(false);
  });

  it("persists immutable payload, assets and receipt, then reads the recorded receipt", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "webdev-design-lab-"));
    temporaryRoots.push(root);
    const { record, brief, packages } = await fixture();
    const edition = approve(packages.en);
    const payload = createWebDevDesignPayload({ edition, editionRef: "state/ventures/webdev-signal/packages/en.json", brief, record });
    const design = await renderWebDevSignalDesign({ payload, payloadRef: webDevDesignPayloadRef(payload), startedAt: NOW, completedAt: DONE });
    await persistWebDevRenderedDesign(root, design);
    expect(WebDevRenderReceiptSchema.parse(await readWebDevRenderReceipt(root, design.receiptRef))).toEqual(design.receipt);
  }, 20_000);
});
