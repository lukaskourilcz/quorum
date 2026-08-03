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
    // One file per locale the package carries. Czech is always there; English is optional and
    // on its way out, and writing a fixed pair would emit an empty English artifact after it.
    for (const locale of ["en", "cs"] as const) {
      const article = editionPackage.article[locale];
      if (!article) continue;
      files.push(
        await writeMdxFile(outputRoot, `${editionPackage.date}.${locale}.mdx`, article.frontmatter, article.body)
      );
    }
  }
  return files;
}
