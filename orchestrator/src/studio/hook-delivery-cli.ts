import { appendFile } from "node:fs/promises";
import { stateRoot } from "../paths.js";
import {
  HOOK_DELIVERY_PATH,
  pendingHookDelivery,
  recordHookDelivery,
  stageHookDelivery,
  HookDeliveryError
} from "./hook-delivery.js";

/**
 * `next`  — stage a delivery if the app's library is out of date, and tell the workflow.
 * `record` — write the receipt after the push landed.
 *
 * The same shape `mma:delivery` uses, so the workflow step reads the same outputs and a reader of
 * cycle.yml does not have to learn a second convention.
 */
async function main(): Promise<void> {
  const [command] = process.argv.slice(2);
  const outputFile = process.argv.includes("--github-output")
    ? process.argv[process.argv.indexOf("--github-output") + 1]
    : null;

  const emit = async (line: string): Promise<void> => {
    process.stdout.write(`${line}\n`);
    if (outputFile) await appendFile(outputFile, `${line}\n`, "utf8");
  };

  if (command === "record") {
    const commit = process.argv.includes("--commit")
      ? process.argv[process.argv.indexOf("--commit") + 1] ?? null
      : null;
    const packaged = await pendingHookDelivery({ stateRoot, generatedAt: new Date().toISOString() });
    if (!packaged) {
      await emit("already_recorded=true");
      return;
    }
    await recordHookDelivery({ stateRoot, packaged, deliveredAt: new Date().toISOString(), targetCommit: commit });
    await emit("already_recorded=false");
    return;
  }

  try {
    const packaged = await pendingHookDelivery({ stateRoot, generatedAt: new Date().toISOString() });
    if (!packaged) {
      // The ordinary case on most days: the library has not changed, so nothing is pushed.
      await emit("has_package=false");
      return;
    }
    await stageHookDelivery(stateRoot, packaged);
    await emit("has_package=true");
    await emit(`package_path=state/${HOOK_DELIVERY_PATH}`);
    await emit(`package_hash12=${packaged.idempotencyKey.slice(0, 12)}`);
    await emit(`hook_count=${packaged.hookCount}`);
  } catch (error) {
    if (error instanceof HookDeliveryError) {
      // A failing lint is not a delivery failure to reconcile; it is a library that must not
      // leave the repository. The cycle carries on and CI is already red.
      process.stderr.write(`${error.message}\n`);
      await emit("has_package=false");
      await emit("lint_blocked=true");
      return;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
