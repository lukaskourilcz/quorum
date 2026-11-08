import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/config.js";

const workflow = () => readFile(path.join(repoRoot, ".github", "workflows", "heydarlink-ambient.yml"), "utf8");
const step = (source: string, name: string) => {
  const start = source.indexOf(`      - name: ${name}\n`);
  expect(start, `${name} is missing`).toBeGreaterThan(-1);
  const end = source.indexOf("\n      - name: ", start + 1);
  return source.slice(start, end === -1 ? undefined : end);
};

describe("the ambient workflow", () => {
  it("runs daily and by hand with persona, count and dry_run, one run at a time", async () => {
    const source = await workflow();
    expect(source).toMatch(/- cron: "55 \d{1,2} \* \* \*"/u);
    expect(source).toContain("workflow_dispatch:");
    for (const input of ["persona:", "count:", "dry_run:"]) expect(source).toContain(`      ${input}`);
    expect(source).toMatch(/dry_run:[\s\S]*?default: false/u);
    expect(source).toMatch(/concurrency:\n {2}group: heydarlink-ambient\n {2}cancel-in-progress: false/u);
    expect(source).toMatch(/timeout-minutes: \d+/u);
  });

  it("asks only for contents: write, which the ledger commit needs", async () => {
    const source = await workflow();
    expect(source).toMatch(/^permissions:\n {2}contents: write\n\n/mu);
  });

  it("checks secret names before installing anything, and hands secrets only to the render step", async () => {
    const source = await workflow();
    expect(source.indexOf("- name: Check required secrets")).toBeLessThan(source.indexOf("- name: Install pnpm"));
    const check = step(source, "Check required secrets");
    for (const name of ["FAL_KEY", "OPENAI_API_KEY", "HEYDARLINK_INGEST_URL", "HEYDARLINK_INGEST_TOKEN"]) {
      expect(check).toContain(`secrets.${name} != ''`);
    }
    expect(check).toContain("::error::");
    const secretSteps = source.split("\n      - name: ").filter((block) => /secrets\.[A-Z_]+ \}\}/u.test(block));
    expect(secretSteps.map((block) => block.split("\n")[0])).toEqual(["Render, grade, gate and upload"]);
    expect(step(source, "Render, grade, gate and upload")).toContain("secrets.GEMINI_API_KEY");
  });

  it("commits only the ambient ledger, even after a failed run", async () => {
    const commit = step(await workflow(), "Commit the ledger");
    expect(commit).toContain("if: ${{ !cancelled() }}");
    expect(commit).toContain("git add -A -- state/heydarlink-ambient");
    expect(commit).not.toMatch(/git add (\.|-A)\s*$/mu);
  });
});
