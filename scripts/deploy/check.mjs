#!/usr/bin/env node
import {
  printableCommand,
  readGitState,
  releaseSteps,
  repoRoot,
  runCommand,
  runWithSiteServer,
  validationReceiptPath,
  writeJsonAtomic
} from "./shared.mjs";
import { pathToFileURL } from "node:url";

export async function runReleaseCheck({
  gitState = () => readGitState(),
  run = runCommand,
  runSiteSmoke = () => runWithSiteServer(),
  writeReceipt = writeJsonAtomic,
  now = () => new Date()
} = {}) {
  const startedAt = now().toISOString();
  const commands = releaseSteps.map(([command, args]) => printableCommand(command, args));
  commands.push("pnpm --filter @boardlessai/site start", "pnpm site:smoke");
  let initial;

  try {
    initial = await gitState();
    if (!initial.clean) {
      throw new Error("deploy:check requires a clean Git working tree");
    }
    for (const [command, args] of releaseSteps) {
      console.log(`\n[deploy:check] ${printableCommand(command, args)}`);
      await run(command, args, { cwd: repoRoot });
    }
    console.log("\n[deploy:check] start built site and run route/link smoke");
    await runSiteSmoke();

    const final = await gitState();
    if (!final.clean || final.sha !== initial.sha) {
      throw new Error("release checks changed the tree or moved HEAD; validation is not reusable");
    }
    const receipt = {
      schemaVersion: 1,
      commitSha: initial.sha,
      branch: initial.branch,
      clean: true,
      target: "validation",
      validationResult: "passed",
      validatedAt: now().toISOString(),
      startedAt,
      commands
    };
    await writeReceipt(validationReceiptPath, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  } catch (error) {
    const receipt = {
      schemaVersion: 1,
      commitSha: initial?.sha ?? null,
      branch: initial?.branch ?? null,
      clean: initial?.clean ?? false,
      target: "validation",
      validationResult: "failed",
      validatedAt: now().toISOString(),
      startedAt,
      commands,
      error: error instanceof Error ? error.message : String(error)
    };
    await writeReceipt(validationReceiptPath, receipt);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReleaseCheck().catch((error) => {
    console.error(`[deploy:check] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
