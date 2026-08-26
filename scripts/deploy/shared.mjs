import { spawn } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const receiptDirectory = path.join(repoRoot, ".deploy");
export const validationReceiptPath = path.join(receiptDirectory, "validation.json");

export const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export const releaseSteps = [
  [pnpmExecutable, ["install", "--frozen-lockfile"]],
  [pnpmExecutable, ["agents:validate"]],
  [pnpmExecutable, ["lint"]],
  [pnpmExecutable, ["lint:hooks"]],
  [pnpmExecutable, ["hooks:vectors", "--", "--check"]],
  [pnpmExecutable, ["typecheck"]],
  [pnpmExecutable, ["test"]],
  [pnpmExecutable, ["build"]]
];

export function printableCommand(command, args) {
  return [command, ...args].join(" ");
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      if (options.mirrorOutput) process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      if (options.mirrorOutput) process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const suffix = signal ? ` after ${signal}` : ` with exit code ${code ?? "unknown"}`;
      reject(new Error(`${printableCommand(command, args)} failed${suffix}`));
    });
  });
}

export async function captureCommand(command, args, options = {}) {
  return runCommand(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
}

export async function readGitState(run = captureCommand, cwd = repoRoot) {
  const [{ stdout: sha }, { stdout: branch }, { stdout: status }] = await Promise.all([
    run("git", ["rev-parse", "HEAD"], { cwd }),
    run("git", ["branch", "--show-current"], { cwd }),
    run("git", ["status", "--porcelain"], { cwd })
  ]);
  return {
    sha: sha.trim(),
    branch: branch.trim(),
    clean: status.trim().length === 0
  };
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filePath);
}

export async function waitForSite(
  url = "http://127.0.0.1:3000/",
  { attempts = 30, intervalMs = 1_000, fetchImplementation = fetch } = {}
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImplementation(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // Readiness failures are expected until the server starts; the final timeout is reported.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`site did not become ready at ${url} after ${attempts} attempts`);
}

export function startSite(cwd = repoRoot) {
  return spawn(pnpmExecutable, ["--filter", "@boardlessai/site", "start"], {
    cwd,
    env: process.env,
    stdio: "inherit",
    windowsHide: true
  });
}

export async function stopChild(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish();
    }, timeoutMs);
    child.once("exit", finish);
    child.kill("SIGTERM");
  });
}

export async function runWithSiteServer({
  start = startSite,
  ready = waitForSite,
  smoke = () => runCommand(pnpmExecutable, ["site:smoke"], { cwd: repoRoot }),
  stop = stopChild,
  signals = process
} = {}) {
  const child = start();
  let stopPromise;
  const stopOnce = () => {
    stopPromise ??= Promise.resolve(stop(child));
    return stopPromise;
  };
  let rejectSignal;
  const interrupted = new Promise((_, reject) => {
    rejectSignal = reject;
  });
  const exited = new Promise((_, reject) => {
    if (typeof child.once !== "function") return;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const detail = signal ? ` after ${signal}` : ` with exit code ${code ?? "unknown"}`;
      reject(new Error(`site server exited before smoke completed${detail}`));
    });
  });
  const handlers = new Map(
    ["SIGINT", "SIGTERM"].map((signal) => [signal, () => {
      void stopOnce().finally(() => rejectSignal(new Error(`release check interrupted by ${signal}`)));
    }])
  );
  for (const [signal, handler] of handlers) signals.once(signal, handler);

  try {
    await Promise.race([
      (async () => {
        await ready();
        await smoke();
      })(),
      interrupted,
      exited
    ]);
  } finally {
    for (const [signal, handler] of handlers) signals.off(signal, handler);
    await stopOnce();
  }
}
