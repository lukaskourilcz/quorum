import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import {
  ChallengeBankSnapshotSchema,
  ChallengeSchema,
  challengesContentHash,
  difficultyLabel,
  loadChallengeSnapshot,
  selectChallenge,
  slideText
} from "../src/ventures/marketingshark/challenges.js";
import { loadDevSharkChallenges } from "../src/ventures/marketingshark/react-express-app-adapter.js";

// quorum#576 (B9): the Wednesday teaser shows an Easy challenge's prompt and first hint, labelled by
// devShark's own difficulty step, and never a solution.

const FIXTURE = "contracts/fixtures/marketingshark-challenges.valid.json";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function fixture() {
  return ChallengeBankSnapshotSchema.parse(JSON.parse(await readFile(path.join(repoRoot, FIXTURE), "utf8")));
}

describe("the devShark challenge snapshot", () => {
  it("holds a prompt and a first hint per challenge and has no field a solution could ride in", async () => {
    const snapshot = await fixture();
    const entry = snapshot.challenges[0]!;
    expect(Object.keys(entry).sort()).toEqual(["difficulty", "firstHint", "id", "prompt", "title", "track"]);
    for (const extra of ["solution", "hints", "approach", "starter", "tests"]) {
      expect(ChallengeSchema.safeParse({ ...entry, [extra]: "x" }).success, extra).toBe(false);
    }
    expect(ChallengeBankSnapshotSchema.safeParse({ ...snapshot, note: "x" }).success).toBe(false);
    expect(ChallengeBankSnapshotSchema.safeParse({ ...snapshot, labelSource: "tier" }).success).toBe(false);
  });

  it("reads as absent until one is imported, and refuses one that does not hash to its challenges", async () => {
    const root = await tempDir("ms-challenges-");
    await expect(loadChallengeSnapshot("state/marketingshark/challenge-banks/devshark.json", root)).resolves.toBeNull();
    const snapshot = await fixture();
    await mkdir(path.join(root, "bank"), { recursive: true });
    await writeFile(path.join(root, "bank", "good.json"), JSON.stringify(snapshot));
    await expect(loadChallengeSnapshot("bank/good.json", root)).resolves.toMatchObject({ contentHash: snapshot.contentHash });
    const edited = { ...snapshot, challenges: snapshot.challenges.map((challenge, index) => (index === 0 ? { ...challenge, title: "Edited" } : challenge)) };
    await writeFile(path.join(root, "bank", "edited.json"), JSON.stringify(edited));
    await expect(loadChallengeSnapshot("bank/edited.json", root)).rejects.toThrow(/does not match its challenges/u);
  });

  it("serves one Easy challenge a week that fits, turning over on Mondays", async () => {
    const snapshot = await fixture();
    const week = (dates: string[]) => dates.map((date) => selectChallenge({ snapshot, difficulty: "easy", date, fits: () => true })?.id);
    const first = week(["2026-09-28", "2026-09-30", "2026-10-04"]);
    expect(new Set(first).size).toBe(1);
    expect(week(["2026-10-05"])[0]).not.toBe(first[0]);
    const all = new Set(week(Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(2026, 8, 28 + index * 7)).toISOString().slice(0, 10))));
    expect([...all].every((id) => snapshot.challenges.find((challenge) => challenge.id === id)?.difficulty === "easy")).toBe(true);
    expect(all.has("js-flatten-arrays")).toBe(false);
    // A challenge whose words do not fit its slides is never chosen; none fitting is none chosen.
    expect(selectChallenge({ snapshot, difficulty: "easy", date: "2026-09-30", fits: (challenge) => challenge.id === "js-count-vowels" })?.id).toBe("js-count-vowels");
    expect(selectChallenge({ snapshot, difficulty: "easy", date: "2026-09-30", fits: () => false })).toBeNull();
  });

  it("prints the label devShark prints and drops inline-code markup from slide text", () => {
    expect(difficultyLabel("easy")).toBe("Easy");
    expect(slideText("Write `double(numbers)`, returning a new array.")).toBe("Write double(numbers), returning a new array.");
  });
});

/** A throwaway react-express-app checkout with only the modules the challenge import reads. */
async function fakeCheckout(options: { difficultyOf: boolean }): Promise<string> {
  const root = await tempDir("fake-devshark-");
  const write = async (relative: string, text: string) => {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), text);
  };
  const task = (id: string, extra: string) => `{ id: "${id}", track: "javascript", tier: 1, title: { en: "Title ${id}", cs: "" }, prompt: { en: "Write ${id}.", cs: "" }, hints: { en: ["First hint ${id}.", "Second hint ${id}."], cs: [] }, verify: "tests", solution: "SECRET", ${extra} }`;
  await write("shared/coding-catalog.ts", options.difficultyOf
    // The product's own label, which may disagree with the tier: the import must take the product's.
    ? `export const difficultyOf = (summary: { id: string; tier: number }) => summary.id === "js-override" ? "medium" : summary.tier <= 2 ? "easy" : "hard";\n`
    : "export const formatOf = () => 'implement';\n");
  await write("shared/evolving.ts", "export const evolvingStage = (id: string) => id.startsWith('evo-') ? { stage: 1 } : null;\n");
  await write("lib/coding/catalog.ts", "export const summarize = (task: { id: string; tier: number }) => ({ id: task.id, tier: task.tier });\n");
  await write("lib/coding/active.ts", `export const ACTIVE_CODING_TASKS = [
  ${task("js-plain", "")},
  ${task("js-override", "")},
  ${task("evo-stage-one", "")},
  ${task("js-checklist", "verify: \"checklist\"")},
  ${task("js-repair", "format: \"debug\"")},
  { id: "sd-design", track: "system-design", tier: 1, title: { en: "Design" }, prompt: { en: "Design it." }, hints: { en: ["Hint."] }, verify: "tests" },
  { id: "js-long", track: "javascript", tier: 1, title: { en: "Long" }, prompt: { en: "${"x".repeat(700)}" }, hints: { en: ["Hint."] }, verify: "tests" }
];\n`);
  return root;
}

describe("the devShark challenge import", () => {
  it("refuses a checkout that has not shipped devShark's difficulty labels", async () => {
    const checkout = await fakeCheckout({ difficultyOf: false });
    await expect(loadDevSharkChallenges(checkout)).rejects.toThrow(/has not shipped its difficulty labels \(step D5\)/u);
  });

  it("takes standalone tasks with their first hint and the product's own label, and nothing else", async () => {
    const checkout = await fakeCheckout({ difficultyOf: true });
    const { challenges, dropped } = await loadDevSharkChallenges(checkout);
    expect(challenges).toEqual([
      { id: "js-override", track: "javascript", title: "Title js-override", difficulty: "medium", prompt: "Write js-override.", firstHint: "First hint js-override." },
      { id: "js-plain", track: "javascript", title: "Title js-plain", difficulty: "easy", prompt: "Write js-plain.", firstHint: "First hint js-plain." }
    ]);
    expect(dropped).toEqual(["js-long"]);
    expect(JSON.stringify(challenges)).not.toMatch(/SECRET|Second hint/u);
    expect(challengesContentHash(challenges)).toMatch(/^[a-f0-9]{64}$/u);
  });
});
