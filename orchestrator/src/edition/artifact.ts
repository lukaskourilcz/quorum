import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EditionPackageSchema, type EditionPackage } from "../contracts/edition-package.js";
import { repoRoot } from "../paths.js";
import { writeMdxFile } from "./content-write.js";
import { hasValidEditionPackageHash } from "./package.js";
import type { EditionRunReport } from "./report.js";

export async function writeEditionArtifact(
  editionPackage: EditionPackage,
  report: EditionRunReport,
  outputRoot = path.join(
    repoRoot,
    "orchestrator",
    ".dry-run",
    "editions",
    editionPackage.date
  )
): Promise<string[]> {
  EditionPackageSchema.parse(editionPackage);
  if (!hasValidEditionPackageHash(editionPackage)) {
    throw new Error("Edition package idempotency hash is invalid");
  }
  await mkdir(outputRoot, { recursive: true });
  const packageFile = path.join(outputRoot, "package.json");
  const reportFile = path.join(outputRoot, "report.json");
  const latestFile = path.join(path.dirname(outputRoot), "latest.json");
  await Promise.all([
    writeFile(packageFile, `${JSON.stringify(editionPackage, null, 2)}\n`, "utf8"),
    writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(
      latestFile,
      `${JSON.stringify({ package: editionPackage, report }, null, 2)}\n`,
      "utf8"
    )
  ]);
  const files = [packageFile, reportFile, latestFile];
  if (editionPackage.status === "edition") {
    files.push(
      await writeMdxFile(
        outputRoot,
        `${editionPackage.date}.en.mdx`,
        editionPackage.article.en.frontmatter,
        editionPackage.article.en.body
      ),
      await writeMdxFile(
        outputRoot,
        `${editionPackage.date}.cs.mdx`,
        editionPackage.article.cs.frontmatter,
        editionPackage.article.cs.body
      )
    );
  }
  return files;
}
