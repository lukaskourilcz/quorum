import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

const workflowRoot = path.join(repoRoot, ".github", "workflows");

describe("automation policy", () => {
  it("pins every third-party action to an immutable commit", async () => {
    const names = (await readdir(workflowRoot)).filter((name) => name.endsWith(".yml"));
    expect(names.sort()).toEqual([
      "ci.yml",
      "cycle.yml",
      "health.yml",
      "owndashboard-cron-report.yml",
      "social-publisher.yml"
    ]);

    for (const name of names) {
      const source = await readFile(path.join(workflowRoot, name), "utf8");
      expect(source).not.toContain("pull_request_target");
      expect(source).not.toMatch(/push\s+--force|force-with-lease/);
      expect(source).toMatch(/timeout-minutes:\s*\d+/);

      for (const line of source.split("\n").filter((value) => value.includes("uses:"))) {
        expect(line, `${name}: ${line.trim()}`).toMatch(
          /uses:\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}/
        );
      }
    }
  });

  it("uses Prague-aware schedules and fail-closed dry fallbacks", async () => {
    const cycle = await readFile(path.join(workflowRoot, "cycle.yml"), "utf8");
    const social = await readFile(
      path.join(workflowRoot, "social-publisher.yml"),
      "utf8"
    );
    const health = await readFile(path.join(workflowRoot, "health.yml"), "utf8");

    expect(cycle).toContain('cron: "0 6 * * *"');
    expect(cycle).toContain('cron: "0 14 * * *"');
    expect(cycle).toContain('cron: "0 22 * * *"');
    expect(cycle.match(/timezone: "Europe\/Prague"/g)).toHaveLength(3);
    expect(cycle).toContain('"0 6 * * *") phase=morning');
    expect(cycle).toContain('"0 14 * * *") phase=afternoon');
    expect(cycle).toContain('"0 22 * * *") phase=night');
    expect(cycle).toContain("Unknown cycle schedule; refusing to infer a shift.");
    expect(cycle).toContain("forcing fixture-only dry mode");
    expect(cycle).toContain("contents: write");
    expect(social).toContain('timezone: "Europe/Prague"');
    expect(social).toContain("--dry-if-disabled");
    expect(health).toContain('timezone: "Europe/Prague"');
  });

  it("does not enable any social channel without human approval", async () => {
    const channels = JSON.parse(
      await readFile(path.join(repoRoot, "config", "channels.json"), "utf8")
    ) as {
      channels: Array<{
        mode: string;
        approvedScopes: string[];
        enabledByHumanAt: string | null;
      }>;
    };

    expect(
      channels.channels.every(
        (channel) =>
          channel.mode === "draft" &&
          channel.approvedScopes.length === 0 &&
          channel.enabledByHumanAt === null
      )
    ).toBe(true);
  });
});
