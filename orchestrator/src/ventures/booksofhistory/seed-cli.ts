import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stateRoot } from "../../paths.js";
import { appendBhSeed, readBhSeedLibrary, rescoreBhSeed } from "./seed.js";

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function inputRecord(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(file), "utf8")) as unknown;
}

export async function main(argv: string[]): Promise<number> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const appendFile = valueAfter(args, "--append");
  const rescoreFile = valueAfter(args, "--rescore");
  if (args.includes("--append") && appendFile === undefined) throw new Error("--append requires a JSON file");
  if (args.includes("--rescore") && rescoreFile === undefined) throw new Error("--rescore requires a JSON file");
  if (args.includes("--state-root") && valueAfter(args, "--state-root") === undefined) {
    throw new Error("--state-root requires a directory");
  }
  if (appendFile !== undefined && rescoreFile !== undefined) {
    throw new Error("Choose either --append or --rescore, not both");
  }
  const root = path.resolve(valueAfter(args, "--state-root") ?? stateRoot);

  if (appendFile !== undefined) {
    const next = await appendBhSeed(root, await inputRecord(appendFile));
    console.log(`BOOKSOFHISTORY seed: appended 1 book; ${next.books.length} total`);
    return 0;
  }
  if (rescoreFile !== undefined) {
    const candidate = await inputRecord(rescoreFile);
    const next = await rescoreBhSeed(root, candidate);
    const id = candidate && typeof candidate === "object" && "bookId" in candidate
      ? String((candidate as { bookId: unknown }).bookId)
      : "unknown";
    console.log(`BOOKSOFHISTORY seed: rescored ${id}; ${next.books.length} total`);
    return 0;
  }

  const library = await readBhSeedLibrary(root);
  console.log(`BOOKSOFHISTORY seed: valid; ${library.books.length} books`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
