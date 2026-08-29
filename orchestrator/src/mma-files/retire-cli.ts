import path from "node:path";
import { pathToFileURL } from "node:url";
import { stateRoot } from "../paths.js";
import { retireArticle, surveyRetirableArticles } from "./retire.js";

/**
 * Retire the parked articles the magazine can never accept.
 *
 * Dry by default. Retirement writes a terminal receipt against real delivery state, so it says
 * what it would do and stops unless `--apply` is passed; a survey costs nothing and can be read
 * on any run.
 */
async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const args = raw[0] === "--" ? raw.slice(1) : raw;
  const apply = args.includes("--apply");
  const survey = await surveyRetirableArticles(stateRoot);

  for (const kept of survey.keep) {
    console.log(`keep    ${kept.label} — ${kept.reason}`);
  }
  for (const candidate of survey.retirable) {
    console.log(
      `${apply ? "retire " : "would  "} ${candidate.label} — superseded by ${candidate.supersededBy.publishAt.slice(0, 10)}`
    );
    if (apply) await retireArticle(stateRoot, candidate);
  }

  if (survey.retirable.length === 0) console.log("Nothing to retire.");
  else if (!apply) console.log(`\n${survey.retirable.length} retirable. Re-run with --apply to write the receipts.`);
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
