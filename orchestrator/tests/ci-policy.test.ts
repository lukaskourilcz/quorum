import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import {
  CRON_HOUR_CARRY,
  CRON_HOUR_CARRY_MINUTE,
  CRON_MINUTE,
  cronSlotHour,
  readVentureRegistry,
  scheduledCronExpressions
} from "../src/ventures/registry.js";

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

    expect(
      cycle.match(new RegExp(`- cron: "${CRON_MINUTE} \\d{1,2} \\* \\* \\*"`, "g"))
    ).toHaveLength(18);
    // The hours meetings BELONG to, which is the list this schedule has always been described by.
    // The cron that serves each fires CRON_HOUR_CARRY hours earlier, at CRON_MINUTE.
    for (const hour of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20]) {
      expect(cycle).toContain(`cron: "${CRON_MINUTE} ${(hour - CRON_HOUR_CARRY + 24) % 24} * * *"`);
    }
    // The fired cron is what names the meeting, so it has to reach the resolver.
    expect(cycle).toContain("EVENT_SCHEDULE: ${{ github.event.schedule }}");
    expect(cycle).toContain('--scheduled --cron "$EVENT_SCHEDULE"');
    for (const hour of [4, 5, 8, 17, 18, 20]) {
      expect(
        cycle.match(
          new RegExp(`cron: "${CRON_MINUTE} ${(hour - CRON_HOUR_CARRY + 24) % 24} \\* \\* \\*"`, "g")
        )
      ).toHaveLength(1);
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
    // Every gate that forces dry mode goes through force_dry, which on a schedule also raises
    // skip so the reason is recorded. A scheduled dry run writes only to tmp/dry-run/state and
    // is never committed, so a gate that only set dry=true ended the job green having left
    // nothing at all and the slot went red unexplained.
    expect(cycle).toContain("force_dry() {");
    // On "$scheduled" and not on the event name, because a slot is now claimed by two kinds of
    // firing: a GitHub cron, and the Vercel cron that reaches this workflow as a dispatch because
    // that is the only trigger GitHub starts promptly. A gate that forced dry on the punctual one
    // while reading github.event_name would raise no skip and leave the slot red and unexplained.
    expect(cycle).toMatch(/force_dry\(\) \{\n(?:.*\n)*?\s*if test "\$scheduled" = "true"; then\n\s*skip=true\n\s*skip_reason="\$1"/u);
    // No path may turn dry on without also raising skip, which is what makes the reason reach
    // the recorder. Checked as a property over every occurrence rather than a fixed count, so a
    // gate added later cannot reintroduce the silent shape by being new.
    const lines = cycle.split("\n");
    for (const [index, line] of lines.entries()) {
      if (line.trim() !== "dry=true") continue;
      const window = lines.slice(Math.max(0, index - 3), index + 5).join("\n");
      expect(window, `dry=true at line ${index + 1} raises no skip`).toContain("skip=true");
    }
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
    // The gate's verdict is remembered per source tree, so eighteen crons do not re-verify the
    // same bytes eighteen times. Only a pass writes the marker: a failure must be retried, not
    // inherited. What the key is made of is pinned by its own test below.
    expect(cycle).toContain("- name: Reuse the release-gate verdict for this source tree");
    // Pinned by where the write sits inside the step rather than by a character budget, which
    // a longer comment silently breaks: the marker is written once, after the else that
    // records a pass, so a failure leaves nothing behind and is retried rather than inherited.
    const gateStep = cycle.slice(
      cycle.indexOf("- name: Pre-cycle release gate\n"),
      cycle.indexOf("- name: Record that the repository gate stopped this meeting\n")
    );
    expect(gateStep.split("> .release-gate-verdict")).toHaveLength(2);
    const failBranch = gateStep.indexOf('echo "failed=true"');
    const passBranch = gateStep.indexOf('echo "failed=false"');
    expect(failBranch).toBeGreaterThan(-1);
    expect(passBranch, "the pass branch is the else").toBeGreaterThan(failBranch);
    expect(
      gateStep.indexOf("> .release-gate-verdict"),
      "only a pass may write the marker"
    ).toBeGreaterThan(passBranch);
    // Every run says which meeting it is, in the log and on the run page.
    expect(cycle).toContain("::notice title=Cycle phase::");
    expect(cycle).not.toContain("git add state\n");
    expect(social).toContain('timezone: "Europe/Prague"');
    expect(social).toContain("--dry-if-disabled");
    expect(health).toContain('timezone: "Europe/Prague"');
  });

  // GitHub runs scheduled workflows off a shared queue and says outright that high load times
  // include the start of every hour. Minute 0 is therefore the worst minute on the platform to
  // ask for, and this repository asked for it eighteen times a day: on 4 August every scheduled
  // run was delivered 2h23m to 2h55m after its cron, and on 2 August the same workflow ran 13 to
  // 54 minutes late. Moving off it does not shorten GitHub's queue — nothing here can — it only
  // stops the repository from joining the longest one. 15, 30 and 45 are the next three pile-ups
  // and are refused for the same reason.
  //
  // Asserted over every workflow file rather than the three that have crons today, so a schedule
  // added later cannot quietly land back on minute 0 by being new.
  it("keeps every schedule off the minutes GitHub is most contended on", async () => {
    const names = (await readdir(workflowRoot)).filter((name) => name.endsWith(".yml"));
    const schedules: Array<{ file: string; expression: string }> = [];
    for (const name of names) {
      const source = await readFile(path.join(workflowRoot, name), "utf8");
      for (const match of source.matchAll(/^\s*- cron: "([^"]+)"/gmu)) {
        schedules.push({ file: name, expression: match[1]! });
      }
    }
    expect(schedules.length, "no schedules found; the cron guard is asserting nothing").toBe(20);

    for (const { file, expression } of schedules) {
      const minute = expression.trim().split(/\s+/u)[0]!;
      expect(
        ["0", "15", "30", "45"],
        `${file}: "${expression}" fires on a minute GitHub is most contended on`
      ).not.toContain(minute);
      // One minute across every workflow, so the arrangement stays uniform and the hour a cron
      // fires in is always exactly CRON_HOUR_CARRY behind the hour it serves.
      expect(
        Number(minute),
        `${file}: "${expression}" does not use CRON_MINUTE, so the hour-to-slot mapping stops being obvious`
      ).toBe(CRON_MINUTE);
    }
  });

  // The minute and the hour are one decision, not two. CRON_MINUTE sits past the carry boundary,
  // which is what makes a cron belong to the hour AFTER the one it fires in, and cronPayloads
  // subtracts that same carry when it writes the hour. Move one without the other and every
  // meeting shifts by an hour — silently, because the resolver reads the schedule back out of the
  // same registry that wrote it, so both sides move together and agree with the mistake. These
  // assertions are the independent check: the constants must stay consistent with each other, and
  // the deployed workflow must hold exactly what the generator produces.
  it("pins the minute and the hour carry to each other and to the deployed schedule", async () => {
    expect(
      CRON_MINUTE >= CRON_HOUR_CARRY_MINUTE,
      "CRON_MINUTE below the boundary means crons fire inside the hour they serve"
    ).toBe(true);
    expect(CRON_HOUR_CARRY, "the carry must follow from CRON_MINUTE, never be set by hand").toBe(1);
    // Stated as an instance rather than by re-deriving it: a cron firing at CRON_MINUTE of hour 2
    // serves hour 3. Re-running cronSlotHour's own arithmetic here would assert nothing.
    expect(cronSlotHour(2, CRON_MINUTE)).toBe(3);
    expect(cronSlotHour(23, CRON_MINUTE), "the carry wraps at midnight").toBe(0);

    const cycle = await readFile(path.join(workflowRoot, "cycle.yml"), "utf8");
    const deployed = [...cycle.matchAll(/^\s*- cron: "([^"]+)"/gmu)].map((match) => match[1]!);
    expect(
      [...deployed].sort(),
      "cycle.yml and cronPayloads disagree about when the council meets"
    ).toEqual([...scheduledCronExpressions(readVentureRegistry())].sort());
  });

  it("keys the release-gate verdict on content, not on the moving cycle sha", async () => {
    const cycle = await readFile(path.join(workflowRoot, "cycle.yml"), "utf8");

    const start = cycle.indexOf("- name: Reuse the release-gate verdict for this source tree\n");
    expect(start, "the release-gate cache step is missing from cycle.yml").toBeGreaterThan(-1);
    const rest = cycle.slice(start);
    const end = rest.indexOf("\n      - name: ", 1);
    const step = end === -1 ? rest : rest.slice(0, end);
    // The `key:` line plus every line folded into its block scalar.
    const key = step.match(/^ {10}key:.*(?:\n {11,}.*)*/mu)?.[0] ?? "";
    expect(key, "the cache step has no key").toContain("hashFiles(");

    // The bug this pins. Every successful cycle pushes a cycle(NNN) commit, so github.sha
    // is different on nearly every cron and a sha-keyed entry was almost never reused —
    // which is the exact re-running this step was added to stop.
    expect(key, "github.sha changes on every cycle commit, so it can never hit").not.toContain(
      "github.sha"
    );
    // A prefix restore would hand this commit a verdict earned by different bytes.
    expect(
      step.match(/^\s*restore-keys:/mu),
      "restore-keys would inherit a pass the current content never earned"
    ).toBeNull();

    const args = key.match(/hashFiles\(([\s\S]*?)\)\s*\}\}/u)?.[1] ?? "";
    const patterns = [...args.matchAll(/'([^']+)'/gu)].flatMap((match) => match[1] ?? []);
    expect(patterns.length).toBeGreaterThan(10);

    // hashFiles has no exclude, so every pattern has to be anchored somewhere that holds
    // only checked-in source. A leading ** reaches both state/ and node_modules/.
    for (const pattern of patterns) {
      expect(
        pattern.startsWith("*"),
        `${pattern} is unanchored and would reach state/ and node_modules/`
      ).toBe(false);
      expect(
        pattern.split("/")[0],
        `${pattern} lets cycle-written state decide the gate verdict`
      ).not.toBe("state");
      expect(pattern, `${pattern} would hash installed dependencies`).not.toContain(
        "node_modules"
      );
    }

    // What the gate actually reads has to be in the key, or a real source change inherits
    // a stale pass.
    for (const required of [
      "package.json",
      "pnpm-lock.yaml",
      "config/**",
      "contracts/**",
      ".github/workflows/**"
    ]) {
      expect(patterns, `${required} decides whether this tree passes`).toContain(required);
    }
    for (const root of ["orchestrator/src/", "orchestrator/tests/", "site/src/"]) {
      expect(
        patterns.some((pattern) => pattern.startsWith(root)),
        `${root} is source the gate compiles and runs`
      ).toBe(true);
    }
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

  // The owner doubled four caps on 2026-08-04 for the rest of that week, because testing rather
  // than production work was spending them and a cap hit was stopping articles from shipping:
  // that day's edition run billed three calls for about $0.25 and produced no article, because
  // rewrite_2 could not start against the $0.35 edition cap.
  //
  // The 2026-08-09 revert restores the four `original` values in cycle.yml and deletes the
  // temporaryCaps list below; the workflow and this list have to move together, so a
  // half-finished revert fails here rather than sitting on main. The two monthly assertions at
  // the end are permanent and outlive the revert.
  it("documents the temporarily doubled caps and holds the monthly ceiling still", async () => {
    const cycle = await readFile(path.join(workflowRoot, "cycle.yml"), "utf8");

    // Anchored at the job env's exact indentation, so a mention inside a comment or a shell
    // line cannot answer for the value the runner actually exports.
    const valueOf = (key: string): string => {
      const match = cycle.match(new RegExp(`^ {6}${key}: "([^"]*)"`, "mu"));
      expect(match, `${key} is missing from the cycle.yml job env`).not.toBeNull();
      return match?.[1] ?? "";
    };
    const lineOf = (key: string): string =>
      cycle.split("\n").find((line) => line.startsWith(`      ${key}:`)) ?? "";

    const temporaryCaps = [
      { key: "MAX_CYCLE_BUDGET_USD", original: "0.20", doubled: "0.40" },
      { key: "CU_MEETING_BUDGET_USD", original: "0.08", doubled: "0.16" },
      { key: "EDITION_PRODUCTION_BUDGET_USD", original: "0.35", doubled: "0.70" },
      { key: "DAILY_BUDGET_USD", original: "1.00", doubled: "2.00" }
    ];
    for (const { key, original, doubled } of temporaryCaps) {
      // What the owner approved was a doubling. Pinning the arithmetic means a later edit
      // cannot push a cap to four times its original while still claiming "was 0.20".
      expect(Number(doubled), `${key}: the approved raise is exactly double`).toBeCloseTo(
        Number(original) * 2,
        8
      );
      expect(valueOf(key), `${key} is not the value the owner approved`).toBe(doubled);
      // A temporary value that does not say what it was and when it goes back is a permanent
      // value nobody remembers approving.
      expect(lineOf(key), `${key} must name the value it reverts to`).toContain(`was "${original}"`);
      expect(lineOf(key), `${key} must name its revert date`).toContain("2026-08-09");
    }

    // Permanent, and the point of the whole block. budget-2026-08e's $25 model/API share and $30
    // all-in cap are the ceiling the owner countersigned and deliberately did not move; a per-run
    // cap rising must never carry the month up with it, on this raise or a later one.
    expect(valueOf("MONTHLY_BUDGET_USD"), "the monthly model/API share may not move here").toBe(
      "25"
    );
    expect(
      valueOf("MONTHLY_OPERATING_CAP_USD"),
      "the all-in operating cap may not move here"
    ).toBe("30");
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
