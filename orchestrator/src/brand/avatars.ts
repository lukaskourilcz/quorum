import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { repoRoot } from "../paths.js";
import type { AgentRegistry } from "../org/registry.js";

const MAX_AVATAR_BYTES = 512 * 1024;
const EXPECTED_SIZE = 1024;

export interface AvatarCheck {
  agentId: string;
  path: string;
  bytes: number;
  width: number;
  height: number;
  format: string;
  sha256: string;
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

export async function validateAgentAvatars(
  registry: AgentRegistry,
  publicRoot = path.join(repoRoot, "site", "public")
): Promise<AvatarCheck[]> {
  const avatarDirectory = path.join(publicRoot, "agents");
  const expectedNames = registry.agents.map((agent) => `${agent.slug}.webp`).sort();
  const actualNames = (await readdir(avatarDirectory))
    .filter((name) => name.endsWith(".webp"))
    .sort();

  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `avatar set mismatch: expected ${expectedNames.join(", ")}, received ${actualNames.join(", ")}`
    );
  }

  const checks = await Promise.all(
    registry.agents.map(async (agent): Promise<AvatarCheck> => {
      const relativePath = agent.visual.avatar.replace(/^\//, "");
      const absolutePath = path.join(publicRoot, relativePath);
      const bytes = await readFile(absolutePath);

      if (!isWebp(bytes)) {
        throw new Error(`${relativePath} does not have WebP magic bytes`);
      }
      if (bytes.byteLength > MAX_AVATAR_BYTES) {
        throw new Error(`${relativePath} exceeds ${MAX_AVATAR_BYTES} bytes`);
      }

      const metadata = await sharp(bytes).metadata();
      if (
        metadata.format !== "webp" ||
        metadata.width !== EXPECTED_SIZE ||
        metadata.height !== EXPECTED_SIZE
      ) {
        throw new Error(
          `${relativePath} must be ${EXPECTED_SIZE}x${EXPECTED_SIZE} WebP, received ${metadata.width}x${metadata.height} ${metadata.format}`
        );
      }

      return {
        agentId: agent.id,
        path: agent.visual.avatar,
        bytes: bytes.byteLength,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        sha256: createHash("sha256").update(bytes).digest("hex")
      };
    })
  );

  if (new Set(checks.map((check) => check.sha256)).size !== checks.length) {
    throw new Error("duplicate avatar content hash");
  }

  return checks;
}
