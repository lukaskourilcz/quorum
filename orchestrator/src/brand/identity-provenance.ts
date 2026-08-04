import { createHash } from "node:crypto";

/**
 * Provenance checks for the agent portrait set.
 *
 * `avatars.ts` already proves that every published `.webp` is the exact byte
 * sequence the manifest records. That says nothing about the *words*: the role
 * prompt that produced the picture, the manifest alt text, and the registry
 * motif and alt text can all be rewritten while the picture stays put. This
 * module closes that gap by re-deriving the prompt hashes from the prompt text
 * and by requiring the human-readable descriptions to agree with each other.
 */

export interface IdentityPrompts {
  shared: string;
  negative: string;
  roles: Record<string, string>;
  repairPrompts?: Record<string, string>;
}

export interface IdentityAsset {
  agentId: string;
  altText: string;
  promptHash: string;
  basePromptHash?: string;
  repairs: number;
}

export interface PendingRegeneration {
  agentId: string;
  renderedMotif: string;
}

export interface IdentityManifest {
  prompts: { sharedPromptSha256: string };
  assets: IdentityAsset[];
  pendingRegeneration?: PendingRegeneration[];
}

export interface RegistryVisual {
  motif: string;
  avatarAlt: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Documented as `sha256(shared + newline + negative)` in the manifest. */
export function sharedPromptHash(prompts: IdentityPrompts): string {
  return sha256(`${prompts.shared}\n${prompts.negative}`);
}

/** Documented as `sha256(shared + newline + negative + newline + role)`. */
export function basePromptHash(prompts: IdentityPrompts, agentId: string): string {
  return sha256(`${prompts.shared}\n${prompts.negative}\n${prompts.roles[agentId]}`);
}

/**
 * The recorded set uses two spellings of "the hash covers the exact repair
 * suffix": SCRIBE and LENS hash the repair instruction alone, STET, VAULT and
 * PALATE hash the base prompt with the repair appended. Both pin the literal
 * repair text, so both are accepted; neither may equal the base hash, because a
 * repaired asset was produced by a prompt the base hash does not describe.
 */
export function repairPromptHashes(
  prompts: IdentityPrompts,
  agentId: string,
  repairPrompt: string
): string[] {
  return [
    sha256(repairPrompt),
    sha256(`${prompts.shared}\n${prompts.negative}\n${prompts.roles[agentId]}\n${repairPrompt}`)
  ];
}

/**
 * Reduce a motif label to comparable words. The registry writes motifs in a
 * short "a + b" form and the prompt writes them as "a and b", so the separator
 * is dropped on both sides; nothing else about the wording is relaxed.
 */
function normalizeMotif(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 0 && word !== "and")
    .join(" ");
}

/** Extract the `Motif: ... .` clause from a role prompt, if it has one. */
export function roleMotif(rolePrompt: string): string | null {
  const match = /Motif:\s*(.+?)\.\s+Responsibility:/.exec(rolePrompt);
  return match?.[1] ?? null;
}

/**
 * Returns a human-readable problem for every provenance breach found. An empty
 * array means the pictures, the prompts that made them and the words that
 * describe them are mutually consistent.
 */
export function verifyIdentityProvenance(
  manifest: IdentityManifest,
  prompts: IdentityPrompts,
  registryVisualById: Map<string, RegistryVisual>
): string[] {
  const problems: string[] = [];

  const recomputedShared = sharedPromptHash(prompts);
  if (recomputedShared !== manifest.prompts.sharedPromptSha256) {
    problems.push(
      `shared prompt hash drifted: manifest records ${manifest.prompts.sharedPromptSha256}, prompt text hashes to ${recomputedShared}`
    );
  }

  for (const asset of manifest.assets) {
    const { agentId } = asset;

    if (typeof prompts.roles[agentId] !== "string") {
      problems.push(`${agentId} has a manifest asset but no role prompt in prompts.json`);
      continue;
    }

    const recordedBase = asset.basePromptHash ?? asset.promptHash;
    const recomputedBase = basePromptHash(prompts, agentId);
    if (recordedBase !== recomputedBase) {
      problems.push(
        `${agentId} role prompt changed without a regenerated portrait: manifest records ${recordedBase}, prompt text hashes to ${recomputedBase}`
      );
    }

    if (asset.repairs > 0) {
      if (asset.basePromptHash === undefined) {
        problems.push(`${agentId} records ${asset.repairs} repair(s) but no basePromptHash`);
      }
      const repairPrompt = prompts.repairPrompts?.[agentId];
      if (typeof repairPrompt !== "string") {
        problems.push(`${agentId} records ${asset.repairs} repair(s) but no repair prompt text`);
      } else {
        if (asset.promptHash === asset.basePromptHash) {
          problems.push(`${agentId} repair promptHash is identical to its basePromptHash`);
        }
        if (!repairPromptHashes(prompts, agentId, repairPrompt).includes(asset.promptHash)) {
          problems.push(
            `${agentId} repair prompt changed without a regenerated portrait: ${asset.promptHash} does not derive from the recorded repair text`
          );
        }
      }
    } else if (asset.basePromptHash !== undefined) {
      problems.push(`${agentId} records a basePromptHash but zero repairs`);
    }

    const visual = registryVisualById.get(agentId);
    if (visual === undefined) {
      problems.push(`${agentId} has a manifest asset but no registry entry`);
      continue;
    }
    if (visual.avatarAlt !== asset.altText) {
      problems.push(
        `${agentId} alt text disagrees between registry and manifest: registry says "${visual.avatarAlt}", manifest says "${asset.altText}"`
      );
    }
  }

  for (const pending of manifest.pendingRegeneration ?? []) {
    const { agentId } = pending;
    const asset = manifest.assets.find((candidate) => candidate.agentId === agentId);
    if (asset === undefined) {
      problems.push(`pendingRegeneration names ${agentId}, which has no manifest asset`);
      continue;
    }

    const rolePrompt = prompts.roles[agentId];
    const promptMotif = typeof rolePrompt === "string" ? roleMotif(rolePrompt) : null;
    if (promptMotif === null) {
      problems.push(`pendingRegeneration for ${agentId} cannot be checked: role prompt states no motif`);
    } else if (normalizeMotif(promptMotif) !== normalizeMotif(pending.renderedMotif)) {
      problems.push(
        `${agentId} is pending regeneration, so its role prompt must still describe the picture on disk: prompt motif "${promptMotif}" no longer matches the rendered motif "${pending.renderedMotif}"`
      );
    }

    const visual = registryVisualById.get(agentId);
    if (visual !== undefined && normalizeMotif(visual.motif) !== normalizeMotif(pending.renderedMotif)) {
      problems.push(
        `${agentId} is pending regeneration, so its registry motif must still describe the picture on disk: registry motif "${visual.motif}" no longer matches the rendered motif "${pending.renderedMotif}"`
      );
    }
  }

  return problems;
}
