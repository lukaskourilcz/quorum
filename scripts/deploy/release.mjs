#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  captureCommand,
  pnpmExecutable,
  printableCommand,
  readGitState,
  receiptDirectory,
  repoRoot,
  runCommand,
  validationReceiptPath,
  writeJsonAtomic
} from "./shared.mjs";

const targets = new Set(["preview", "production"]);

export function parseDeploymentArguments(target, argv) {
  if (!targets.has(target)) throw new Error("deployment target must be preview or production");
  let buildMode = "prebuilt-local";
  let remoteConfirmed = false;
  let productionConfirmation = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--remote-build") {
      buildMode = "manual-remote-build";
    } else if (argument === "--confirm-remote-build") {
      remoteConfirmed = true;
    } else if (argument.startsWith("--confirm-production=")) {
      productionConfirmation = argument.slice("--confirm-production=".length);
    } else if (argument === "--confirm-production") {
      productionConfirmation = argv[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`unknown deployment argument: ${argument}`);
    }
  }

  if (buildMode === "manual-remote-build" && !remoteConfirmed) {
    throw new Error("manual remote builds require --confirm-remote-build because they consume one Vercel cloud build");
  }
  return { target, buildMode, productionConfirmation };
}

export async function readProjectLink(
  filePath = path.join(repoRoot, ".vercel", "project.json"),
  read = readFile
) {
  let parsed;
  try {
    parsed = JSON.parse(await read(filePath, "utf8"));
  } catch {
    throw new Error("Vercel project is not linked; run `pnpm exec vercel link` from the repository root first");
  }
  if (typeof parsed.projectId !== "string" || typeof parsed.orgId !== "string") {
    throw new Error(".vercel/project.json does not contain a valid projectId and orgId");
  }
  return { projectId: parsed.projectId, orgId: parsed.orgId };
}

export async function readValidationReceipt(filePath = validationReceiptPath, read = readFile) {
  let receipt;
  try {
    receipt = JSON.parse(await read(filePath, "utf8"));
  } catch {
    throw new Error("no reusable release validation found; run `pnpm deploy:check` on this clean commit");
  }
  if (receipt.validationResult !== "passed" || receipt.clean !== true || typeof receipt.commitSha !== "string") {
    throw new Error("the saved release validation did not pass on a clean commit");
  }
  return receipt;
}

function deploymentCommands(target, buildMode) {
  const environment = target === "production" ? "production" : "preview";
  const pull = [pnpmExecutable, ["exec", "vercel", "pull", "--yes", `--environment=${environment}`]];
  if (buildMode === "manual-remote-build") {
    const args = ["exec", "vercel", "deploy"];
    if (target === "production") args.push("--prod");
    return { pull, build: null, deploy: [pnpmExecutable, args] };
  }
  const buildArgs = ["exec", "vercel", "build"];
  const deployArgs = ["exec", "vercel", "deploy", "--prebuilt"];
  if (target === "production") {
    buildArgs.push("--prod");
    deployArgs.push("--prod");
  }
  return {
    pull,
    build: [pnpmExecutable, buildArgs],
    deploy: [pnpmExecutable, deployArgs]
  };
}

function deploymentUrl(stdout) {
  return stdout.match(/https:\/\/[^\s]+/gu)?.at(-1) ?? null;
}

export async function runDeployment({
  target,
  buildMode,
  productionConfirmation,
  gitState = () => readGitState(),
  readValidation = () => readValidationReceipt(),
  projectLink = () => readProjectLink(),
  run = runCommand,
  capture = captureCommand,
  writeReceipt = writeJsonAtomic,
  now = () => new Date()
}) {
  const startedAt = now().toISOString();
  const receiptPath = path.join(receiptDirectory, `${target}.json`);
  const commands = deploymentCommands(target, buildMode);
  const commandLog = [commands.pull, commands.build, commands.deploy]
    .filter(Boolean)
    .map(([command, args]) => printableCommand(command, args));
  let state;
  let result = "failed";
  let url = null;
  let validationResult = "unverified";

  try {
    state = await gitState();
    if (!state.clean) throw new Error(`${target} deployment requires a clean Git working tree`);
    const validation = await readValidation();
    if (validation.commitSha !== state.sha) {
      throw new Error("release validation belongs to a different commit; run `pnpm deploy:check` again");
    }
    validationResult = "passed";

    if (target === "production") {
      if (state.branch !== "main") throw new Error("production deployment is allowed only from main");
      if (productionConfirmation !== state.sha) {
        throw new Error(`production requires --confirm-production=${state.sha}`);
      }
      await run("git", ["fetch", "--quiet", "origin", "main"], { cwd: repoRoot });
      const { stdout } = await capture("git", ["rev-parse", "origin/main"], { cwd: repoRoot });
      if (stdout.trim() !== state.sha) {
        throw new Error("main is not at the same commit as origin/main");
      }
    }

    const linkedBefore = await projectLink();
    console.log(`[deploy:${target}] commit ${state.sha}`);
    if (buildMode === "manual-remote-build") {
      console.warn(`[deploy:${target}] MANUAL REMOTE BUILD: this consumes one Vercel cloud build`);
    }

    await run(...commands.pull, { cwd: repoRoot });
    const linkedAfter = await projectLink();
    if (linkedAfter.projectId !== linkedBefore.projectId || linkedAfter.orgId !== linkedBefore.orgId) {
      throw new Error("vercel pull changed the linked project; deployment stopped before build");
    }
    if (commands.build) await run(...commands.build, { cwd: repoRoot });

    const beforeUpload = await gitState();
    if (!beforeUpload.clean || beforeUpload.sha !== state.sha) {
      throw new Error("Vercel preparation changed the source tree; deployment stopped before upload");
    }

    const deployed = await run(...commands.deploy, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "inherit"],
      mirrorOutput: true
    });
    url = deploymentUrl(deployed.stdout);
    if (!url) {
      result = "ambiguous";
      throw new Error("Vercel returned success without a deployment URL; inspect the dashboard and do not retry automatically");
    }
    result = "deployed";
    const receipt = {
      schemaVersion: 1,
      commitSha: state.sha,
      branch: state.branch,
      clean: true,
      target,
      validationResult: "passed",
      deployedAt: now().toISOString(),
      startedAt,
      buildMode,
      deploymentResult: result,
      deploymentUrl: url,
      commands: commandLog
    };
    await writeReceipt(receiptPath, receipt);
    console.log(JSON.stringify({ deploymentUrl: url, commitSha: state.sha }, null, 2));
    return receipt;
  } catch (error) {
    await writeReceipt(receiptPath, {
      schemaVersion: 1,
      commitSha: state?.sha ?? null,
      branch: state?.branch ?? null,
      clean: state?.clean ?? false,
      target,
      validationResult,
      deployedAt: now().toISOString(),
      startedAt,
      buildMode,
      deploymentResult: result,
      deploymentUrl: url,
      commands: commandLog,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseDeploymentArguments(process.argv[2], process.argv.slice(3));
    await runDeployment(options);
  } catch (error) {
    console.error(`[deploy] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
