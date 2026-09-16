import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DECK_FAMILIES,
  GOLDEN_DIRECTORY,
  GOLDEN_MANIFEST_PATH,
  buildGoldenManifest,
  goldenRenderInput,
  readGoldenManifest,
  renderCarouselPng,
  strandedGoldenEntries,
  verifyGoldenManifest,
  type DeckFamily
} from "../src/index.js";

/**
 * Record or verify the committed golden renders.
 *
 * `pnpm -C studio golden` rewrites `studio/golden/manifest.json` from the current library.
 * `pnpm -C studio golden:check` re-renders and exits non-zero on any drift, which is what CI runs.
 *
 * The date is an argument rather than a clock. `--date 2026-09-16` is required when recording, so
 * re-running the recorder on an unchanged library rewrites byte-identical JSON instead of a diff
 * that says only that somebody ran it — the same reason every other deterministic path here
 * refuses `new Date()`.
 *
 * On a mismatch the checker names every family that moved and every slide inside it, and writes
 * those slides' current PNGs into the gitignored `studio/golden/.diff/` so a human can open them.
 */

const DIFF_DIRECTORY = path.join(GOLDEN_DIRECTORY, ".diff");

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

/**
 * The slides that moved, written out so a human can look at them.
 *
 * Deliberately not a pixel differ. Only hashes are committed, so there are no baseline bytes to
 * difference against — storing thirty decks of PNGs to be able to subtract them is exactly the
 * trade this manifest exists to avoid. What the checker can say is *which* slides moved, and it
 * says it precisely: the current render of each changed slide lands here beside a report naming
 * the hash that was expected. The previous bytes are one `git checkout` of the manifest and one
 * re-record away for anyone who wants both halves.
 */
async function writeChangedSlides(family: DeckFamily, changedSlides: readonly number[], expected: string | null): Promise<void> {
  const current = await renderCarouselPng(goldenRenderInput(family));
  mkdirSync(DIFF_DIRECTORY, { recursive: true });
  const written: string[] = [];
  for (const index of changedSlides) {
    const slide = current[index];
    if (!slide) continue;
    const file = `${family}-${String(index + 1).padStart(2, "0")}.png`;
    writeFileSync(path.join(DIFF_DIRECTORY, file), slide.png);
    written.push(file);
  }
  writeFileSync(
    path.join(DIFF_DIRECTORY, `${family}.json`),
    `${JSON.stringify({ family, expectedDeckHash: expected, slideHashes: current.map(({ pngHash }) => pngHash), written }, null, 2)}\n`
  );
}

async function check(): Promise<number> {
  const manifest = readGoldenManifest();
  const stranded = strandedGoldenEntries(manifest);
  const verdicts = await verifyGoldenManifest(manifest);
  const failures = verdicts.filter((verdict) => !verdict.ok);
  for (const verdict of verdicts) {
    process.stdout.write(`${verdict.ok ? "ok  " : "DRIFT"} ${verdict.family} ${verdict.actual.slice(0, 12)}\n`);
  }
  for (const family of stranded) {
    process.stderr.write(`STRANDED ${family} is in the manifest and not in DECK_FAMILIES\n`);
  }
  if (!failures.length && !stranded.length) {
    process.stdout.write(`${verdicts.length} families match the committed golden manifest\n`);
    return 0;
  }
  for (const verdict of failures) {
    process.stderr.write(
      `${verdict.family}: expected ${verdict.expected ?? "no entry"}, rendered ${verdict.actual}`
      + `${verdict.changedSlides.length ? `, slides ${verdict.changedSlides.map((index) => index + 1).join(", ")}` : ""}\n`
    );
    await writeChangedSlides(verdict.family, verdict.changedSlides, verdict.expected);
  }
  if (failures.length) process.stderr.write(`Changed slides written to ${DIFF_DIRECTORY}\n`);
  return 1;
}

async function record(): Promise<number> {
  const date = argument("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    process.stderr.write("Pass the recording date: pnpm -C studio golden -- --date YYYY-MM-DD\n");
    return 1;
  }
  const manifest = await buildGoldenManifest(date);
  mkdirSync(GOLDEN_DIRECTORY, { recursive: true });
  writeFileSync(GOLDEN_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Recorded ${manifest.entries.length} of ${DECK_FAMILIES.length} families to ${GOLDEN_MANIFEST_PATH}\n`);
  return 0;
}

process.exitCode = process.argv.includes("--check") ? await check() : await record();
