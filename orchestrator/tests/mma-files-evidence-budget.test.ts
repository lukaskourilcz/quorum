import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorialSlateSchema, type EditorialSlate } from "../src/contracts/mma-files.js";
import type { ArticleEvidencePacket } from "../src/mma-files/pipeline.js";

// runLiveArticleProduction reads and writes the one module-level `stateRoot`, so the only way to
// exercise it against fixtures is to move that root. repoRoot and configRoot stay real: the
// packet's source refs are computed relative to repoRoot, and the venture agent controls the
// function loads first live under configRoot.
vi.mock("../src/paths.js", async () => {
  const { mkdtempSync } = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const actual = await vi.importActual<typeof import("../src/paths.js")>("../src/paths.js");
  return { ...actual, stateRoot: mkdtempSync(nodePath.join(nodeOs.tmpdir(), "mma-live-state-")) };
});

const { articleEvidenceFor, runLiveArticleProduction } = await import("../src/mma-files/live.js");
const { repoRoot, stateRoot: mockedStateRoot } = await import("../src/paths.js");
const realStateRoot = path.join(repoRoot, "state");

afterAll(async () => rm(mockedStateRoot, { recursive: true, force: true }));

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** The six bout records that name Shevchenko, copied from the real intake output. */
const SHEVCHENKO_BOUTS = [
  "history-0fb7c82cdf948e2d2c01.json",
  "history-7e2e400140de1b61a7c7.json",
  "history-8294420d311dc94b1382.json",
  "history-d49cda1598fa4a1c9e59.json",
  "history-db927720393d8da48ebe.json",
  "history-dd4842d8223d37c6c9c8.json"
] as const;

/**
 * The exact records the 2 August profile was written from.
 *
 * Real files, not fixtures: the failure is entirely about their size, so a shrunken copy would
 * test nothing. The subject card is 51,068 characters, of which 28,103 are `changeLog`.
 */
async function plantShevchenkoRecords(root: string): Promise<void> {
  await mkdir(path.join(root, "mma", "fighters"), { recursive: true });
  await mkdir(path.join(root, "mma", "bouts"), { recursive: true });
  for (const id of ["ufc:valentina-shevchenko", "ufc:alexa-grasso", "ufc:zhang-weili"]) {
    await copyFile(
      path.join(realStateRoot, "mma", "fighters", `${id}.json`),
      path.join(root, "mma", "fighters", `${id}.json`)
    );
  }
  for (const filename of SHEVCHENKO_BOUTS) {
    await copyFile(
      path.join(realStateRoot, "mma", "bouts", "ufc", filename),
      path.join(root, "mma", "bouts", filename)
    );
  }
}

function slateFor(date: string, subjectRef: string): EditorialSlate {
  return EditorialSlateSchema.parse({
    schemaVersion: "editorial-slate/1",
    date,
    slots: [
      { slot: "am", format: "fighter-profile", subjectRefs: [subjectRef], rationale: "Test assignment.", assignedWriter: "JAB", status: "assigned" },
      { slot: "pm", format: "desk-notes", subjectRefs: [`missing:${date}:pm`], rationale: "Nothing left on file.", assignedWriter: "QUILL", status: "killed", killedReason: "No source-backed subject left on file." }
    ],
    vaultVerdicts: [
      { subjectRef, verdict: "fresh", evidenceRef: `state/mma/fighters/${subjectRef}.json` },
      { subjectRef: `missing:${date}:pm`, verdict: "repeat", evidenceRef: "state/mma/fighters" }
    ]
  });
}

/** The repository paths the packet declares — the same narrowing the style gate uses on markers. */
function internalRefs(sources: ArticleEvidencePacket["sources"]): string[] {
  return sources.flatMap((source) => (source.kind === "internal" ? [source.ref] : []));
}

/** The packet split back into the per-file blocks `renderEvidenceText` builds it from. */
function evidenceSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  for (const block of text.split("\n\nFILE ")) {
    const chunk = block.startsWith("FILE ") ? block.slice("FILE ".length) : block;
    const newline = chunk.indexOf("\n");
    if (newline > 0) sections.set(chunk.slice(0, newline), chunk.slice(newline + 1));
  }
  return sections;
}

describe("article evidence packet", () => {
  it("delivers every file it declares as a source", async () => {
    const root = await tempRoot("mma-evidence-");
    await plantShevchenkoRecords(root);

    const packet = await articleEvidenceFor(root, slateFor("2026-08-02", "ufc:valentina-shevchenko"), "am");

    expect(packet).not.toBeNull();
    // Three fighter cards (subject plus the two opponents the six bouts name) and six bouts.
    const refs = internalRefs(packet!.sources);
    expect(refs).toHaveLength(9);
    const sections = evidenceSections(packet!.evidenceText);
    for (const ref of refs) {
      // Before the budget was shared out, the 24,000-character cut landed inside the first card
      // and eight of these nine files reached the writer as nothing at all — while the article's
      // sources array went on claiming all nine, and the style gate went on accepting a marker
      // naming any of them.
      expect(sections.get(ref)?.length ?? 0).toBeGreaterThan(200);
    }
    // Bout records are ~1,500 characters, so an even share always covers them whole.
    for (const filename of SHEVCHENKO_BOUTS) {
      const ref = refs.find((candidate) => candidate.endsWith(filename))!;
      expect(() => JSON.parse(sections.get(ref)!)).not.toThrow();
    }
  });

  it("drops the intake bookkeeping from the subject card, as it already does from opponents", async () => {
    const root = await tempRoot("mma-evidence-");
    await plantShevchenkoRecords(root);
    const onDisk = JSON.parse(await readFile(path.join(root, "mma", "fighters", "ufc:valentina-shevchenko.json"), "utf8"));
    // Half the subject card is the intake audit trail: 28,103 of its 51,068 characters.
    expect(JSON.stringify(onDisk.changeLog).length).toBeGreaterThan(20_000);
    expect(onDisk).toHaveProperty("sources");

    const packet = await articleEvidenceFor(root, slateFor("2026-08-02", "ufc:valentina-shevchenko"), "am");

    const sections = evidenceSections(packet!.evidenceText);
    const refs = internalRefs(packet!.sources);
    const subjectRef = refs.find((ref) => ref.endsWith("ufc:valentina-shevchenko.json"))!;
    const opponentRef = refs.find((ref) => ref.endsWith("ufc:alexa-grasso.json"))!;
    // `changeLog` records which scrape touched which field, and the card's own `sources` block is
    // the scraper's provenance — publisher names and retrieval stamps, never what the package
    // records as the article's sources, which is the list of FILE paths this packet is built
    // from. Bout records still travel verbatim, so this is asserted per card.
    for (const ref of [subjectRef, opponentRef]) {
      expect(sections.get(ref)).not.toContain("\"changeLog\":");
      expect(sections.get(ref)).not.toContain("\"sources\":");
    }
    // An opponent card arrives whole, so its shape can be checked rather than string-matched.
    expect(Object.keys(JSON.parse(sections.get(opponentRef)!))).toEqual(
      expect.not.arrayContaining(["changeLog", "sources", "history"])
    );
    // The subject's career log is the article; an opponent's is weight the piece never uses.
    expect(sections.get(subjectRef)).toContain("\"history\":");
  });

  it("never exceeds the packet ceiling", async () => {
    const root = await tempRoot("mma-evidence-");
    await plantShevchenkoRecords(root);

    const packet = await articleEvidenceFor(root, slateFor("2026-08-02", "ufc:valentina-shevchenko"), "am");

    expect(packet!.evidenceText.length).toBeLessThanOrEqual(24_000);
  });
});

describe("live article production always leaves a run record", () => {
  const now = new Date("2026-08-05T04:30:00.000Z");
  // The run file is named in Europe/Prague, the desk's timezone, not UTC.
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await rm(mockedStateRoot, { recursive: true, force: true });
    await mkdir(mockedStateRoot, { recursive: true });
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it("writes a killed record when the packet build throws instead of ending the phase silently", async () => {
    await plantShevchenkoRecords(mockedStateRoot);
    // A record that fails to parse. `articleEvidenceFor` JSON-parses every file under
    // mma/fighters and mma/bouts, so this throws where nothing used to catch it — after the
    // slate is settled and before anything is written. The phase ended with no run file at all.
    await writeFile(path.join(mockedStateRoot, "mma", "fighters", "ufc:corrupt.json"), "{ not json");
    await mkdir(path.join(mockedStateRoot, "ventures", "mma-files", "slates"), { recursive: true });
    await writeFile(
      path.join(mockedStateRoot, "ventures", "mma-files", "slates", `${date}.json`),
      JSON.stringify(slateFor(date, "ufc:valentina-shevchenko"))
    );

    const result = await runLiveArticleProduction({ cycleId: "test-cycle", slot: "am", now });

    expect(result.status).toBe("killed");
    expect(result.artifacts).toContain(`ventures/mma-files/runs/${date}-am.json`);
    const record = JSON.parse(await readFile(path.join(mockedStateRoot, "ventures", "mma-files", "runs", `${date}-am.json`), "utf8"));
    expect(record.status).toBe("killed");
    expect(record.reason).toBe("article_production_failed");
    // The reason has to name what threw; "it failed" would send a reader back to re-running the
    // phase by hand, which is the state this record exists to replace.
    expect(record.detail).toBeTruthy();
    expect(record.cycleId).toBe("test-cycle");
    expect(warn).toHaveBeenCalled();
  });

  it("refreshes the published-work index before the slot runs, not only after it succeeds", async () => {
    // Nothing on file, so the slot dies on the earliest exit there is. The magazine rooms read
    // ventures/mma-files/articles/INDEX.md an hour later either way, and the only writer used to
    // sit past the model call — a day where both slots died left the file as it was.
    const result = await runLiveArticleProduction({ cycleId: "test-cycle", slot: "am", now });

    expect(result.status).toBe("killed");
    const index = await readFile(path.join(mockedStateRoot, "ventures", "mma-files", "articles", "INDEX.md"), "utf8");
    expect(index).toContain("# MMA Files article index");
    expect(index).toContain("Articles on file: 0.");
  });
});
