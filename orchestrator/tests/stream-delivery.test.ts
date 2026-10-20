import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import { deployedCronExpressions } from "../src/ventures/registry.js";

const workflow = readFileSync(path.join(repoRoot, ".github/workflows/cycle.yml"), "utf8");

/** Every `allowed='...'` line in the delivery steps, in file order. */
function allowlists(): string[] {
  return [...workflow.matchAll(/allowed='([^']+)'/gu)].map((match) => match[1]!);
}

describe("the delivery allowlists", () => {
  it("still carries the dataset allowlist byte-identically", () => {
    // Widening this would let a dataset append rewrite an article.
    expect(allowlists()).toContain(String.raw`^data/(ai-facts|ai-lessons)\.json$`);
  });

  it("gives streams and events their own kinds", () => {
    expect(allowlists()).toContain(String.raw`^data/(talked-about|podcasts)\.json$`);
    expect(allowlists()).toContain(String.raw`^data/events\.json$`);
  });

  it("keeps the edition allowlist as the only one that can write an article", () => {
    const editionAllowlists = allowlists().filter((entry) => entry.includes("content/articles"));
    expect(editionAllowlists).toHaveLength(0);
    // The edition allowlist is assigned with double quotes because it
    // interpolates the package date, so it is matched separately.
    expect(workflow).toContain("content/articles/${PACKAGE_DATE}\\.(en|cs)\\.mdx");
  });

  it("never lets a stream or event allowlist reach an article, an image or board JSON", () => {
    for (const list of [
      String.raw`^data/(talked-about|podcasts)\.json$`,
      String.raw`^data/events\.json$`,
    ]) {
      const pattern = new RegExp(list, "u");
      for (const forbidden of [
        "content/articles/2026-08-09.cs.mdx",
        "public/images/editions/x/hero.webp",
        "public/data/board/2026-08-09.json",
        "data/ai-facts.json",
        "data/ai-lessons.json",
      ]) {
        expect(pattern.test(forbidden), `${list} must not accept ${forbidden}`).toBe(false);
      }
    }
  });

  it("accepts exactly the files each kind is allowed to write", () => {
    const streams = new RegExp(String.raw`^data/(talked-about|podcasts)\.json$`, "u");
    expect(streams.test("data/talked-about.json")).toBe(true);
    expect(streams.test("data/podcasts.json")).toBe(true);
    expect(streams.test("data/events.json")).toBe(false);

    const events = new RegExp(String.raw`^data/events\.json$`, "u");
    expect(events.test("data/events.json")).toBe(true);
    expect(events.test("data/talked-about.json")).toBe(false);
  });
});

describe("how the sync steps are gated", () => {
  it("runs only when the owner has switched streams on", () => {
    expect(workflow).toContain("vars.CAUGHT_UP_STREAMS_ENABLED == 'true'");
  });

  it("adds no new cron entry and no new council phase", () => {
    // The steps live inside the existing daily cycle. Every cron in the workflow is one of the
    // backstop sweeps the registry generates, and this work added none.
    const schedules = [...workflow.matchAll(/- cron:/gu)].length;
    expect(schedules).toBe(deployedCronExpressions().length);
    expect(workflow).not.toContain("phase == 'cu-streams'");
    expect(workflow).not.toContain("phase == 'cu-events'");
  });

  it("keeps syncing on the morning run while Caught Up is paused, and delivers no edition then", () => {
    // quorum#602. The sync rides the DNESKAi day, which leaves the clock with the pause, so the
    // decision is run here exactly as the workflow writes it, against both registry states.
    const start = workflow.indexOf("          caught_up_status=");
    const marker = 'echo "caught_up_sync=$caught_up_sync" >> "$GITHUB_OUTPUT"';
    const end = workflow.indexOf(marker, start);
    expect(start, "the mode step no longer reads Caught Up's status").toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const decision = workflow.slice(start, end + marker.length);
    const outputs = (status: string, phase: string) => {
      const root = mkdtempSync(path.join(tmpdir(), "caught-up-sync-"));
      try {
        mkdirSync(path.join(root, "config"));
        writeFileSync(path.join(root, "config", "ventures.json"), JSON.stringify({
          schemaVersion: "venture-registry/1",
          ventures: [{ id: "caught-up", status }, { id: "goviral", status: "paused" }]
        }));
        const output = path.join(root, "github-output");
        writeFileSync(output, "");
        execFileSync("bash", ["-eo", "pipefail", "-c", decision], {
          cwd: root,
          env: { PATH: process.env.PATH ?? "", phase, GITHUB_OUTPUT: output }
        });
        return Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map((line) => line.split("=", 2)));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    };
    expect(outputs("operating", "cu-day")).toEqual({ caught_up_delivery: "true", caught_up_sync: "true" });
    expect(outputs("operating", "cu-edition")).toEqual({ caught_up_delivery: "true", caught_up_sync: "true" });
    expect(outputs("operating", "morning")).toEqual({ caught_up_delivery: "false", caught_up_sync: "false" });
    expect(outputs("paused", "morning")).toEqual({ caught_up_delivery: "false", caught_up_sync: "true" });
    expect(outputs("paused", "cu-day")).toEqual({ caught_up_delivery: "false", caught_up_sync: "false" });
    expect(outputs("paused", "cu-edition")).toEqual({ caught_up_delivery: "false", caught_up_sync: "false" });
    expect(outputs("paused", "afternoon")).toEqual({ caught_up_delivery: "false", caught_up_sync: "false" });
  });

  it("is quiet on a day with no change", () => {
    const quiet = [...workflow.matchAll(/No (stream|event) changes today\./gu)];
    expect(quiet).toHaveLength(2);
  });

  it("verifies the reader's own gates before committing", () => {
    const verifies = [...workflow.matchAll(/pnpm install --frozen-lockfile && pnpm verify/gu)];
    expect(verifies.length).toBeGreaterThanOrEqual(2);
  });

  it("pushes with the same refetch-and-retry pattern as the edition delivery", () => {
    // The edition delivery, the stream sync and the event sync. The MMA Files delivery that used to
    // make a fourth left with that magazine (operations-2026-09b).
    const retries = [...workflow.matchAll(/rebase --autostash origin\/main/gu)];
    expect(retries.length).toBeGreaterThanOrEqual(3);
  });
});
