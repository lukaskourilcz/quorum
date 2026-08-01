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

    expect(cycle.match(/- cron: "0 \d+ \* \* \*"/g)).toHaveLength(28);
    for (const hour of [3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16, 17, 18, 19, 20, 21]) {
      expect(cycle).toContain(`cron: "0 ${hour} * * *"`);
    }
    expect(cycle.match(/cron: "0 4 \* \* \*"/g)).toHaveLength(2);
    expect(cycle.match(/cron: "0 5 \* \* \*"/g)).toHaveLength(2);
    expect(cycle.match(/cron: "0 20 \* \* \*"/g)).toHaveLength(2);
    expect(cycle.match(/cron: "0 8 \* \* \*"/g)).toHaveLength(2);
    expect(cycle.match(/cron: "0 17 \* \* \*"/g)).toHaveLength(2);
    expect(cycle.match(/cron: "0 18 \* \* \*"/g)).toHaveLength(2);
    expect(cycle).not.toContain('timezone: "Europe/Prague"');
    expect(cycle).toContain("clock-cli.ts --scheduled");
    expect(cycle).toContain('clock-cli.ts --phase "$phase"');
    expect(cycle).not.toContain("Caught Up product remains fixture-only until the Phase 10 ledger cutover.");
    expect(cycle).toContain("CAUGHT_UP_LIVE_ENABLED");
    expect(cycle).toContain("PORTFOLIO_LIVE_ENABLED");
    expect(cycle).toContain("FIGHTAIQ_LIVE_ENABLED");
    expect(cycle).toContain("FIGHTAIQ_ANALYSIS_ENABLED");
    expect(cycle).toContain("MMA_FILES_LIVE_ENABLED");
    expect(cycle).toContain("schedule-cli.ts");
    expect(cycle).toContain("pnpm digest:daily");
    expect(cycle).toContain("DAILY_DIGEST_EMAIL_MODE");
    expect(cycle).not.toContain("MEETING_EMAIL_MODE");
    expect(cycle).toContain('test "$phase" = "morning"');
    expect(cycle).toContain("actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1");
    expect(cycle).toContain("lukaskourilcz/aifirst.git");
    expect(cycle).toContain("forcing fixture-only dry mode");
    expect(cycle).toContain("contents: write");
    expect(cycle).toContain("runtime_paths=(");
    expect(cycle).toContain("state/mma state/notify state/social");
    expect(cycle).toContain(
      'test -e "$runtime_path" || git ls-files --error-unmatch -- "$runtime_path"'
    );
    expect(cycle).toContain('git add -A -- "$runtime_path"');
    expect(cycle).not.toContain("git add state\n");
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
