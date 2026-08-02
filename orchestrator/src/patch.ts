import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scanGeneratedCode } from "./security/generated-code.js";
import type { TaskType } from "./types.js";
import { withinRoot } from "./paths.js";

export const PatchOperationSchema = z.object({
  action: z.enum(["write", "append", "delete"]),
  path: z.string().min(1),
  content: z.string().optional()
});
export type PatchOperation = z.infer<typeof PatchOperationSchema>;

const TASK_ALLOWLIST: Readonly<Record<TaskType, readonly string[]>> = {
  // OPPORTUNITIES.json is the file the DISCOVERY gate scores. Research could previously
  // write only the markdown narrative beside it, so findings accumulated somewhere the
  // gate never read and founding could not happen without a human commit. Agents now
  // promote their own research into a scored candidate.
  //
  // This widens who may propose, not what passes. selectOpportunity still requires a real
  // score of 35/50, no dimension below 2, a reachable channel, a bounded first experiment,
  // one direct signal, and three independent non-fixture evidence sources — and
  // independence is now derived from the source host rather than a field the author sets,
  // so a candidate cannot be talked past the gate by the agent that wrote it.
  research: ["state/OPPORTUNITIES.md", "state/OPPORTUNITIES.json", "state/EVIDENCE.jsonl"],
  experiment: ["state/EXPERIMENTS.md", "site/src/content/"],
  page: [
    "site/src/app/",
    "site/src/components/",
    "site/src/content/",
    "site/src/lib/public-"
  ],
  feature: [
    "site/src/app/",
    "site/src/components/",
    "site/src/lib/public-",
    "site/src/features/"
  ],
  content: [
    "site/src/content/",
    "state/CONTENT_INVENTORY.json",
    "state/public/"
  ],
  brand: ["site/public/social/", "state/public/"],
  infra: [],
  biz: ["state/BUSINESS.md", "state/ROADMAP.md", "state/decisions/"],
  spend: ["state/INBOX.md"],
  source: [],
  channel: ["state/channel-agents/"],
  org_change: []
};

const ALWAYS_DENIED = [
  "orchestrator/",
  ".github/",
  ".claude/",
  ".agents/",
  "site/src/brand/",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "config/"
];

export class PatchValidationError extends Error {
  constructor(readonly findings: string[]) {
    super(findings.join("; "));
    this.name = "PatchValidationError";
  }
}

function repeatedlyDecode(value: string): string {
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        return decoded;
      }
      decoded = next;
    } catch {
      return decoded;
    }
  }
  return decoded;
}

function normalizePatchPath(value: string): string {
  const decoded = repeatedlyDecode(value.normalize("NFKC")).replaceAll("\\", "/");
  return path.posix.normalize(decoded);
}

async function assertNoSymlink(root: string, relativePath: string): Promise<void> {
  const segments = relativePath.split("/");
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new PatchValidationError([`Symlink path denied: ${relativePath}`]);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

export async function validatePatchOperations(input: {
  repoRoot: string;
  taskType: TaskType;
  operations: readonly PatchOperation[];
  maxOps?: number;
  maxBytesPerOp?: number;
  maxChangedLines?: number;
}): Promise<PatchOperation[]> {
  const maxOps = input.maxOps ?? 8;
  const maxBytesPerOp = input.maxBytesPerOp ?? 40_000;
  const maxChangedLines = input.maxChangedLines ?? 300;
  const findings: string[] = [];
  if (input.operations.length > maxOps) {
    findings.push(`Too many operations: ${input.operations.length}/${maxOps}`);
  }
  const normalizedOperations: PatchOperation[] = [];
  let changedLines = 0;
  for (const rawOperation of input.operations) {
    const operation = PatchOperationSchema.parse(rawOperation);
    const normalizedPath = normalizePatchPath(operation.path);
    if (
      normalizedPath.startsWith("../") ||
      normalizedPath === ".." ||
      path.posix.isAbsolute(normalizedPath) ||
      normalizedPath.split("/").some((segment) => segment.startsWith("."))
    ) {
      findings.push(`Unsafe path: ${operation.path}`);
      continue;
    }
    if (ALWAYS_DENIED.some((prefix) => normalizedPath.startsWith(prefix))) {
      findings.push(`Always-denied path: ${normalizedPath}`);
      continue;
    }
    if (
      !TASK_ALLOWLIST[input.taskType].some((prefix) =>
        normalizedPath.startsWith(prefix)
      )
    ) {
      findings.push(`Path outside ${input.taskType} allowlist: ${normalizedPath}`);
      continue;
    }
    const resolved = path.resolve(input.repoRoot, normalizedPath);
    if (!withinRoot(input.repoRoot, resolved)) {
      findings.push(`Path escaped repository: ${normalizedPath}`);
      continue;
    }
    await assertNoSymlink(input.repoRoot, normalizedPath);
    try {
      const existing = await realpath(resolved);
      if (!withinRoot(await realpath(input.repoRoot), existing)) {
        findings.push(`Real path escaped repository: ${normalizedPath}`);
        continue;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    const content = operation.content ?? "";
    if (Buffer.byteLength(content, "utf8") > maxBytesPerOp) {
      findings.push(`Operation exceeds ${maxBytesPerOp} bytes: ${normalizedPath}`);
    }
    if (
      operation.action !== "delete" &&
      !Buffer.from(content, "utf8").toString("utf8").includes("\uFFFD")
    ) {
      const scan = scanGeneratedCode(content);
      findings.push(
        ...scan.map((finding) => `${normalizedPath}: ${finding.rule}`)
      );
    }
    changedLines += content.split("\n").length;
    normalizedOperations.push({ ...operation, path: normalizedPath });
  }
  if (changedLines > maxChangedLines) {
    findings.push(`Change budget exceeded: ${changedLines}/${maxChangedLines} lines`);
  }
  if (findings.length > 0) {
    throw new PatchValidationError(findings);
  }
  return normalizedOperations;
}

export async function applyPatchOperations(
  repoRoot: string,
  operations: readonly PatchOperation[]
): Promise<void> {
  for (const operation of operations) {
    const target = path.resolve(repoRoot, operation.path);
    if (operation.action === "delete") {
      await rm(target, { force: true });
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    let content = operation.content ?? "";
    if (operation.action === "append") {
      try {
        content = `${await readFile(target, "utf8")}${content}`;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
    const temporary = path.join(
      path.dirname(target),
      `.${path.basename(target)}.${randomUUID()}.tmp`
    );
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }
}

