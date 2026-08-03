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
      "delivery-doctor.yml",
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

    expect(cycle.match(/- cron: "0 \d{1,2} \* \* \*"/g)).toHaveLength(18);
    for (const hour of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20]) {
      expect(cycle).toContain(`cron: "0 ${hour} * * *"`);
    }
    // The fired cron is what names the meeting, so it has to reach the resolver.
    expect(cycle).toContain("EVENT_SCHEDULE: ${{ github.event.schedule }}");
    expect(cycle).toContain('--scheduled --cron "$EVENT_SCHEDULE"');
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
    // state/INBOX.md is on both receipt lists. The shared fail-closed writer appends an owner
    // line for either venture, and the MMA step used to leave it unstaged, so a reverted
    // article's inbox item died with the runner.
    expect(cycle).toContain("receipt_paths=(state/ventures/mma-files/deliveries state/ventures/fightaiq/deliveries state/release-proofs state/notify state/ventures/mma-files/PAUSED state/INBOX.md)");
    for (const list of cycle.match(/receipt_paths=\([^)]*\)/gu) ?? []) {
      expect(list, "every fail-closed receipt list stages the inbox").toContain("state/INBOX.md");
    }
    expect(cycle).toContain('git add -A -- "$receipt_path"');
    expect(cycle).not.toContain("git add state/ventures/mma-files/deliveries state/ventures/fightaiq/deliveries");
    expect(cycle).toContain("MMA Files delivery-only mode requires MMA_FILES_LIVE_ENABLED=true.");
    expect(cycle).toContain("status --porcelain --untracked-files=all");
    // Every push retry rebases with --autostash. The cycle commits only its allowlisted paths,
    // so anything else the run touched is left unstaged, and a plain rebase refuses to start —
    // which discarded a company meeting that had already run and already been paid for.
    // Asserted as a property rather than a count: every rebase in every workflow carries
    // --autostash. Pinning the number meant adding a retry loop failed this test for being new,
    // which says nothing about whether the loop is safe.
    for (const [name, workflow] of [["cycle", cycle], ["social", social], ["health", health]] as const) {
      const rebases = workflow.match(/git (?:-C "[^"]+" )?rebase [^\n]*/gu) ?? [];
      for (const line of rebases) {
        if (line.includes("--abort")) continue;
        expect(line, `${name}.yml rebases without --autostash: ${line}`).toContain("--autostash");
      }
    }
    expect((cycle.match(/git rebase --autostash/gu) ?? []).length).toBeGreaterThanOrEqual(6);
    // A failing release gate records why the room did not open, rather than ending the job on
    // the spot and leaving the calendar to show a red meeting that never ran.
    expect(cycle).toContain("Record that the repository gate stopped this meeting");
    expect(cycle).toContain("Stop when the release gate failed");
    // A run that dies for any other reason also says so on the calendar. Three runs failed on
    // 3 August and every one of them left a red slot with nothing anywhere explaining it.
    expect(cycle).toContain("Say on the calendar why this run did not finish");
    // The gate's verdict is remembered per commit, so eighteen crons do not re-verify the same
    // bytes eighteen times. Only a pass writes the marker: a failure must be retried, not
    // inherited.
    expect(cycle).toContain("release-gate-v1-${{ github.sha }}");
    expect(cycle).toMatch(/failed=false[\s\S]{0,400}\.release-gate-verdict/u);
    expect(cycle).not.toMatch(/failed=true[\s\S]{0,200}> \.release-gate-verdict/u);
    // Every run says which meeting it is, in the log and on the run page.
    expect(cycle).toContain("::notice title=Cycle phase::");
    expect(cycle).not.toContain("git add state\n");
    expect(social).toContain('timezone: "Europe/Prague"');
    expect(social).toContain("--dry-if-disabled");
    expect(health).toContain('timezone: "Europe/Prague"');
  });

  it("keeps the two failure-path steps reachable on the runs they exist for", async () => {
    const cycle = await readFile(path.join(workflowRoot, "cycle.yml"), "utf8");

    const conditionFor = (stepName: string): string => {
      const start = cycle.indexOf(`- name: ${stepName}\n`);
      expect(start, `${stepName} is missing from cycle.yml`).toBeGreaterThan(-1);
      const block = cycle.slice(start);
      const end = block.indexOf("\n      - name: ", 1);
      const step = end === -1 ? block : block.slice(0, end);
      const condition = step.match(/^ {8}if: (.*)$/mu);
      expect(condition, `${stepName} has no if: condition`).not.toBeNull();
      return condition?.[1] ?? "";
    };

    // "Run cycle" captures the cycle's exit status and returns 0 on every path, so its
    // outcome is 'success' even for a cycle that failed. A calendar note gated on
    // steps.run.outcome was therefore unreachable for precisely the runs it exists for. The
    // output the step deliberately writes is the only usable signal: 'true' when the cycle
    // failed, 'false' when it finished, empty when an earlier step failed and it never ran.
    expect(cycle).toMatch(
      /cycle_status" -eq 0; then\s+echo "failed=false"[\s\S]{0,80}else\s+echo "failed=true"/u
    );
    const calendarIf = conditionFor("Say on the calendar why this run did not finish");
    expect(calendarIf).toContain("failure()");
    expect(calendarIf).toContain("steps.run.outputs.failed != 'false'");
    expect(calendarIf, "outcome is always 'success' here; it can gate nothing").not.toContain(
      "steps.run.outcome"
    );

    // The ledger commit is a failure path. Under always() it fired on healthy runs too and
    // pushed state to main before the post-cycle gate had passed on it.
    const spendIf = conditionFor("Record spend from a failed cycle");
    expect(spendIf, "a healthy run must not push state ahead of the gate").not.toContain(
      "always()"
    );
    expect(spendIf).toContain("failure()");
    expect(spendIf).toContain("steps.run.outputs.failed == 'true'");
    expect(spendIf).toContain("steps.mode.outputs.dry != 'true'");

    // Order is part of the guarantee. Standing after the post-cycle gate and the smoke test,
    // it also catches a cycle that exited 0, billed for calls and then tripped one of them;
    // standing before the calendar note, it commits the ledger before that step's
    // `git reset --hard` would discard it.
    const at = (stepName: string): number => {
      const index = cycle.indexOf(`- name: ${stepName}\n`);
      expect(index, `${stepName} is missing from cycle.yml`).toBeGreaterThan(-1);
      return index;
    };
    expect(at("Record spend from a failed cycle")).toBeGreaterThan(at("Post-cycle release gate"));
    expect(at("Record spend from a failed cycle")).toBeGreaterThan(
      at("Production route and link smoke")
    );
    expect(at("Record spend from a failed cycle")).toBeLessThan(
      at("Commit one atomic runtime cycle")
    );
    expect(at("Record spend from a failed cycle")).toBeLessThan(
      at("Say on the calendar why this run did not finish")
    );
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

    // The scope guard holds in every mode: a stored scope must never reach beyond
    // posting, whatever the channel is currently allowed to do.
    expect(channels.channels.every((channel) =>
      channel.approvedScopes.length > 0 &&
      channel.approvedScopes.every((scope) => !/comment|reply|message|like|follow/iu.test(scope))
    )).toBe(true);

    // social-2026-08a pauses distribution until each magazine has rendered ten articles.
    // Draft with no human enablement is the strictly safer state, and channel-registry.ts
    // refuses to publish unless mode is autopublish AND enabledByHumanAt is set, so both
    // fields are pinned rather than just one.
    expect(channels.channels.every((channel) =>
      channel.mode === "draft" && channel.enabledByHumanAt === null
    )).toBe(true);
  });
});
