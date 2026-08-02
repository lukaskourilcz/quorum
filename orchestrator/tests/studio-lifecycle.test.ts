import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_TEMPLATES } from "@boardlessai/carousel-studio";
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

  it("rejects social visuals without a known live template reference", () => {
    expect(() => LiveTemplateReferenceSchema.parse({ template_id: "unknown-layout", version: "1.0.0", content: { locale: "en", strings: { title: "No" } } })).toThrow(/Unknown carousel template/);
  });
});
