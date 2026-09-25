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
  deployedCronExpressions,
  scheduledCronExpressions
} from "../src/ventures/registry.js";

const workflowRoot = path.join(repoRoot, ".github", "workflows");

describe("automation policy", () => {
  it("delivers DNESKAi from the scheduled day run as well as the retry", async () => {
    // quorum#555: the 05:00 Prague dispatch is `cu-day`. Delivery keyed on `cu-edition` alone
    // reached the magazine only when the 09:00 retry ran to the end, and four September days whose
    // retry failed were never delivered.
    const cycle = await readFile(path.join(workflowRoot, "cycle.yml"), "utf8");
    const decision = cycle.slice(
      cycle.indexOf("          caught_up_delivery=false"),
      cycle.indexOf('echo "caught_up_delivery=$caught_up_delivery" >> "$GITHUB_OUTPUT"')
    );
    expect(decision).toContain('test "$phase" = "cu-day"');
    expect(decision).toContain('test "$phase" = "cu-edition"');
    const step = (name: string) => {
      const start = cycle.indexOf(`      - name: ${name}\n`);
      expect(start, `${name} is missing`).toBeGreaterThan(-1);
      return cycle.slice(start, cycle.indexOf("\n      - name: ", start + 1));
    };
    for (const name of ["Select the oldest Caught Up delivery", "Mint bounded aifirst token for the stream and event sync"]) {
      const gate = step(name);
      expect(gate, name).toContain("steps.mode.outputs.caught_up_delivery == 'true'");
      expect(gate, name).not.toContain("steps.mode.outputs.phase == 'cu-edition'");
    }
    const deliveryOnlyGate = cycle.slice(
      cycle.indexOf('          if test "$delivery_only" = "true"; then'),
      cycle.indexOf("          # The double-fire guard")
    );
    expect(deliveryOnlyGate).toContain('test "$phase" = "cu-day" || test "$phase" = "cu-edition"');
  });

  it("pins every third-party action to an immutable commit", async () => {
    const names = (await readdir(workflowRoot)).filter((name) => name.endsWith(".yml"));
    expect(names.sort()).toEqual([
      "ci.yml",
      "cycle.yml",
      "delivery-doctor.yml",
      "health.yml",
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

    // A handful of backstop sweeps, not one cron per slot. The Vercel dispatch is the punctual
    // path that names a slot; GitHub's schedule is the backup that arrives hours late, and
    // eighteen of them were being billed like primaries. deployedCronExpressions is the
    // generator, and the workflow must hold exactly what it produces and nothing else.
    expect(
      cycle.match(new RegExp(`- cron: "${CRON_MINUTE} \\d{1,2} \\* \\* \\*"`, "g"))
    ).toHaveLength(deployedCronExpressions().length);
    for (const expression of deployedCronExpressions()) {
      expect(cycle.match(new RegExp(`- cron: "${expression.replace(/\*/gu, "\\*")}"`, "g")), expression)
        .toHaveLength(1);
    }
    // A sweep names no slot of its own, so it asks the registry and the records which one to
    // rescue. The per-cron resolver is gone with the per-slot crons.
    expect(cycle).toContain("sweep-cli.ts");
    expect(cycle).not.toContain('--scheduled --cron "$EVENT_SCHEDULE"');
    expect(cycle).not.toContain('timezone: "Europe/Prague"');
    expect(cycle).toContain('clock-cli.ts --phase "$phase"');
    expect(cycle).not.toContain("Caught Up product remains fixture-only until the Phase 10 ledger cutover.");
    expect(cycle).toContain("CAUGHT_UP_LIVE_ENABLED");
    expect(cycle).toContain("INPUT_DELIVERY_ONLY");
    expect(cycle).toContain("Delivery-only mode requires a manual dispatch");
    expect(cycle).toContain("PORTFOLIO_LIVE_ENABLED");
    const portfolioModeGate = cycle.split("\n").find((line) =>
      line.includes('test "$PORTFOLIO_LIVE_ENABLED" != "true"')
    );
    expect(portfolioModeGate).toBeDefined();
    const portfolioGateStart = cycle.lastIndexOf("\n", cycle.indexOf(portfolioModeGate!));
    const portfolioGateContext = cycle.slice(Math.max(0, portfolioGateStart - 500), cycle.indexOf(portfolioModeGate!) + portfolioModeGate!.length);
    expect(portfolioGateContext).toContain('test "$phase" = "bh-desk"');
    const dispatchOptions = cycle.slice(
      cycle.indexOf("        options:\n"),
      cycle.indexOf("      trigger:\n")
    );
    const portfolioGateLine = cycle.split("\n").find((line) =>
      line.includes('test "$dry" != "true"') && line.includes('test "$phase" = "bh-desk"')
    );
    expect(portfolioGateLine).toBeDefined();
    // The dispatch options follow the registry (operations-2026-09b): every running venture's day
    // and rooms are offered, a paused venture's are not, and the company's own shifts always are.
    // The portfolio budget gate keeps naming paused rooms, so a resumed room is gated at once.
    const offered = [...dispatchOptions.matchAll(/^ {10}- ([a-z-]+)$/gmu)].map(([, phase]) => phase!);
    const registry = readVentureRegistry();
    const phasesOf = (venture: (typeof registry.ventures)[number]) => [
      ...(venture.day ? [venture.day.kind, ...venture.day.steps] : []),
      ...venture.meetings.map((meeting) => meeting.kind)
    ];
    const running = new Set(registry.ventures.filter((venture) => venture.status !== "paused").flatMap(phasesOf));
    const paused = new Set(registry.ventures.filter((venture) => venture.status === "paused").flatMap(phasesOf));
    expect(new Set(offered)).toEqual(new Set([...running, "morning", "afternoon", "night"]));
    for (const phase of paused) expect(offered, `${phase} belongs to a paused venture`).not.toContain(phase);
    for (const phase of ["bh-desk", "dm-desk", "dm-growth", "ts-desk", "kv-desk"]) {
      expect(portfolioGateLine).toContain(`test "$phase" = "${phase}"`);
    }
    const deliveryOnlyGate = cycle.slice(
      cycle.indexOf('          if test "$delivery_only" = "true"; then'),
      cycle.indexOf("          # The double-fire guard")
    );
    expect(deliveryOnlyGate).not.toMatch(/(?:bh|dm|ts|kv)-(?:desk|growth)/u);
    // MMA Files and FightAIQ are paused (operations-2026-09b): their live switches, their site and
    // indexing variables and their delivery block left the workflow with them, so nothing in this
    // job can reach that magazine. Resuming them restores all of it from history.
    for (const gone of ["FIGHTAIQ_LIVE_ENABLED", "FIGHTAIQ_ANALYSIS_ENABLED", "MMA_FILES_LIVE_ENABLED", "MMA_FILES_INDEXING_ENABLED", "MMA_FILES_SITE_URL"]) {
      expect(cycle, gone).not.toContain(`${gone}: \${{`);
    }
    const editionOverride =
      "CYCLE_FORCE_NEW_EDITION: ${{ github.event_name == 'workflow_dispatch' && inputs.phase == 'cu-edition' && inputs.dry == false && inputs.trigger != 'vercel-cron' }}";
    expect(cycle.split(editionOverride)).toHaveLength(2);
    const runCycleStart = cycle.indexOf("- name: Run cycle\n");
    const runCycleEnd = cycle.indexOf("\n      - name: ", runCycleStart + 1);
    expect(cycle.slice(runCycleStart, runCycleEnd)).toContain(editionOverride);
    expect(cycle).toContain("schedule-cli.ts");
    expect(cycle).toContain("pnpm digest:daily");
    expect(cycle).toContain("DAILY_DIGEST_EMAIL_MODE");
    expect(cycle).not.toContain("MEETING_EMAIL_MODE");
    expect(cycle).toContain('test "$phase" = "morning"');
    expect(cycle).toContain("actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1");
    expect(cycle).toContain("lukaskourilcz/aifirst.git");
    expect(cycle).not.toContain("lukaskourilcz/mma-files.git");
    expect(cycle).not.toContain("pnpm mma:delivery");
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
    expect(cycle).toContain("state/kpis state/money state/mma state/marketingshark state/notify state/social");
    // Every directory a scheduled phase writes has to be in this list or the run ends green with
    // nothing committed. marketingShark's dedupe ledger lives outside state/ventures, so its
    // absence would have re-served the same question every morning while the packages piled up.
    expect(cycle).toContain("state/marketingshark");
    // GoVIRAL's trend snapshots and its Apify quota counter live in state/goviral, which was never
    // on this list: the Monday room ran live with the scout on 7 and 14 September, paid for its
    // seats, and every snapshot it wrote died with the runner. Without a committed snapshot the
    // admin panel says the token is missing, week-over-week deltas stay null and the stale-week
    // fallback can never fire. Kvórum's desk writes state/kvorum the same way.
    expect(cycle).toContain("state/goviral state/kvorum");
    expect(cycle).toContain("state/meeting-agendas state/priority-queue.json");
    // The same class again, and the longest-lived instance of it. `collectOwnerAttention` runs on
    // every non-dry phase and its path was never in this list, so the file was rebuilt in the
    // runner's tree and thrown away with the container every time. The only commit that ever
    // touched it was a hand-authored docs change, which is why the admin's approvals view spent
    // fifteen days telling the owner about a picture of the portfolio that had already moved on.
    // The operations and programs snapshots were absent for the same reason and had never been
    // committed at all, so two more admin surfaces read nothing.
    expect(cycle).toContain("state/owner-attention.json");
    expect(cycle).toContain("state/operations");
    expect(cycle).toContain("state/programs");
    expect(cycle).toContain(
      'test -e "$runtime_path" || git ls-files --error-unmatch -- "$runtime_path"'
    );
    expect(cycle).toContain('git add -A -- "$runtime_path"');
    // state/INBOX.md is on every receipt list. The shared fail-closed writer appends an owner
    // line, and the MMA step used to leave it unstaged, so a reverted article's inbox item died
    // with the runner. That step left with MMA Files (operations-2026-09b); the rule stays.
    for (const list of cycle.match(/receipt_paths=\([^)]*\)/gu) ?? []) {
      expect(list, "every fail-closed receipt list stages the inbox").toContain("state/INBOX.md");
    }
    expect(cycle).toContain('git add -A -- "$receipt_path"');
    expect(cycle).not.toContain("git add state/ventures/mma-files/deliveries state/ventures/fightaiq/deliveries");
    expect(cycle).not.toContain("MMA Files delivery-only mode");
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
    // GitHub reads every cron as UTC and ignores a `timezone:` key under `on.schedule`, so the
    // two workflows carrying one were documenting a behaviour they did not have. The cycle
    // workflow already handled Prague by pairing DST cron variants, and these two do not need to.
    expect(social).not.toContain("timezone:");
    expect(social).toContain("--dry-if-disabled");
    // Hourly, the publisher paid about 4.3 billable minutes of checkout and install to confirm
    // that every channel is still switched off — roughly 1,600 minutes a month for an answer
    // the kill switch already knows. The schedule stays commented out until a channel exists,
    // and the job-level guard is what makes a locked scheduled hour cost nothing when it does:
    // a step-level check has already paid for the runner.
    expect(social).not.toMatch(/^\s*schedule:/mu);
    expect(social).toContain("if: ${{ github.event_name != 'schedule' || vars.SOCIAL_KILL_SWITCH != 'true' }}");
    expect(health).not.toContain("timezone:");
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
  // The council pushes about eighteen commits a day. Every one that touches only what a cycle
  // writes, or only prose, is covered by the gate that produced it or verifies nothing — and
  // each of those was starting a full CI run. What must never be filtered is a prompt: it is
  // read into a live room, so changing one changes what the company does.
  it("skips CI for pushes that cannot change behaviour, and never for a prompt or a mirrored skill", async () => {
    const ci = await readFile(path.join(workflowRoot, "ci.yml"), "utf8");
    const pushBlock = ci.slice(ci.indexOf("  push:"), ci.indexOf("  pull_request:"));

    for (const ignored of ["state/**", "docs/**", "*.md", "site/public/social/**"]) {
      expect(pushBlock, `${ignored} should not start a CI run`).toContain(`"${ignored}"`);
    }
    expect(pushBlock).not.toContain("orchestrator/prompts");
    expect(pushBlock).not.toContain("orchestrator/src");
    expect(pushBlock).not.toContain("config/");
    // The two skill trees are mirrored byte-for-byte and architecture.test.ts compares them file
    // by file, so editing one without the other is a real, testable break. Filtering them out
    // would hide precisely the mistake the drift test exists to catch, and there are nineteen
    // mirrored skills now rather than eleven.
    expect(pushBlock, ".claude/** can break the mirror test").not.toContain('".claude/**"');
    expect(pushBlock, ".agents/** can break the mirror test").not.toContain('".agents/**"');
    // Pull requests are never filtered: a human change is verified exactly as before.
    expect(ci).toMatch(/^\s{2}pull_request:\s*$/mu);
  });

  it("keeps every schedule off the minutes GitHub is most contended on", async () => {
    const names = (await readdir(workflowRoot)).filter((name) => name.endsWith(".yml"));
    const schedules: Array<{ file: string; expression: string }> = [];
    for (const name of names) {
      const source = await readFile(path.join(workflowRoot, name), "utf8");
      for (const match of source.matchAll(/^\s*- cron: "([^"]+)"/gmu)) {
        schedules.push({ file: name, expression: match[1]! });
      }
    }
    // 18, not 19: the hourly social publisher is commented out until a channel exists, so its
    // twenty-four daily firings no longer confirm there is nothing to publish.
    // The backstop sweeps in cycle.yml, one daily health run, and nothing else: the social
    // publisher's hourly schedule is commented out until a channel exists.
    expect(schedules.length, "no schedules found; the cron guard is asserting nothing")
      .toBe(deployedCronExpressions().length + 1);

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
      "cycle.yml and deployedCronExpressions disagree about the backstop sweeps"
    ).toEqual([...deployedCronExpressions()].sort());
    // The per-slot expressions still exist and still drive the Vercel side; what changed is that
    // GitHub no longer deploys them.
    expect(scheduledCronExpressions(readVentureRegistry()).length).toBeGreaterThan(deployed.length);
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

  // An ambiguous or refused post exits 2. When that exit failed the publish step, GitHub skipped the
  // validate and commit steps, so the run's needs_reconciliation status, its receipts and its
  // pauses died with the runner, and the next approval's dispatch found the post still queued and
  // sent it again (quorum#574 review). The exit code is recorded, the state is validated and
  // committed, and only the last step fails the job.
  it("commits the publisher's state before it fails the job for a post that needs the owner", async () => {
    const social = await readFile(path.join(workflowRoot, "social-publisher.yml"), "utf8");
    const stepNames = [...social.matchAll(/^ {6}- name: (.+)$/gmu)].map(([, name]) => name!);
    const order = [
      "Run two-phase publisher",
      "Validate publisher state",
      "Commit immutable queue state and receipts",
      "Fail when a post needs the owner"
    ];
    const positions = order.map((name) => stepNames.indexOf(name));
    for (const [index, name] of order.entries()) expect(positions[index], `${name} is missing`).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b), "the publisher's steps are out of order").toEqual(positions);
    expect(positions.at(-1), "failing the job is the last thing the run does").toBe(stepNames.length - 1);

    const step = (name: string): string => {
      const start = social.indexOf(`      - name: ${name}\n`);
      const end = social.indexOf("\n      - name: ", start + 1);
      return social.slice(start, end === -1 ? undefined : end);
    };
    const condition = (name: string): string => step(name).match(/^ {8}if: (.*)$/mu)?.[1] ?? "";

    const publish = step("Run two-phase publisher");
    expect(publish).toContain("|| status=$?");
    expect(publish).toContain('echo "exit_code=$status" >> "$GITHUB_OUTPUT"');
    expect(publish).not.toMatch(/^\s+exit /mu);
    for (const name of ["Validate publisher state", "Commit immutable queue state and receipts"]) {
      const gate = condition(name);
      expect(gate, `${name} must run after the publisher reported a post that needs the owner`).toContain("!cancelled()");
      expect(gate, `${name} would be skipped by the failure it has to record`).not.toMatch(/(?<![!\w])success\(\)/u);
    }
    expect(condition("Fail when a post needs the owner")).toContain("steps.publish.outputs.exit_code != '0'");
    expect(step("Fail when a post needs the owner")).toContain('exit "$PUBLISH_EXIT_CODE"');
  });

  // The 2026-08-04 doubling is reverted, with one correction the owner made when it came due:
  // the edition per-run cap settles at $0.50 rather than the $0.35 it was doubled from. Source
  // bodies made write and rewrite calls $0.10-0.12 each, so curate + write + two configured
  // rewrites is $0.38-0.45 -- above $0.35 before the first rewrite starts, and reserve refusals
  // were the most frequent edition-killer on 1, 2 and 4 August. The monthly assertions below are
  // permanent and are what the caps above may never move.
  it("holds the per-run caps at their settled values and the monthly ceiling still", async () => {
    const cycle = await readFile(path.join(workflowRoot, "cycle.yml"), "utf8");

    // Anchored at the job env's exact indentation, so a mention inside a comment or a shell
    // line cannot answer for the value the runner actually exports.
    const valueOf = (key: string): string => {
      const match = cycle.match(new RegExp(`^ {6}${key}: "([^"]*)"`, "mu"));
      expect(match, `${key} is missing from the cycle.yml job env`).not.toBeNull();
      return match?.[1] ?? "";
    };

    expect(valueOf("MAX_CYCLE_BUDGET_USD")).toBe("0.20");
    expect(valueOf("CU_MEETING_BUDGET_USD")).toBe("0.08");
    expect(valueOf("DAILY_BUDGET_USD")).toBe("1.00");
    // The one raised value, and the config the runtime parses has to agree with it: the
    // workflow exports the cap and edition-quality.json is what the estimator reserves
    // against, so a half-finished change fails here rather than at 05:00.
    expect(valueOf("EDITION_PRODUCTION_BUDGET_USD")).toBe("0.50");
    const editionQuality = JSON.parse(
      await readFile(path.join(repoRoot, "config", "edition-quality.json"), "utf8")
    ) as { budgets: { editionProductionUsd: number; maximumRegenerationAttemptsPerDate: number } };
    expect(editionQuality.budgets.editionProductionUsd).toBe(0.5);
    // The cap was raised to make the second rewrite affordable, not to allow a third.
    expect(editionQuality.budgets.maximumRegenerationAttemptsPerDate).toBe(2);

    // The model/API share stays fixed while budget-2026-08f independently raises the all-in cap.
    // A per-run cap must never move either monthly value without its own authority record.
    expect(valueOf("MONTHLY_BUDGET_USD"), "the monthly model/API share may not move here").toBe(
      "25"
    );
    expect(
      valueOf("MONTHLY_OPERATING_CAP_USD"),
      "the all-in operating cap may not move here"
    ).toBe("50");
  });

  it("keeps channel scopes inside the owner-countersigned posting-only decision", async () => {
    const channels = JSON.parse(
      await readFile(path.join(repoRoot, "config", "channels.json"), "utf8")
    ) as {
      channels: Array<{
        id: string;
        mode: string;
        approvedScopes: string[];
        enabledByHumanAt: string | null;
      }>;
    };

    // Both Meta channels and, since quorum#569, the LinkedIn channel. Each is named so that
    // removing a channel cannot make the draft assertion below pass vacuously.
    expect(channels.channels.map(({ id }) => id).sort()).toEqual(["instagram", "linkedin", "threads"]);

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
