import type { ChildProcess } from "node:child_process";

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: unknown;
  mirrorOutput?: boolean;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandOptions
) => Promise<CommandResult>;

export interface GitState {
  sha: string;
  branch: string;
  clean: boolean;
}

export const repoRoot: string;
export const receiptDirectory: string;
export const validationReceiptPath: string;
export const pnpmExecutable: string;
export const releaseSteps: Array<[string, string[]]>;

export function pnpmForPlatform(platform: NodeJS.Platform): string;
export function printableCommand(command: string, args: string[]): string;
export function runCommand(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>;
export function captureCommand(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>;
export function readGitState(run?: CommandRunner, cwd?: string): Promise<GitState>;
export function writeJsonAtomic(filePath: string, value: unknown): Promise<void>;
export function waitForSite(
  url?: string,
  options?: {
    attempts?: number;
    intervalMs?: number;
    fetchImplementation?: typeof fetch;
  }
): Promise<void>;
export function startSite(cwd?: string): ChildProcess;
export function stopChild(child: ChildProcess, timeoutMs?: number): Promise<void>;
export function runWithSiteServer(options?: {
  start?: () => ChildProcess;
  ready?: () => Promise<void>;
  smoke?: () => Promise<unknown>;
  stop?: (child: ChildProcess) => Promise<void>;
  signals?: Pick<NodeJS.Process, "once" | "off">;
}): Promise<void>;
