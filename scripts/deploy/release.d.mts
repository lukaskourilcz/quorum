import type { CommandRunner, GitState } from "./shared.mjs";

export type DeploymentTarget = "preview" | "production";
export type BuildMode = "prebuilt-local" | "manual-remote-build";

export interface DeploymentOptions {
  target: DeploymentTarget;
  buildMode: BuildMode;
  productionConfirmation: string | null;
}

export interface DeploymentReceipt {
  schemaVersion: 1;
  commitSha: string;
  branch: string;
  clean: true;
  target: DeploymentTarget;
  validationResult: "passed";
  deployedAt: string;
  startedAt: string;
  buildMode: BuildMode;
  deploymentResult: "deployed";
  deploymentUrl: string;
  commands: string[];
}

export function parseDeploymentArguments(target: string, argv: string[]): DeploymentOptions;
export function readProjectLink(
  filePath?: string,
  read?: (filePath: string, encoding: "utf8") => Promise<string>
): Promise<{ projectId: string; orgId: string }>;
export function readValidationReceipt(
  filePath?: string,
  read?: (filePath: string, encoding: "utf8") => Promise<string>
): Promise<{ commitSha: string; validationResult: "passed"; clean: true }>;
export function runDeployment(options: DeploymentOptions & {
  gitState?: () => Promise<GitState>;
  readValidation?: () => Promise<{ commitSha: string; validationResult: "passed"; clean: true }>;
  projectLink?: () => Promise<{ projectId: string; orgId: string }>;
  run?: CommandRunner;
  capture?: CommandRunner;
  writeReceipt?: (filePath: string, receipt: Record<string, unknown>) => Promise<void>;
  now?: () => Date;
}): Promise<DeploymentReceipt>;
