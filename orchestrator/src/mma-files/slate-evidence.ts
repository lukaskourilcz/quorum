import { access } from "node:fs/promises";
import path from "node:path";
import { EditorialSlateSchema, type EditorialSlate } from "../contracts/mma-files.js";

/**
 * The prefixes that make an evidence ref a claim about a file in this repository.
 *
 * Everything else a verdict may cite — `meeting:2026-08-02-mag-editorial`, `event:ufc:...`,
 * `FIXTURE:editorial-slate.valid` — names a room, a subject or a fixture, not a path, and there
 * is nothing on disk to check it against.
 */
const REPO_PATH_PREFIX = /^(?:state|config|site|orchestrator|contracts)\//u;

export function isRepoPathEvidenceRef(reference: string): boolean {
  return REPO_PATH_PREFIX.test(reference);
}

const NOTE_LIMIT = 240;

/**
 * The note left behind, short enough that the schema's 240-character cap can never truncate the
 * reason away — the ref is what gets shortened when the two together would not fit.
 */
function removalNote(reference: string): string {
  const prefix = "Removed evidenceRef ";
  const suffix = ": no such file in the repository.";
  const room = NOTE_LIMIT - prefix.length - suffix.length;
  const shown = reference.length <= room ? reference : `${reference.slice(0, room - 1)}…`;
  return `${prefix}${shown}${suffix}`;
}

async function resolves(repoRoot: string, reference: string): Promise<boolean> {
  // A ref may carry a `#fragment` naming a line or an entry inside the file; the file is the
  // part that has to exist.
  const relative = reference.split("#")[0]!;
  const absolute = path.resolve(repoRoot, relative);
  // `state/../../../etc/hosts` passes the prefix test and would otherwise be "resolved" by
  // answering about a file outside the repository entirely.
  if (absolute !== repoRoot && !absolute.startsWith(`${repoRoot}${path.sep}`)) return false;
  try {
    await access(absolute);
    return true;
  } catch {
    return false;
  }
}

/**
 * A slate whose file-shaped evidence refs all name files that exist.
 *
 * Every slate reaching `state/ventures/mma-files/slates/` passes through here, because both of
 * the things that produce one hand it strings nobody checked: the dry room copies
 * `contracts/fixtures/editorial-slate.valid.json` verbatim, so whatever the fixture claims is
 * republished as the desk's own citation, and the live room takes the slate from CANVAS, a
 * model. That is how `state/ideas/mma-files/ledger.jsonl#1` — a file this repository has never
 * held, in a namespace no idea ledger is ever written for — became a stored verdict on
 * 2026-08-01.
 *
 * A dead ref is dropped rather than corrected, and never invented into existence: the verdict
 * keeps a note naming the path that was removed and why. The room is not failed over it. Both
 * callers have already been billed for the seats by the time the slate is written, and killing
 * the room would cost the day's articles to punish a citation the reader can now see is missing.
 */
export async function resolveSlateEvidence(
  repoRoot: string,
  slate: EditorialSlate
): Promise<{ slate: EditorialSlate; removed: string[] }> {
  const removed: string[] = [];
  const vaultVerdicts = await Promise.all(slate.vaultVerdicts.map(async (verdict) => {
    const reference = verdict.evidenceRef;
    if (!reference || !isRepoPathEvidenceRef(reference) || await resolves(repoRoot, reference)) return verdict;
    removed.push(reference);
    const { evidenceRef: _dropped, ...rest } = verdict;
    return { ...rest, unresolvedEvidence: removalNote(reference) };
  }));
  return { slate: removed.length ? EditorialSlateSchema.parse({ ...slate, vaultVerdicts }) : slate, removed };
}
