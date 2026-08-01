import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../paths.js";
import { oldestPendingDelivery, recordDelivery, type DeliveryFailureCode } from "./outbox.js";

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function required(args: string[], name: string): string {
  const value = valueAfter(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const command = args[0] ?? "next";
  if (command === "next") {
    const pending = await oldestPendingDelivery();
    const output = valueAfter(args, "--github-output");
    const fields = pending
      ? {
          has_package: "true",
          package_path: path.join(repoRoot, "state", pending.packagePath),
          package_state_path: pending.packagePath,
          date: pending.package.date,
          hash: pending.package.idempotencyKey,
          hash12: pending.package.idempotencyKey.slice(0, 12),
          package_status: pending.package.status,
          has_image: pending.package.status === "edition" ? "true" : "false",
          image_hero_path: pending.package.status === "edition" ? pending.package.image.hero_path : "",
          image_thumb_path: pending.package.status === "edition" ? pending.package.image.thumb_path : "",
          slug: pending.package.status === "edition"
            ? pending.package.article.en.frontmatter.slug
            : "no edition"
        }
      : { has_package: "false" };
    if (output) {
      await appendFile(output, `${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
    }
    console.log(JSON.stringify(fields));
    return;
  }
  if (command === "record") {
    const status = required(args, "--status");
    if (status !== "delivered" && status !== "needs_reconciliation") {
      throw new Error("--status must be delivered or needs_reconciliation");
    }
    const detailFile = valueAfter(args, "--detail-file");
    const detail = detailFile ? await readFile(detailFile, "utf8") : valueAfter(args, "--detail");
    const files = await recordDelivery({
      packagePath: required(args, "--package"),
      status,
      ...(valueAfter(args, "--code") ? { code: valueAfter(args, "--code") as DeliveryFailureCode } : {}),
      ...(detail ? { detail: detail.trim() } : {}),
      ...(valueAfter(args, "--target-commit") ? { targetCommit: valueAfter(args, "--target-commit") } : {})
    });
    console.log(JSON.stringify({ status, files }));
    return;
  }
  throw new Error(`Unknown delivery command: ${command}`);
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
