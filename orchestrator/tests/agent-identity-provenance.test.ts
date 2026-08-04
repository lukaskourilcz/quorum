import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  basePromptHash,
  roleMotif,
  sharedPromptHash,
  verifyIdentityProvenance,
  type IdentityManifest,
  type IdentityPrompts,
  type RegistryVisual
} from "../src/brand/identity-provenance.js";
import { loadAgentRegistry } from "../src/org/registry.js";
import { repoRoot } from "../src/paths.js";

const identityRoot = path.join(repoRoot, "state", "agent-identities");

async function loadIdentity(): Promise<{
  manifest: IdentityManifest;
  prompts: IdentityPrompts;
  visuals: Map<string, RegistryVisual>;
}> {
  const manifest = JSON.parse(
    await readFile(path.join(identityRoot, "manifest.json"), "utf8")
  ) as IdentityManifest;
  const prompts = JSON.parse(
    await readFile(path.join(identityRoot, "prompts.json"), "utf8")
  ) as IdentityPrompts;
  const registry = await loadAgentRegistry();
  const visuals = new Map<string, RegistryVisual>(
    registry.agents.map((agent) => [
      agent.id,
      { motif: agent.visual.motif, avatarAlt: agent.visual.avatarAlt }
    ])
  );
  return { manifest, prompts, visuals };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("agent identity provenance", () => {
  it("re-derives every recorded prompt hash from the prompt text", async () => {
    const { manifest, prompts, visuals } = await loadIdentity();

    expect(sharedPromptHash(prompts)).toBe(manifest.prompts.sharedPromptSha256);
    for (const asset of manifest.assets) {
      expect(asset.basePromptHash ?? asset.promptHash).toBe(
        basePromptHash(prompts, asset.agentId)
      );
    }

    expect(verifyIdentityProvenance(manifest, prompts, visuals)).toEqual([]);
  });

  it("rejects an alt text edited on only one side of the record", async () => {
    const { manifest, prompts, visuals } = await loadIdentity();
    const edited = new Map(visuals);
    const hacek = edited.get("HACEK")!;
    edited.set("HACEK", {
      ...hacek,
      avatarAlt: "Abstract non-human portrait of HACEK with a Czech register and copy floor mark"
    });

    const problems = verifyIdentityProvenance(manifest, prompts, edited);
    expect(problems.some((problem) => problem.includes("alt text disagrees"))).toBe(true);
  });

  it("rejects a role prompt rewritten without regenerating the portrait", async () => {
    const { manifest, prompts, visuals } = await loadIdentity();
    const edited = clone(prompts);
    edited.roles.HACEK =
      "Czech Language Editor. Motif: register gauge and copy floor rule. Responsibility: Czech register, copy floor and no writing call.";

    const problems = verifyIdentityProvenance(manifest, edited, visuals);
    expect(
      problems.some((problem) =>
        problem.includes("HACEK role prompt changed without a regenerated portrait")
      )
    ).toBe(true);
  });

  it("rejects a coordinated rewrite of every description while the picture stays put", async () => {
    // The failure this guard exists for: the words are moved to the agent's real
    // role on all sides at once, so every same-value check still passes, and the
    // published picture is left describing a job HACEK no longer has.
    const { manifest, prompts, visuals } = await loadIdentity();
    const newMotif = "register gauge and copy floor rule";
    const newAlt = `Abstract non-human portrait of HACEK with a ${newMotif}`;

    const editedManifest = clone(manifest);
    const editedPrompts = clone(prompts);
    const editedVisuals = new Map(visuals);

    const asset = editedManifest.assets.find((candidate) => candidate.agentId === "HACEK")!;
    asset.altText = newAlt;
    editedPrompts.roles.HACEK = `Czech Language Editor. Motif: ${newMotif}. Responsibility: native Czech register and copy floor.`;
    asset.promptHash = basePromptHash(editedPrompts, "HACEK");
    editedVisuals.set("HACEK", { motif: newMotif, avatarAlt: newAlt });

    const problems = verifyIdentityProvenance(editedManifest, editedPrompts, editedVisuals);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((problem) => problem.includes("pending regeneration"))).toBe(true);
  });

  it("records HACEK as pending regeneration with the motif the picture actually shows", async () => {
    const { manifest, prompts, visuals } = await loadIdentity();
    const pending = manifest.pendingRegeneration ?? [];
    const hacek = pending.find((entry) => entry.agentId === "HACEK");

    expect(hacek).toBeDefined();
    expect(roleMotif(prompts.roles.HACEK ?? "")).toBe(hacek!.renderedMotif);
    expect(visuals.get("HACEK")!.avatarAlt).toContain("paired translation pages");
  });
});
