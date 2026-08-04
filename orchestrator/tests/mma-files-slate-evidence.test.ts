import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EditorialSlateSchema, type EditorialSlate } from "../src/contracts/mma-files.js";
import { isRepoPathEvidenceRef, resolveSlateEvidence } from "../src/mma-files/slate-evidence.js";
import { repoRoot, stateRoot } from "../src/paths.js";

const slateRoot = path.join(stateRoot, "ventures", "mma-files", "slates");
const LIVE_FIGHTER_CARD = "state/mma/fighters/ufc:valentina-shevchenko.json";

async function storedSlates(): Promise<Array<{ file: string; slate: EditorialSlate }>> {
  const filenames = (await readdir(slateRoot)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(filenames.map(async (file) => ({
    file,
    slate: EditorialSlateSchema.parse(JSON.parse(await readFile(path.join(slateRoot, file), "utf8")))
  })));
}

function slateWith(evidenceRef: string): EditorialSlate {
  return EditorialSlateSchema.parse({
    schemaVersion: "editorial-slate/1",
    date: "2026-08-01",
    slots: [
      { slot: "am", format: "fighter-profile", subjectRefs: ["ufc:valentina-shevchenko"], rationale: "The sourced file is complete enough for a profile.", assignedWriter: "JAB", status: "assigned" },
      { slot: "pm", format: "desk-notes", subjectRefs: ["missing:2026-08-01:pm"], rationale: "Nothing else cleared the desk.", assignedWriter: "QUILL", status: "killed", killedReason: "No source-backed subject left on file." }
    ],
    vaultVerdicts: [
      { subjectRef: "ufc:valentina-shevchenko", verdict: "fresh", evidenceRef },
      { subjectRef: "missing:2026-08-01:pm", verdict: "repeat", evidenceRef: "meeting:2026-08-01-mag-editorial" }
    ]
  });
}

/** A copy the tests can put into states the schema rejects, which is the point of using it. */
function loosened(slate: EditorialSlate): { vaultVerdicts: Array<Record<string, unknown>> } {
  return JSON.parse(JSON.stringify(slate)) as { vaultVerdicts: Array<Record<string, unknown>> };
}

describe("stored editorial slates", () => {
  // 2026-08-01 was written by `pnpm proof:rooms`: the dry mag-editorial room copies
  // contracts/fixtures/editorial-slate.valid.json into ventures/mma-files/slates/, and
  // portfolio-proof.ts copies that file out of tmp/dry-run into state/. Both verdicts arrived
  // citing state/ideas/mma-files/ledger.jsonl, which has never existed — idea ledgers are
  // created lazily by appendSnapshots in src/ideas/ledger.ts, only for a namespace some room has
  // actually screened an idea into, and mma-files has never been one; its subjects come from
  // state/mma. A verdict either names a file a reviewer can open or does not look like a file.
  it("cites no file that does not exist", async () => {
    const slates = await storedSlates();
    // Without this the loop below would pass on an empty directory and prove nothing.
    expect(slates.length).toBeGreaterThan(0);
    const dangling: string[] = [];
    for (const { file, slate } of slates) {
      for (const verdict of slate.vaultVerdicts) {
        const reference = verdict.evidenceRef;
        if (!reference || !isRepoPathEvidenceRef(reference)) continue;
        if (!existsSync(path.join(repoRoot, reference.split("#")[0]!))) dangling.push(`${file}: ${reference}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});

describe("resolveSlateEvidence", () => {
  it("drops a repository path that names no file and records what it removed", async () => {
    const result = await resolveSlateEvidence(repoRoot, slateWith("state/ideas/mma-files/ledger.jsonl#1"));
    expect(result.removed).toEqual(["state/ideas/mma-files/ledger.jsonl#1"]);
    const verdict = result.slate.vaultVerdicts[0]!;
    expect(verdict.evidenceRef).toBeUndefined();
    expect(verdict.unresolvedEvidence)
      .toBe("Removed evidenceRef state/ideas/mma-files/ledger.jsonl#1: no such file in the repository.");
    // The verdict survives: the subject stays adjudicated, only the dead citation goes, and the
    // assignment the slate exists to carry is untouched.
    expect(verdict.subjectRef).toBe("ufc:valentina-shevchenko");
    expect(result.slate.slots).toEqual(slateWith(LIVE_FIGHTER_CARD).slots);
  });

  it("keeps a repository path that does resolve, fragment and all", async () => {
    expect(existsSync(path.join(repoRoot, LIVE_FIGHTER_CARD))).toBe(true);
    const result = await resolveSlateEvidence(repoRoot, slateWith(`${LIVE_FIGHTER_CARD}#history`));
    expect(result.removed).toEqual([]);
    expect(result.slate.vaultVerdicts[0]!.evidenceRef).toBe(`${LIVE_FIGHTER_CARD}#history`);
  });

  it("leaves refs that are not paths alone, since no file can settle them", async () => {
    const result = await resolveSlateEvidence(repoRoot, slateWith("FIXTURE:editorial-slate.valid"));
    expect(result.removed).toEqual([]);
    expect(result.slate.vaultVerdicts.map((verdict) => verdict.evidenceRef))
      .toEqual(["FIXTURE:editorial-slate.valid", "meeting:2026-08-01-mag-editorial"]);
  });

  it("still fits the note in when the dead ref is as long as a ref may be", async () => {
    // Both the ref and the note cap at 240 characters, so a maximal ref plus any wrapping text
    // overflows. If the note were built and left to the schema, the parse inside
    // resolveSlateEvidence would throw and take the whole room with it — the one outcome a
    // dropped citation must not cause. The ref is shortened instead, and the reason survives.
    const longRef = `state/${"a".repeat(234)}`;
    expect(longRef.length).toBe(240);
    const result = await resolveSlateEvidence(repoRoot, slateWith(longRef));
    expect(result.removed).toEqual([longRef]);
    const note = result.slate.vaultVerdicts[0]!.unresolvedEvidence as string;
    expect(note.length).toBeLessThanOrEqual(240);
    expect(note.endsWith(": no such file in the repository.")).toBe(true);
  });

  it("does not let a ref climb out of the repository to find something that exists", async () => {
    // Built from the checkout's own depth rather than a literal chain of "..", so the target is
    // the repository's parent directory on any machine: it exists, it starts with a checked
    // prefix, and it is not a file anyone reviewing this repository can open.
    const escape = `state/${path.relative(path.join(repoRoot, "state"), path.dirname(repoRoot))}`;
    expect(existsSync(path.join(repoRoot, escape))).toBe(true);
    expect(isRepoPathEvidenceRef(escape)).toBe(true);
    const result = await resolveSlateEvidence(repoRoot, slateWith(escape));
    expect(result.removed).toEqual([escape]);
  });
});

describe("the vault verdict contract", () => {
  it("refuses a verdict that accounts for its evidence in no way at all", () => {
    const silent = loosened(slateWith(LIVE_FIGHTER_CARD));
    delete silent.vaultVerdicts[0]!.evidenceRef;
    expect(EditorialSlateSchema.safeParse(silent).success).toBe(false);
  });

  it("refuses a verdict that both cites evidence and calls it unresolved", () => {
    const both = loosened(slateWith(LIVE_FIGHTER_CARD));
    both.vaultVerdicts[0]!.unresolvedEvidence = "Removed evidenceRef state/gone.json: no such file in the repository.";
    expect(EditorialSlateSchema.safeParse(both).success).toBe(false);
  });

  it("accepts a verdict carrying the note instead of the ref", () => {
    const noted = loosened(slateWith(LIVE_FIGHTER_CARD));
    delete noted.vaultVerdicts[0]!.evidenceRef;
    noted.vaultVerdicts[0]!.unresolvedEvidence = "Removed evidenceRef state/gone.json: no such file in the repository.";
    expect(EditorialSlateSchema.safeParse(noted).success).toBe(true);
  });
});
