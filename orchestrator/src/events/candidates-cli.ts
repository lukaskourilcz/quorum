import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stateRoot } from "../paths.js";
import { CANDIDATES_RELATIVE_PATH, collectEventCandidates, readEventsStore } from "./collect.js";
import { loadEventSourceRegistry } from "./registry.js";

/**
 * `pnpm events:candidates -- [--out <file>] [--date YYYY-MM-DD] [--dry]`
 *
 * Refreshes the suggestions the admin Akce tab lists. It writes one file that
 * is replaced wholesale, never an event: accepting a candidate is a save the
 * owner makes in the admin, and this command has no path to the store at all.
 *
 * A failing source is a line in the file and a line on stdout. The command
 * still exits 0, because an empty panel is a smaller problem than a red run.
 */
function arg(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const date = arg(argv, "date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    console.error(`events:candidates: --date expects YYYY-MM-DD, got ${date}`);
    return 1;
  }
  const dry = argv.includes("--dry");
  const registry = loadEventSourceRegistry();

  const file = await collectEventCandidates({
    registry,
    events: readEventsStore(),
    deps: { now: date },
  });

  const outFile = arg(argv, "out") ?? path.join(stateRoot, CANDIDATES_RELATIVE_PATH);
  if (!dry) {
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  }

  const failed = file.sources.filter((source) => source.error).length;
  console.log(
    `[events] ${file.candidates.length} candidate(s) from ${file.sources.length} source(s)` +
      `${failed ? `, ${failed} failed` : ""}${dry ? " [dry]" : ""}`,
  );
  for (const source of file.sources) {
    console.log(
      `  ${source.error ? "!" : "-"} ${source.id}: read ${source.read}, offered ${source.accepted},` +
        ` dropped ${source.dropped}, already stored ${source.known}${source.error ? ` — ${source.error}` : ""}`,
    );
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
