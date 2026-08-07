import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  contentHashOf,
  hasFencedCode,
  loadQuestionBankSnapshot,
  NormalizedQuestionSchema,
  truthSubjectOf,
  type NormalizedQuestion
} from "../src/ventures/marketingshark/bank.js";
import { loadMarketingSharkConfig } from "../src/ventures/marketingshark/config.js";

const question = (overrides: Partial<NormalizedQuestion> = {}): NormalizedQuestion =>
  NormalizedQuestionSchema.parse({
    id: "q1",
    category: "javascript",
    difficulty: 2,
    importance: 7,
    hasCode: false,
    correctIndex: 1,
    en: { introduction: "", question: "What?", options: ["a", "b"], explanation: "because" },
    ...overrides
  });

describe("marketingShark question bank", () => {
  it("loads the committed devShark snapshot and proves its hash", async () => {
    const config = await loadMarketingSharkConfig();
    const brand = config.brands.find((candidate) => candidate.id === "devshark")!;
    const snapshot = await loadQuestionBankSnapshot(brand.questionBank.snapshotPath);

    expect(snapshot.brandId).toBe("devshark");
    expect(snapshot.sourceRepo).toBe("lukaskourilcz/react-express-app");
    expect(snapshot.sourceSubject).toBe("webdev");
    expect(snapshot.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(snapshot.questions.length).toBeGreaterThan(3_000);
    expect(new Set(snapshot.questions.map((entry) => entry.id)).size).toBe(snapshot.questions.length);
    // Both predicates the hook library gates on have to be satisfiable by this bank, or a
    // pattern that names them is decoration.
    expect(snapshot.questions.some((entry) => entry.hasCode)).toBe(true);
    expect(snapshot.questions.some((entry) => entry.difficulty >= 4)).toBe(true);
    expect(snapshot.questions.every((entry) => entry.correctIndex < entry.en.options.length)).toBe(true);
  });

  it("refuses a snapshot whose questions no longer match its envelope", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ms-bank-"));
    const questions = [question()];
    const file = path.join(directory, "tampered.json");
    await writeFile(file, JSON.stringify({
      schemaVersion: "marketingshark-bank/1",
      brandId: "devshark",
      sourceRepo: "lukaskourilcz/react-express-app",
      sourceCommit: "0".repeat(40),
      sourceSubject: "webdev",
      importedAt: "2026-08-07T00:00:00.000Z",
      contentHash: contentHashOf(questions),
      // Edited after the hash was taken, which is exactly the case the check exists for: the
      // hash seeds the epoch order, so a silent edit would serve an order derived from
      // questions that are no longer in the file.
      questions: [question({ id: "swapped" })]
    }), "utf8");

    await expect(loadQuestionBankSnapshot(file)).rejects.toThrow(/does not match its questions/);
  });

  it("hashes by content rather than by key order", () => {
    const left = canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] });
    const right = canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 });
    expect(left).toBe(right);
    expect(contentHashOf([question()])).toBe(contentHashOf([question()]));
    expect(contentHashOf([question()])).not.toBe(contentHashOf([question({ difficulty: 3 })]));
  });

  it("detects fenced code in either the question or its introduction", () => {
    expect(hasFencedCode({ question: "plain" })).toBe(false);
    expect(hasFencedCode({ question: "see ```js\nx\n```" })).toBe(true);
    expect(hasFencedCode({ introduction: "```ts\ny\n```", question: "plain" })).toBe(true);
  });

  it("rejects a Czech options array that is not parallel to the English one", () => {
    // The correct answer is an index into both arrays. A shorter Czech array silently moves it.
    const result = NormalizedQuestionSchema.safeParse({
      ...question(),
      cs: { options: ["jen jedna"] }
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("parallel");
  });

  it("rejects a correct index that points past the options", () => {
    const result = NormalizedQuestionSchema.safeParse({ ...question(), correctIndex: 2 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("outside");
  });

  it("projects a question onto exactly the fields the truth predicates read", () => {
    expect(truthSubjectOf(question({ hasCode: true }))).toEqual({
      difficulty: 2,
      hasCode: true,
      category: "javascript",
      optionCount: 2,
      englishQuestion: "What?"
    });
  });
});
