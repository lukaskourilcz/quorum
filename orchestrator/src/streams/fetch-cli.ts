import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  BoardlessStreamSchema,
  STREAM_NAMES,
  type StreamItem,
  type StreamName,
} from "../contracts/boardless-stream.js";
import { stateRoot } from "../paths.js";
import { syncStream } from "./fetch.js";
import { loadStreamRegistry } from "./registry.js";

/**
 * `pnpm streams:fetch -- [--stream talked-about|podcasts] [--current <file>]
 *                        [--out <file>] [--date YYYY-MM-DD] [--dry]`
 *
 * Same ergonomics as `datasets:append`. A receipt is always written, including
 * on a dry run and including when every source failed, because "we tried and
 * got nothing" and "we never ran" have to be distinguishable afterwards.
 */
function arg(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

function readCurrent(file: string | undefined, stream: StreamName): StreamItem[] {
  if (!file) return [];
  try {
    const parsed = BoardlessStreamSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success || parsed.data.stream !== stream) return [];
    return parsed.data.items;
  } catch {
    // A missing or unreadable current file is a first run, not a failure.
    return [];
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const requested = arg(argv, "stream");
  if (requested && !(STREAM_NAMES as readonly string[]).includes(requested)) {
    console.error(`streams:fetch: unknown stream ${requested}; expected one of ${STREAM_NAMES.join(", ")}`);
    return 1;
  }
  const streams: StreamName[] = requested ? [requested as StreamName] : [...STREAM_NAMES];
  const dry = argv.includes("--dry");
  const date = arg(argv, "date") ?? today();
  const registry = loadStreamRegistry();

  for (const stream of streams) {
    const currentFile = streams.length === 1 ? arg(argv, "current") : undefined;
    const outFile = streams.length === 1 ? arg(argv, "out") : undefined;
    const current = readCurrent(currentFile, stream);

    const { items, receipt } = await syncStream({
      stream,
      current,
      registry,
      deps: { now: date },
    });

    const receiptDir = path.join(stateRoot, "ventures", "caught-up", "streams");
    mkdirSync(receiptDir, { recursive: true });
    writeFileSync(
      path.join(receiptDir, `${date}-${stream}.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8",
    );

    if (!dry && outFile) {
      const file = {
        schemaVersion: "boardless-stream/1" as const,
        stream,
        updated: date,
        windowDays: 60,
        items,
      };
      BoardlessStreamSchema.parse(file);
      writeFileSync(outFile, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    }

    const failed = receipt.sourceErrors.length;
    console.log(
      `[streams] ${stream}: ${receipt.before} -> ${receipt.after} (+${receipt.added.length} -${receipt.pruned.length})` +
        `${failed ? `, ${failed} source(s) failed` : ""}${dry ? " [dry]" : ""}`,
    );
    for (const error of receipt.sourceErrors) console.log(`  ! ${error.source}: ${error.reason}`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
