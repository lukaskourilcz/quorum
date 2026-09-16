import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LAYOUT_CHECKLIST_VERSION, SEED_TEMPLATES } from "@boardlessai/carousel-studio";
import { LiveTemplateReferenceSchema } from "../src/contracts/carousel-template.js";
import { processStudioContribution, StudioObservationSchema } from "../src/studio/lifecycle.js";

describe("Carousel Studio lifecycle", () => {
  it("rejects broad or forbidden inspiration sources", () => {
    const base = { id: "observation-layout", retrievedAt: "2026-08-02T10:00:00.000Z", appliesTo: ["caught-up"], principle: "A clear hierarchy gives the fact one visual job per frame.", originalityBoundary: "Keep the principle, but do not copy the source wording, colors or composition." };
    expect(() => StudioObservationSchema.parse({ ...base, sourceUrl: "https://pinterest.com/pin/123" })).toThrow(/Pinterest/);
    expect(() => StudioObservationSchema.parse({ ...base, sourceUrl: "http://example.com/post" })).toThrow(/HTTPS/);
  });

  it("keeps checked proposals draft without a live approval and never stores external bytes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "carousel-studio-"));
    const observation = { id: "observation-layout", sourceUrl: "https://example.com/article/layout", retrievedAt: "2026-08-02T10:00:00.000Z", appliesTo: ["caught-up"], principle: "A clear hierarchy gives the fact one visual job per frame.", originalityBoundary: "Keep the principle, but do not copy the source wording, colors or composition." };
    const seed = SEED_TEMPLATES[0]!;
    const proposal = { ...seed, id: "original-quote-study", name: "Original quote study", version: "1.0.0", status: "draft", citedObservationRefs: [observation.id] };
    const result = await processStudioContribution({ root, observations: [observation], templateProposal: proposal, allowedEvidenceRefs: [observation.sourceUrl], allowLive: false });
    expect(result.template?.status).toBe("draft");
    expect(result.checks.every((entry) => entry.checks.every((check) => check.status === "pass"))).toBe(true);
    const stored = await readFile(path.join(root, "ventures/carousel-studio/templates/original-quote-study/1.0.0.json"), "utf8");
    expect(stored).not.toContain("data:image");
  });

  /*
   * The gate the source issue asked for, on the stored-template path: a check list that passes is
   * arithmetic, and "reviewed" is a person. Both are required before a layout goes live, and the
   * checks artifact records which checklist version the person worked from.
   */
  it("refuses to publish an approved, fully passing template with no recorded owner review", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "carousel-studio-"));
    const observation = { id: "observation-layout", sourceUrl: "https://example.com/article/layout", retrievedAt: "2026-08-02T10:00:00.000Z", appliesTo: ["caught-up"], principle: "A clear hierarchy gives the fact one visual job per frame.", originalityBoundary: "Keep the principle, but do not copy the source wording, colors or composition." };
    const seed = SEED_TEMPLATES[0]!;
    const proposal = { ...seed, id: "unreviewed-layout", name: "Unreviewed layout", version: "1.0.0", status: "draft", citedObservationRefs: [observation.id] };
    const result = await processStudioContribution({ root, observations: [observation], templateProposal: proposal, allowedEvidenceRefs: [observation.sourceUrl], allowLive: true });
    expect(result.checks.every((entry) => entry.checks.every((check) => check.status === "pass"))).toBe(true);
    expect(result.template?.status).toBe("draft");
    const receipt = JSON.parse(await readFile(path.join(root, "ventures/carousel-studio/templates/unreviewed-layout/1.0.0.checks.json"), "utf8")) as { review: unknown; checklistVersion: string };
    expect(receipt.review).toBeNull();
    expect(receipt.checklistVersion).toBe(LAYOUT_CHECKLIST_VERSION);
  });

  it("publishes one that carries the owner's review, and records it beside the checks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "carousel-studio-"));
    const observation = { id: "observation-layout", sourceUrl: "https://example.com/article/layout", retrievedAt: "2026-08-02T10:00:00.000Z", appliesTo: ["caught-up"], principle: "A clear hierarchy gives the fact one visual job per frame.", originalityBoundary: "Keep the principle, but do not copy the source wording, colors or composition." };
    const seed = SEED_TEMPLATES[0]!;
    const proposal = { ...seed, id: "reviewed-layout", name: "Reviewed layout", version: "1.0.0", status: "draft", citedObservationRefs: [observation.id] };
    const review = { reviewer: "owner", reviewedAt: "2026-09-16T09:00:00.000Z", checklistVersion: LAYOUT_CHECKLIST_VERSION, note: "Read at 1080 by 1350 on a phone; the cover line holds." };
    const result = await processStudioContribution({ root, observations: [observation], templateProposal: proposal, allowedEvidenceRefs: [observation.sourceUrl], allowLive: true, review });
    expect(result.template?.status).toBe("live");
    const receipt = JSON.parse(await readFile(path.join(root, "ventures/carousel-studio/templates/reviewed-layout/1.0.0.checks.json"), "utf8")) as { review: typeof review };
    expect(receipt.review).toEqual(review);
  });

  it("refuses a review signed by anything but the owner, or against another checklist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "carousel-studio-"));
    const observation = { id: "observation-layout", sourceUrl: "https://example.com/article/layout", retrievedAt: "2026-08-02T10:00:00.000Z", appliesTo: ["caught-up"], principle: "A clear hierarchy gives the fact one visual job per frame.", originalityBoundary: "Keep the principle, but do not copy the source wording, colors or composition." };
    const seed = SEED_TEMPLATES[0]!;
    const proposal = { ...seed, id: "agent-signed-layout", name: "Agent signed layout", version: "1.0.0", status: "draft", citedObservationRefs: [observation.id] };
    const call = (review: unknown) => processStudioContribution({ root, observations: [observation], templateProposal: proposal, allowedEvidenceRefs: [observation.sourceUrl], allowLive: true, review });
    await expect(call({ reviewer: "EASEL", reviewedAt: "2026-09-16T09:00:00.000Z", checklistVersion: LAYOUT_CHECKLIST_VERSION, note: "An agent may not sign its own layout off." })).rejects.toThrow();
    await expect(call({ reviewer: "owner", reviewedAt: "2026-09-16T09:00:00.000Z", checklistVersion: "layout-gate/0", note: "A checklist nobody wrote is not a checklist." })).rejects.toThrow();
  });

  it("rejects social visuals without a known live template reference", () => {
    expect(() => LiveTemplateReferenceSchema.parse({ template_id: "unknown-layout", version: "1.0.0", content: { locale: "en", strings: { title: "No" } } })).toThrow(/Unknown carousel template/);
  });
});
