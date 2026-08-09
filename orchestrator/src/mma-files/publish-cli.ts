import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { nextMmaDelivery, recordMmaDelivery, type MmaDeliveryKind, type MmaDeliveryStatus } from "./publish.js";

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function required(args: string[], name: string): string {
  const value = valueAfter(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function kind(args: string[]): MmaDeliveryKind {
  const value = required(args, "--kind");
  if (value !== "article" && value !== "fightaiq" && value !== "banner") throw new Error("--kind must be article, fightaiq or banner");
  return value;
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const args = raw[0] === "--" ? raw.slice(1) : raw;
  const command = args[0] ?? "next";
  if (command === "next") {
    const pending = await nextMmaDelivery(kind(args));
    const fields = pending ? {
      has_package: "true",
      package_kind: pending.kind,
      package_path: pending.packagePath,
      package_hash: pending.packageHash,
      package_hash12: pending.packageHash.slice(0, 12),
      package_label: pending.label,
      package_slug: pending.slug ?? "",
      image_hero_path: pending.imageHeroPath ?? "",
      image_thumb_path: pending.imageThumbPath ?? ""
    } : { has_package: "false" };
    const output = valueAfter(args, "--github-output");
    if (output) await appendFile(output, `${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
    console.log(JSON.stringify(fields));
    return;
  }
  if (command === "record") {
    const status = required(args, "--status") as MmaDeliveryStatus;
    if (status !== "delivered" && status !== "needs_reconciliation") throw new Error("invalid delivery status");
    const detailFile = valueAfter(args, "--detail-file");
    const detail = detailFile ? await readFile(detailFile, "utf8") : valueAfter(args, "--detail");
    const receipt = await recordMmaDelivery({
      kind: kind(args),
      packageHash: required(args, "--hash"),
      packagePath: required(args, "--package"),
      status,
      ...(valueAfter(args, "--target-commit") ? { targetCommit: valueAfter(args, "--target-commit") } : {}),
      ...(valueAfter(args, "--code") ? { code: valueAfter(args, "--code") } : {}),
      ...(detail ? { detail } : {})
    });
    console.log(JSON.stringify({ status, receipt }));
    return;
  }
  throw new Error(`Unknown MMA delivery command: ${command}`);
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
