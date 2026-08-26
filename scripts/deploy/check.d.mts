import type { CommandRunner, GitState } from "./shared.mjs";

export interface ValidationReceipt {
  schemaVersion: 1;
  commitSha: string;
  branch: string;
  clean: true;
  target: "validation";
  validationResult: "passed";
  validatedAt: string;
  startedAt: string;
  commands: string[];
}

export function runReleaseCheck(options?: {
  gitState?: () => Promise<GitState>;
  run?: CommandRunner;
  runSiteSmoke?: () => Promise<void>;
  writeReceipt?: (filePath: string, receipt: unknown) => Promise<void>;
  now?: () => Date;
}): Promise<ValidationReceipt>;
