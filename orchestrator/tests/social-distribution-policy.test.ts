import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

async function text(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

describe("Social Distribution founding policy", () => {
  it("records current official platforms and every provider verdict without activating one", async () => {
    const [design, decision] = await Promise.all([
      text("docs/SOCIAL-DISTRIBUTION-DESIGN.md"),
      text("state/decisions/2026-08-27-social-distribution-operating-decision.md")
    ]);

    for (const evidence of [
      "postman.com/meta/instagram",
      "postman.com/meta/threads",
      "developers.facebook.com/docs/graph-api/changelog/version26.0",
      "buffer.com/api",
      "metricool.com/pricing",
      "n8n.io/pricing",
      "make.com/en/pricing",
      "ayrshare.com/pricing"
    ]) expect(design).toContain(evidence);
    for (const provider of ["Direct Meta", "Buffer", "Metricool", "n8n", "Make", "Ayrshare"]) {
      expect(design).toContain(provider);
      expect(decision).toMatch(new RegExp(provider, "iu"));
    }
    /*
     * Countersigned by the owner on 2026-08-30, which selects the connector posture and activates
     * nothing. The guard keeps asserting the part that matters and that the signature does not
     * touch: no provider is installed or paid for, and every external effect stays held. The
     * separate draft-only channel test below is what proves nothing can post.
     */
    expect(decision).toContain("Status: countersigned");
    expect(decision).toContain("Held by this decision: all external and live effects held.");
    expect(decision.replace(/\s+/gu, " ")).toContain("None is installed, connected, purchased, subscribed or activated by this decision.");
    expect(decision).toContain("costs $0 in new provider subscriptions");
    expect(design).toContain("SOCIAL-DISTRIBUTION-CONNECTION-001");
  });

  it("keeps both channels draft-only with posting scopes and no human activation", async () => {
    const registry = JSON.parse(await text("config/channels.json")) as {
      channels: Array<{ id: string; mode: string; enabledByHumanAt: string | null; approvedScopes: string[] }>;
    };

    expect(registry.channels.map((channel) => channel.id)).toEqual(["threads", "instagram"]);
    for (const channel of registry.channels) {
      expect(channel.mode).toBe("draft");
      expect(channel.enabledByHumanAt).toBeNull();
      expect(channel.approvedScopes.every((scope) => /(?:basic|content_publish)$/u.test(scope))).toBe(true);
      expect(channel.approvedScopes.join(" ")).not.toMatch(/manage_replies|read_replies|manage_comments|manage_messages|keyword_search|ads_management/iu);
    }
  });

  it("pins current capability inputs and permanent isolation instead of inventing portfolio edges", async () => {
    const map = JSON.parse(await text("config/venture-capabilities.json")) as {
      edges: Array<{ source: string; target: string; capability: string; dataSchemaVersion: string; decision: string }>;
      isolationRules: Array<{ id: string }>;
    };
    const allowedInputs = map.edges
      .filter((edge) => edge.target === "social-distribution" && edge.capability === "approved-publish-package" && edge.decision === "allowed")
      .map((edge) => [edge.source, edge.dataSchemaVersion]);

    expect(allowedInputs).toEqual([
      ["door-money", "approved-publish-package/1"],
      ["webdev-signal", "approved-publish-package/1"]
    ]);
    const isolation = new Set(map.isolationRules.map((rule) => rule.id));
    for (const id of [
      "booksofhistory-to-tehdejsi",
      "tehdejsi-to-booksofhistory",
      "personal-growth-no-portfolio",
      "kvorum-outbound-isolation",
      "door-money-outbound-isolation"
    ]) expect(isolation.has(id)).toBe(true);
    expect(map.edges.some((edge) => edge.source === "goviral" && edge.target === "social-distribution")).toBe(false);
  });

  it("keeps optional providers and engagement endpoints out of the production social runtime", async () => {
    const [meta, runner, activation, needed] = await Promise.all([
      text("orchestrator/src/social/meta.ts"),
      text("orchestrator/src/social/runner.ts"),
      text("orchestrator/src/social/activation.ts"),
      text("docs/NEEDED.md")
    ]);
    const runtime = `${meta}\n${runner}\n${activation}`;

    expect(meta).toContain("graph.threads.net");
    expect(meta).toContain("graph.facebook.com");
    expect(runtime).not.toMatch(/api\.buffer\.com|metricool\.com|api\.ayrshare\.com|hook\.us\d+\.make\.com/iu);
    expect(meta).not.toMatch(/keyword_search|threads_manage_replies|instagram_manage_comments|\/messages/iu);
    expect(runtime).not.toMatch(/PERSONAL_GROWTH_(?:THREADS|INSTAGRAM)|KVORUM_(?:THREADS|INSTAGRAM)/u);
    expect(needed.match(/SOCIAL-DISTRIBUTION-CONNECTION-001/gu)).toHaveLength(1);
  });
});
