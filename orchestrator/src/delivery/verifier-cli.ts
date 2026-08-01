import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EditionPackageSchema } from "../contracts/edition-package.js";
import { ArticlePackageSchema } from "../contracts/mma-files.js";
import { ReleaseProofSchema } from "../contracts/autonomy.js";
import { stateRoot } from "../paths.js";
import { atomicWriteJson, atomicWriteText } from "../state.js";
import { verifyDeployedRelease } from "./verifier.js";

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
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args[0] === "fail-closed") {
    const venture = required(args, "--venture");
    if (venture !== "caught-up" && venture !== "mma-files") throw new Error("--venture must be caught-up or mma-files");
    const packageHash = required(args, "--package-hash");
    const proofRelative = `release-proofs/${venture}/${packageHash}.json`;
    const proof = ReleaseProofSchema.parse(JSON.parse(await readFile(path.join(stateRoot, proofRelative), "utf8")));
    const revertCommit = valueAfter(args, "--revert-commit");
    const finalized = ReleaseProofSchema.parse({
      ...proof,
      status: revertCommit ? "reverted" : "failed",
      ...(revertCommit ? { revertCommit } : {})
    });
    await Promise.all([
      atomicWriteJson(stateRoot, proofRelative, finalized),
      atomicWriteText(stateRoot, `ventures/${venture}/PAUSED`, `Release ${packageHash} failed deterministic post-deploy verification at ${finalized.completedAt}. Clear this file only after the failure is repaired and a new proof passes.\n`),
      atomicWriteJson(stateRoot, `notify/release-failures/${venture}-${packageHash}.json`, {
        schemaVersion: "release-failure-digest/1",
        venture,
        packageHash,
        proof: `state/${proofRelative}`,
        status: finalized.status,
        ...(revertCommit ? { revertCommit } : {}),
        failedAt: finalized.completedAt
      })
    ]);
    console.log(JSON.stringify({ status: finalized.status, proof: `state/${proofRelative}` }));
    return;
  }
  const venture = required(args, "--venture");
  if (venture !== "caught-up" && venture !== "mma-files") throw new Error("--venture must be caught-up or mma-files");
  const packagePath = path.resolve(required(args, "--package"));
  const raw = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
  const release = venture === "caught-up"
    ? (() => {
        const pkg = EditionPackageSchema.parse(raw);
        if (pkg.status !== "edition") throw new Error("Caught Up verification requires an edition package");
        return {
          packageHash: pkg.idempotencyKey,
          slug: pkg.article.en.frontmatter.slug,
          titles: { en: pkg.article.en.frontmatter.title, cs: pkg.article.cs.frontmatter.title },
          image: pkg.image,
          targetRepository: "lukaskourilcz/aifirst" as const
        };
      })()
    : (() => {
        const pkg = ArticlePackageSchema.parse(raw);
        if (pkg.status !== "published") throw new Error("MMA Files verification requires a published article package");
        return {
          packageHash: pkg.packageHash,
          slug: pkg.slug,
          titles: { en: pkg.localizations.en.title, cs: pkg.localizations.cs.title },
          image: pkg.image,
          targetRepository: "lukaskourilcz/mma-files" as const
        };
      })();
  const retryCount = Number(valueAfter(args, "--retry-count") ?? "0");
  if (retryCount !== 0 && retryCount !== 1) throw new Error("--retry-count must be 0 or 1");
  const proof = await verifyDeployedRelease({
    venture,
    ...release,
    targetCommit: required(args, "--target-commit"),
    deploymentUrl: required(args, "--deployment-url"),
    githubToken: required(args, "--github-token"),
    retryCount,
    ...(valueAfter(args, "--timeout-ms") ? { timeoutMs: Number(valueAfter(args, "--timeout-ms")) } : {})
  });
  const relative = `release-proofs/${venture}/${release.packageHash}.json`;
  await atomicWriteJson(stateRoot, relative, proof);
  console.log(JSON.stringify({ status: proof.status, proof: `state/${relative}`, checks: proof.checks }));
  if (proof.status !== "passed") process.exitCode = 1;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
