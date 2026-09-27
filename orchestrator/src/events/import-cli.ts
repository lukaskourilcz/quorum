import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EVENT_SCOPES, type EventScope } from "../contracts/boardless-events.js";
import { stateRoot } from "../paths.js";
import { eventsOffered, importHash, mergeImportedEvents, parseStore } from "./import.js";

/**
 * `pnpm events:import -- --file <path> [--date YYYY-MM-DD] [--default-scope cz|global] [--dry]`
 *
 * Merges an owner-curated events file into `state/ventures/caught-up/events/events.json` and
 * writes one receipt under `receipts/<date>-import-<hash12>.json` naming every event it added,
 * updated, left alone, skipped or dropped. A run that changes nothing writes nothing, so running
 * the same file twice leaves one receipt. `$0`: no fetch, no model call, no publication — the
 * cycle's "Deliver caught-up events" step syncs the store to aifirst `data/events.json`.
 */
export const STORE_RELATIVE_PATH = "ventures/caught-up/events/events.json";
export const RECEIPTS_RELATIVE_PATH = "ventures/caught-up/events/receipts";

function arg(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

export function runEventsImport(input: {
  file: string;
  date: string;
  root?: string;
  dry?: boolean;
  defaultScope?: EventScope;
}): { changed: boolean; receiptPath: string | null; outcome: ReturnType<typeof mergeImportedEvents>["outcome"] } {
  const root = input.root ?? stateRoot;
  const raw = JSON.parse(readFileSync(input.file, "utf8")) as unknown;
  const offered = eventsOffered(raw);
  if (!offered) throw new Error(`${input.file} holds neither an events envelope nor an array of events`);
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const store = parseStore(existsSync(storePath) ? JSON.parse(readFileSync(storePath, "utf8")) as unknown : undefined, input.date);
  const { file, outcome } = mergeImportedEvents({
    store,
    offered,
    today: input.date,
    ...(input.defaultScope ? { defaultScope: input.defaultScope } : {})
  });
  const changed = outcome.added.length + outcome.updated.length > 0;
  if (!changed || input.dry) return { changed, receiptPath: null, outcome };
  const receiptRelative = `${RECEIPTS_RELATIVE_PATH}/${input.date}-import-${importHash(offered)}.json`;
  writeJson(storePath, file);
  writeJson(path.join(root, receiptRelative), {
    schemaVersion: "caught-up-events-import/1",
    date: input.date,
    source: path.basename(input.file),
    offered: offered.length,
    ...outcome
  });
  return { changed, receiptPath: receiptRelative, outcome };
}

export function main(argv = process.argv.slice(2)): number {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const file = arg(args, "file");
  const date = arg(args, "date") ?? new Date().toISOString().slice(0, 10);
  const scope = arg(args, "default-scope");
  if (!file) {
    console.error("events:import: --file <path> is required");
    return 1;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    console.error(`events:import: --date expects YYYY-MM-DD, got ${date}`);
    return 1;
  }
  if (scope !== undefined && !(EVENT_SCOPES as readonly string[]).includes(scope)) {
    console.error(`events:import: --default-scope expects cz or global, got ${scope}`);
    return 1;
  }
  const dry = args.includes("--dry");
  const result = runEventsImport({ file, date, dry, ...(scope ? { defaultScope: scope as EventScope } : {}) });
  const { outcome } = result;
  console.log(
    `[events:import] added ${outcome.added.length}, updated ${outcome.updated.length}, unchanged ${outcome.unchanged.length},`
      + ` skipped ${outcome.skipped.length}, dropped ${outcome.dropped.length}`
      + (dry ? " [dry]" : result.receiptPath ? ` -> ${result.receiptPath}` : " (nothing to write)")
  );
  for (const drop of outcome.dropped) console.log(`  ! #${drop.index} ${drop.title ?? "(untitled)"}: ${drop.reason}`);
  for (const skip of outcome.skipped) console.log(`  - ${skip.id}: ${skip.reason}`);
  for (const note of outcome.notes) console.log(`  · ${note.id}: ${note.note}`);
  return 0;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`events:import: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
