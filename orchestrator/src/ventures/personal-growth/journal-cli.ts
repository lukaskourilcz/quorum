import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stateRoot } from "../../paths.js";
import {
  ingestPersonalGrowthJournalFile,
  openPersonalGrowthPrivateJournalStore,
  PersonalGrowthPrivateJournalStore,
  type PersonalGrowthJournalLanguage
} from "./journal.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const filePath = valueAfter(args, "--file");
const language = valueAfter(args, "--language") as PersonalGrowthJournalLanguage | undefined;
const title = valueAfter(args, "--title");
const dry = args.includes("--dry");
if (!filePath || !title || (language !== "cs" && language !== "en")) {
  throw new Error("Usage: personal-growth:ingest -- --file <path> --language cs|en --title <title> [--private-root <path>] [--dry]");
}
const temporaryRoot = dry ? await mkdtemp(path.join(tmpdir(), "personal-growth-journal-")) : null;
const privateRoot = valueAfter(args, "--private-root") ?? process.env.PERSONAL_GROWTH_PRIVATE_CLONE_PATH ?? (temporaryRoot ? path.join(temporaryRoot, "private") : null);
if (!privateRoot) throw new Error("PERSONAL_GROWTH_PRIVATE_CLONE_PATH or --private-root is required");

try {
  const store = dry
    ? new PersonalGrowthPrivateJournalStore(privateRoot, path.join(temporaryRoot!, "public"))
    : await openPersonalGrowthPrivateJournalStore({ privateRoot, publicStateRoot: stateRoot });
  const result = await ingestPersonalGrowthJournalFile({
    filePath,
    language,
    title,
    store,
    now: new Date()
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "refused") process.exitCode = 2;
} finally {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
}
