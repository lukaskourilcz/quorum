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

    expect(cycle.match(/- cron: "0 \d+ \* \* \*"/g)).toHaveLength(17);
    for (const hour of [3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16, 17, 18, 19, 20, 21]) {
      expect(cycle).toContain(`cron: "0 ${hour} * * *"`);
    }
    for (const hour of [4, 5, 8, 17, 18, 20]) {
      expect(cycle.match(new RegExp(`cron: "0 ${hour} \\* \\* \\*"`, "g"))).toHaveLength(1);
    }
    expect(cycle).not.toContain('timezone: "Europe/Prague"');
    expect(cycle).toContain("clock-cli.ts --scheduled");
    expect(cycle).toContain('clock-cli.ts --phase "$phase"');
    expect(cycle).not.toContain("Caught Up product remains fixture-only until the Phase 10 ledger cutover.");
    expect(cycle).toContain("CAUGHT_UP_LIVE_ENABLED");
    expect(cycle).toContain("INPUT_DELIVERY_ONLY");
    expect(cycle).toContain("Delivery-only mode requires a manual dispatch");
    expect(cycle).toContain("PORTFOLIO_LIVE_ENABLED");
    expect(cycle).toContain("FIGHTAIQ_LIVE_ENABLED");
    expect(cycle).toContain("FIGHTAIQ_ANALYSIS_ENABLED");
    expect(cycle).toContain("MMA_FILES_LIVE_ENABLED");
    expect(cycle).toContain("MMA_FILES_INDEXING_ENABLED: ${{ vars.MMA_FILES_INDEXING_ENABLED }}");
    expect(cycle).toContain("schedule-cli.ts");
    expect(cycle).toContain("pnpm digest:daily");
    expect(cycle).toContain("DAILY_DIGEST_EMAIL_MODE");
    expect(cycle).not.toContain("MEETING_EMAIL_MODE");
    expect(cycle).toContain('test "$phase" = "morning"');
    expect(cycle).toContain("actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1");
    expect(cycle).toContain("lukaskourilcz/aifirst.git");
    expect(cycle).toContain("lukaskourilcz/mma-files.git");
    expect(cycle).toContain("pnpm mma:delivery");
    expect(cycle).toContain("data/boardless/articles.json");
    expect(cycle).toContain("data/boardless/fightaiq.json");
    expect(cycle).toContain("forcing fixture-only dry mode");
    expect(cycle).toContain("contents: write");
    expect(cycle).toContain("runtime_paths=(");
    expect(cycle).toContain("state/kpis state/money state/mma state/notify state/social");
    expect(cycle).toContain("state/meeting-agendas state/priority-queue.json");
    expect(cycle).toContain(
      'test -e "$runtime_path" || git ls-files --error-unmatch -- "$runtime_path"'
    );
    expect(cycle).toContain('git add -A -- "$runtime_path"');
    expect(cycle).toContain("receipt_paths=(state/ventures/mma-files/deliveries state/ventures/fightaiq/deliveries state/release-proofs state/notify state/ventures/mma-files/PAUSED)");
    expect(cycle).toContain('git add -A -- "$receipt_path"');
    expect(cycle).not.toContain("git add state/ventures/mma-files/deliveries state/ventures/fightaiq/deliveries");
    expect(cycle).toContain("MMA Files delivery-only mode requires MMA_FILES_LIVE_ENABLED=true.");
    expect(cycle).toContain("status --porcelain --untracked-files=all");
    expect(cycle).not.toContain("git add state\n");
    expect(social).toContain('timezone: "Europe/Prague"');
    expect(social).toContain("--dry-if-disabled");
    expect(health).toContain('timezone: "Europe/Prague"');
  });

  it("keeps channel scopes inside the owner-countersigned posting-only decision", async () => {
    const channels = JSON.parse(
      await readFile(path.join(repoRoot, "config", "channels.json"), "utf8")
    ) as {
      channels: Array<{
        mode: string;
        approvedScopes: string[];
        enabledByHumanAt: string | null;
      }>;
    };

    expect(channels.channels.every((channel) =>
      channel.mode === "autopublish" &&
      channel.approvedScopes.length > 0 &&
      channel.approvedScopes.every((scope) => !/comment|reply|message|like|follow/iu.test(scope)) &&
      channel.enabledByHumanAt === "2026-08-01T00:00:00.000Z"
    )).toBe(true);
  });
});
