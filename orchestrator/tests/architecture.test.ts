import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgentAvatars } from "../src/brand/avatars.js";
import { loadAgentRegistry } from "../src/org/registry.js";
import { repoRoot } from "../src/paths.js";

const expectedSkills = [
  "agent-identity",
  "boardroom-routing",
  "brand-identity",
  "business-validation",
  "financial-operations",
  "organization-operations",
  "page-publishing",
  "safe-release",
  "social-operations",
  "stop-slop",
  "titty-tuesdays-brandbook"
] as const;

const stopSlopFiles = [
  "LICENSE",
  "SKILL.md",
  "UPSTREAM.md",
  "references/caught-up-registers.md",
  "references/examples.md",
  "references/phrases.md",
  "references/structures.md"
] as const;

const tittyTuesdaysBrandbookFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/platform-policy.md"
] as const;

const expectedPrompts = [
  "_shared.md",
  "angle.md",
  "audit.md",
  "channel-agent-template.md",
  "cohort.md",
  "corner.md",
  "digest.md",
  "forge.md",
  "founding.md",
  "frame.md",
  "funnel.md",
  "hacek.md",
  "herald.md",
  "incubator.md",
  "instagram.md",
  "keeper.md",
  "ledger.md",
  "lens.md",
  "palate.md",
  "people.md",
  "pulse.md",
  "quill.md",
  "radar.md",
  "relay.md",
  "retro.md",
  "scene.md",
  "scout.md",
  "scribe.md",
  "sigma.md",
  "sonar.md",
  "spark.md",
  "spotter.md",
  "stet.md",
  "stunt.md",
  "tape.md",
  "threads.md",
  "vault.md",
  "vig.md",
  "vize.md"
] as const;

async function directoryNames(directory: string): Promise<string[]> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("agent architecture", () => {
  it("keeps the ten Claude and Codex skills byte-identical", async () => {
    const claudeRoot = path.join(repoRoot, ".claude", "skills");
    const codexRoot = path.join(repoRoot, ".agents", "skills");
    const claudeSkills = await directoryNames(claudeRoot);
    const codexSkills = await directoryNames(codexRoot);

    expect(claudeSkills).toEqual(expect.arrayContaining([...expectedSkills]));
    expect(codexSkills).toEqual(expectedSkills);

    for (const skill of expectedSkills) {
      const claudeBytes = await readFile(path.join(claudeRoot, skill, "SKILL.md"));
      const codexBytes = await readFile(path.join(codexRoot, skill, "SKILL.md"));
      expect(codexBytes.equals(claudeBytes), `${skill} mirror differs`).toBe(true);
    }
    for (const file of stopSlopFiles) {
      const claudeBytes = await readFile(path.join(claudeRoot, "stop-slop", file));
      const codexBytes = await readFile(path.join(codexRoot, "stop-slop", file));
      expect(codexBytes.equals(claudeBytes), `stop-slop/${file} mirror differs`).toBe(true);
    }
    for (const file of tittyTuesdaysBrandbookFiles) {
      const claudeBytes = await readFile(path.join(claudeRoot, "titty-tuesdays-brandbook", file));
      const codexBytes = await readFile(path.join(codexRoot, "titty-tuesdays-brandbook", file));
      expect(codexBytes.equals(claudeBytes), `titty-tuesdays-brandbook/${file} mirror differs`).toBe(true);
    }
  });

  it("ships every council and specialist prompt", async () => {
    const promptNames = (await readdir(path.join(repoRoot, "orchestrator", "prompts")))
      .filter((name) => name.endsWith(".md"))
      .sort();

    expect(promptNames).toEqual(expectedPrompts);
    for (const name of promptNames) {
      const prompt = await readFile(
        path.join(repoRoot, "orchestrator", "prompts", name),
        "utf8"
      );
      expect(prompt.trim().length, `${name} is empty`).toBeGreaterThan(80);
    }
  });

  it("keeps registry capabilities aligned with deterministic routing", async () => {
    const registry = await loadAgentRegistry();
    const routing = JSON.parse(
      await readFile(path.join(repoRoot, "config", "agent-routing.json"), "utf8")
    ) as {
      agents: Record<string, { capabilities: string[]; status: string }>;
    };

    expect(Object.keys(routing.agents).sort()).toEqual(
      registry.agents.map((agent) => agent.id).sort()
    );
    for (const agent of registry.agents) {
      expect(routing.agents[agent.id]?.capabilities).toEqual(agent.capabilityTags);
      expect(routing.agents[agent.id]?.status).toBe(agent.status);
    }
  });

  it("matches the identity manifest to optimized public assets", async () => {
    const registry = await loadAgentRegistry();
    const checks = await validateAgentAvatars(registry);
    const manifest = JSON.parse(
      await readFile(
        path.join(repoRoot, "state", "agent-identities", "manifest.json"),
        "utf8"
      )
    ) as {
      anchor: {
        path: string;
        sha256: string;
        width: number;
        height: number;
      };
      budget: {
        maxSetUsd: number;
        apiEquivalentTotalEstimateUsd: number;
        actualProjectApiUsd: number | null;
        caughtUpExtension: {
          maxUsd: number;
          apiEquivalentTotalEstimateUsd: number;
        };
        portfolioExtension: {
          maxUsd: number;
          apiEquivalentTotalEstimateUsd: number;
        };
      };
      assets: Array<{
        agentId: string;
        publicPath: string;
        sha256: string;
        width: number;
        height: number;
        qa: string;
      }>;
    };

    expect(manifest.assets).toHaveLength(27);
    expect(
      manifest.budget.caughtUpExtension.apiEquivalentTotalEstimateUsd
    ).toBeLessThanOrEqual(manifest.budget.caughtUpExtension.maxUsd);
    expect(manifest.budget.caughtUpExtension.maxUsd).toBeLessThanOrEqual(
      manifest.budget.maxSetUsd
    );
    expect(
      manifest.budget.portfolioExtension.apiEquivalentTotalEstimateUsd
    ).toBeLessThanOrEqual(manifest.budget.portfolioExtension.maxUsd);
    expect(manifest.budget.actualProjectApiUsd).toBeNull();
    expect(manifest.anchor.path.startsWith("site/public/")).toBe(false);
    const anchorBytes = await readFile(path.join(repoRoot, manifest.anchor.path));
    expect(createHash("sha256").update(anchorBytes).digest("hex")).toBe(
      manifest.anchor.sha256
    );
    expect(manifest.anchor.width).toBe(1024);
    expect(manifest.anchor.height).toBe(1024);

    for (const check of checks) {
      const asset = manifest.assets.find((candidate) => candidate.agentId === check.agentId);
      expect(asset?.publicPath).toBe(check.path);
      expect(asset?.sha256).toBe(check.sha256);
      expect(asset?.width).toBe(1024);
      expect(asset?.height).toBe(1024);
      expect(asset?.qa.startsWith("pass")).toBe(true);
    }
  });
});
