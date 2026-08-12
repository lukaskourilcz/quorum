import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const BOOK_TEXT_CHARACTER_CAP = 600;
export const STYLE_EXEMPLAR_COUNT_CAP = 40;
export const STYLE_EXEMPLAR_CHARACTER_CAP = 280;

export interface DoorMoneyPublicArtifact {
  path: string;
  content: string;
}

export interface DoorMoneyBoundaryViolation {
  path: string;
  field: string;
  message: string;
}

const structuredExtensions = new Set([".json", ".jsonl"]);
const bannedPrivateSegments = new Set(["manuscript", "kb", "chunks", "embeddings"]);
const bannedSourceExtensions = new Set([".doc", ".docx", ".epub", ".mobi", ".pdf"]);

function characterCount(value: string): number {
  return [...value].length;
}

function isBookTextField(field: string): boolean {
  return /(?:excerpt|quotable|quote|(?:book|source|passage|manuscript|chunk)[_-]?text)/iu.test(field);
}

function privatePathReason(artifactPath: string): string | null {
  const normalized = artifactPath.replaceAll("\\", "/");
  const privateSegment = normalized.split("/").find((segment) =>
    bannedPrivateSegments.has(path.posix.parse(segment.toLowerCase()).name));
  if (privateSegment) return `${privateSegment} is private source material and cannot be committed`;
  if (bannedSourceExtensions.has(path.extname(normalized).toLowerCase())) {
    return "manuscript-like source files cannot be committed to Door Money state";
  }
  return null;
}

function walkStructuredArtifact(input: {
  artifactPath: string;
  value: unknown;
  at?: readonly (string | number)[];
  bookTextContext?: boolean;
  violations: DoorMoneyBoundaryViolation[];
}): void {
  const at = input.at ?? [];
  if (typeof input.value === "string") {
    if (input.bookTextContext && characterCount(input.value) > BOOK_TEXT_CHARACTER_CAP) {
      input.violations.push({
        path: input.artifactPath,
        field: at.join("."),
        message: `book text is ${characterCount(input.value)} characters; cap is ${BOOK_TEXT_CHARACTER_CAP}`
      });
    }
    return;
  }
  if (input.value === null || typeof input.value !== "object") return;

  if (Array.isArray(input.value)) {
    input.value.forEach((item, index) => walkStructuredArtifact({
      ...input,
      value: item,
      at: [...at, index]
    }));
    return;
  }

  for (const [field, value] of Object.entries(input.value)) {
    const fieldPath = [...at, field];
    if (field === "exemplarBank" && Array.isArray(value)) {
      if (value.length > STYLE_EXEMPLAR_COUNT_CAP) {
        input.violations.push({
          path: input.artifactPath,
          field: fieldPath.join("."),
          message: `exemplar bank has ${value.length} entries; cap is ${STYLE_EXEMPLAR_COUNT_CAP}`
        });
      }
      value.forEach((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
        const text = (entry as Record<string, unknown>).text;
        if (typeof text === "string" && characterCount(text) > STYLE_EXEMPLAR_CHARACTER_CAP) {
          input.violations.push({
            path: input.artifactPath,
            field: [...fieldPath, index, "text"].join("."),
            message: `style exemplar is ${characterCount(text)} characters; cap is ${STYLE_EXEMPLAR_CHARACTER_CAP}`
          });
        }
      });
    }
    if ((field === "embedding" || field === "embeddingVector") &&
        Array.isArray(value) && value.some((item) => typeof item === "number")) {
      input.violations.push({
        path: input.artifactPath,
        field: fieldPath.join("."),
        message: "embedding vectors belong only in the private store"
      });
    }
    walkStructuredArtifact({
      ...input,
      value,
      at: fieldPath,
      bookTextContext: input.bookTextContext || isBookTextField(field)
    });
  }
}

function parseStructuredArtifact(artifact: DoorMoneyPublicArtifact): unknown[] {
  if (path.extname(artifact.path).toLowerCase() === ".jsonl") {
    return artifact.content
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }
  return [JSON.parse(artifact.content) as unknown];
}

export function inspectDoorMoneyPublicArtifacts(
  artifacts: readonly DoorMoneyPublicArtifact[]
): DoorMoneyBoundaryViolation[] {
  const violations: DoorMoneyBoundaryViolation[] = [];
  for (const artifact of artifacts) {
    const normalized = artifact.path.replaceAll("\\", "/");
    const privateReason = privatePathReason(normalized);
    if (privateReason) {
      violations.push({
        path: artifact.path,
        field: "$path",
        message: privateReason
      });
      continue;
    }
    if (!structuredExtensions.has(path.extname(normalized).toLowerCase())) continue;

    try {
      for (const value of parseStructuredArtifact(artifact)) {
        walkStructuredArtifact({ artifactPath: artifact.path, value, violations });
      }
    } catch (error) {
      violations.push({
        path: artifact.path,
        field: "$parse",
        message: `structured artifact could not be inspected: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
  return violations;
}

/**
 * Load tracked and commit-eligible files without ever opening ignored private source material.
 * In CI the two sets are the same; locally this also protects a newly created state artifact
 * before its first commit.
 */
export async function loadDoorMoneyPublicArtifacts(repositoryRoot: string): Promise<DoorMoneyPublicArtifact[]> {
  const statePath = "state/ventures/door-money";
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", statePath],
    { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 }
  );
  const files = stdout.split("\0").filter(Boolean);
  return Promise.all(files.map(async (relativePath) => ({
    path: relativePath,
    // A path violation is reportable without opening the file. This matters locally: a private
    // source file must not become model-visible merely because someone removed an ignore rule.
    content: privatePathReason(relativePath)
      ? ""
      : await readFile(path.join(repositoryRoot, relativePath), "utf8")
  })));
}
