import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgentAvatars } from "../src/brand/avatars.js";
import { loadAgentRegistry } from "../src/org/registry.js";
import { repoRoot } from "../src/paths.js";

/**
 * Every skill that exists in both trees, in `readdir` order.
 *
 * The second block is vendored verbatim from coreyhaines31/marketingskills at
 * `7868cb9`, MIT. They are mirrored the same way the house skills are, and this test is
 * the reason a hand-edit in one tree cannot survive: the two copies are compared byte
 * for byte, file for file.
 */
const expectedSkills = [
  "agent-identity",
  "ai-seo",
  "boardroom-routing",
  "brand-identity",
  "business-validation",
  "content-strategy",
  "copywriting",
  "financial-operations",
  "marketing-ideas",
  "marketing-loops",
  "marketing-psychology",
  "organization-operations",
  "page-publishing",
  "product-marketing",
  "safe-release",
  "social",
  "social-operations",
  "stop-slop",
  "titty-tuesdays-brandbook"
] as const;

/** The vendored eight. Every file in each is compared, not just its SKILL.md. */
const vendoredMarketingSkills = [
  "ai-seo",
  "content-strategy",
  "copywriting",
  "marketing-ideas",
  "marketing-loops",
  "marketing-psychology",
  "product-marketing",
  "social"
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
  "canvas.md",
  "channel-agent-template.md",
  "chum.md",
  "cohort.md",
  "corner.md",
  "digest.md",
  "easel.md",
  "forge.md",
  "founding.md",
  "frame.md",
  "funnel.md",
  "goviral.md",
  "hacek.md",
  "herald.md",
  "instagram.md",
  "jab.md",
  "keeper.md",
  "kvorum/craft.md",
  "kvorum/tribun.md",
  "ledger.md",
  "lens.md",
  "magazine.md",
  "mako.md",
  "marketingshark/craft.md",
  "marketingshark/strategy.md",
  "mma.md",
  "motif.md",
  "operations.md",
  "palate.md",
  "people.md",
  "pivot.md",
  "pulse.md",
  "quill.md",
  "radar.md",
  "reach.md",
  "relay.md",
  "retro.md",
  "scene.md",
  "scout.md",
  "scribe.md",
  "sigma.md",
  "sonar.md",
  "spark.md",
  "split.md",
  "spotter.md",
  "stet.md",
  "studio.md",
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
  it("keeps the engineering contract byte-identical in both trees", async () => {
    // The same file in every repository this owner runs, and in both of this one's agent trees.
    // A rule that drifts between copies is two rules, and the copy a session happens to read
    // decides which one it follows.
    const canonical = await readFile(path.join(repoRoot, "docs", "ENGINEERING.md"));
    const mirror = await readFile(path.join(repoRoot, ".agents", "ENGINEERING.md"));
    expect(mirror.equals(canonical), ".agents/ENGINEERING.md differs from docs/ENGINEERING.md").toBe(true);

    // And the three files that are supposed to point at it rather than restate it.
    for (const pointer of ["CLAUDE.md", "AGENTS.md", "CONTRIBUTING.md"]) {
      const body = await readFile(path.join(repoRoot, pointer), "utf8");
      expect(body, `${pointer} does not point at the engineering contract`).toContain("ENGINEERING.md");
    }
  });

  it("keeps every mirrored Claude and Codex skill byte-identical", async () => {
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
    // Vendored skills carry references and evals, not just a SKILL.md, and every one of those
    // files is what an interactive session actually reads. Comparing only the entry point would
    // let a reference drift silently between the two trees.
    for (const skill of vendoredMarketingSkills) {
      const files = (await readdir(path.join(claudeRoot, skill), { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(path.relative(path.join(claudeRoot, skill), entry.parentPath), entry.name))
        .sort();
      expect(files.length, `${skill} vendored no files`).toBeGreaterThan(0);
      expect(files, `${skill} lost its upstream notice`).toContain("UPSTREAM.md");
      expect(files, `${skill} lost its MIT licence`).toContain("LICENSE");
      for (const file of files) {
        const claudeBytes = await readFile(path.join(claudeRoot, skill, file));
        const codexBytes = await readFile(path.join(codexRoot, skill, file));
        expect(codexBytes.equals(claudeBytes), `${skill}/${file} mirror differs`).toBe(true);
      }
    }
  });

  it("ships every council and specialist prompt", async () => {
    const promptRoot = path.join(repoRoot, "orchestrator", "prompts");
    const promptNames = (await readdir(promptRoot, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.relative(promptRoot, path.join(entry.parentPath, entry.name)))
      .sort();

    expect(promptNames).toEqual(expectedPrompts);
    for (const name of promptNames) {
      const prompt = await readFile(path.join(promptRoot, name), "utf8");
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

/**
 * The site does not import from the orchestrator package, so the two calendars each carry their
 * own copy of the delivery window. A copy that drifts is worse than no copy: the board would keep
 * calling a slot missed while the resolver could still open the room for it, which is the exact
 * failure the window was introduced to remove.
 */
describe("the site and the orchestrator agree on the meeting delivery window", () => {
  it("pins the site's grace to CRON_DELIVERY_WINDOW_HOURS minus CRON_LEAD_HOURS", async () => {
    const { CRON_DELIVERY_WINDOW_HOURS } = await import("../src/meetings/clock.js");
    const { CRON_LEAD_HOURS } = await import("../src/ventures/registry.js");
    const { SLOT_DELIVERY_GRACE_MS } = await import("../src/meetings/calendar.js");

    const source = await readFile(
      path.join(repoRoot, "site", "src", "lib", "calendar-feed-model.ts"),
      "utf8"
    );
    const expression = /export const SLOT_DELIVERY_GRACE_MINUTES = \((\d+) - (\d+)\) \* 60;/u.exec(source);
    expect(expression, "the site declares its grace as (window - lead) * 60").not.toBeNull();
    expect(Number(expression![1])).toBe(CRON_DELIVERY_WINDOW_HOURS);
    expect(Number(expression![2])).toBe(CRON_LEAD_HOURS);
    expect((CRON_DELIVERY_WINDOW_HOURS - CRON_LEAD_HOURS) * 60 * 60_000).toBe(SLOT_DELIVERY_GRACE_MS);
  });
});
