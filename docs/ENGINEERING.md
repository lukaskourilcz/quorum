# The engineering contract

One ruleset, written once, the same in every repository this owner runs. Each rule carries the
incident that created it — a rule whose reason has been forgotten is followed until it is
inconvenient and then dropped.

Where a generic recommendation and a rule here disagree, this file wins. Where this file and a
documented product invariant disagree, the invariant wins and this file gets amended.

## Architecture and data

**1. Schema-first boundaries.** Every artifact that crosses a boundary has a versioned contract in
`contracts/`. Readers parse-or-drop, count what they dropped, and say so; nothing throws on bad
data. *Why:* one malformed idea in an append-only ledger used to return `null` for the whole file,
which took `/admin` down until somebody hand-edited state.

**2. Recorded, not re-derived.** A model's verdict and anything delivered are written once and read
back forever. *Why:* `orchestrator/src/images/verdict-store.ts` states it in its own header — a
model asked twice can answer differently, so a re-derived record shows the owner a decision that
was never made.

**3. One writer per state path.** Append-only ledgers, atomic writes, and an idempotency key on
anything a retry could double-write. *Why:* the launch binder wanted a plan's status and the rating
route wanted to set it; adding a second writer to `state/ventures/*/plans/` would have kept two
copies of one fact in sync forever. Reading the ledger was cheaper and truer.

**4. One resolver per config concern.** Never a literal copy of a budget number, a model id or a
path. *Why:* `orchestrator/src/portfolio/limits.ts:9-17` records it — article production carried
its own `$2.20 / $42 / $50`, the figures of a decision the owner had already superseded with
`$1.00 / $25 / $30`, and it went on spending against the replaced one. The same rule caught a day
tile scaled to a literal `$1` beside three scaled to `$30`.

**5. Reserve before, record after.** Every paid call reserves its estimate, then records what it
actually cost; bill before the gate is asked. *Why:* `orchestrator/src/images/ladder.ts:275-285` —
a gate that can refuse must not be able to refuse for free, or a loop of refusals is a loop of
unbilled calls.

**6. Failure posture.** A malformed item costs one item. A failing source costs a section and a
line in the receipt. Neither costs the run. Every non-event writes a reason record. *Why:* the
meeting-skip pattern — a meeting that did not happen and left no record is indistinguishable from
one nobody scheduled, and explaining what did not happen is half of what an operations record is
for.

**7. `null` is not `0`.** A rate with no denominator, a period nothing was measured over and a
score nobody produced are all absences. *Why:* "Releases that passed 0%" announced a catastrophe on
a week when nothing had been released at all.

The company-level health, capacity and recovery boundaries are documented in
`docs/AUTONOMOUS-OPERATIONS.md`. They observe existing domain truth, use the capability map for
every dependency and never grant content, spend, publishing or deployment authority.

## Modules

**8. A soft cap of about 400 lines per hand-written file.** Named debt, at the time of writing:
`orchestrator/src/cycle.ts` (2,194), `orchestrator/src/portfolio/run.ts` (1,720),
`site/src/components/decision-replay.tsx` (1,340), `site/src/lib/office-walkthrough.ts` (831).
*Why:* the cap is not about beauty — every one of those files has had a bug that survived review
because the reviewer could not hold the file in their head.

**9. Domain folders, not type folders.** A helper graduates to shared at its third caller, not its
second. *Why:* two callers is a coincidence; three is a pattern.

**10. No dead code kept alive by its own tests.** `orchestrator/src/council.ts` and
`orchestrator/src/consensus.ts` are imported by nothing but their tests. Revive them or delete
them. *Why:* a green test suite over unreachable code reports a system that does not exist.

## Site and React

**11. One styling dialect per surface, documented.** The token dialect for the classic pages;
literal hex for the office walkthrough and the admin shell. Extract a local component before its
second consumer copies it, not after. *Why:* `Tile` and `Panel` sat module-private in the admin
page until a second view needed them; extracting them first is the cheap moment.

**12. Custom hooks for any client behaviour used twice.** Components stay presentational. Every
filesystem read lives in a `server-only` lib module and crosses to the client once, as plain JSON.
*Why:* the office walkthrough pattern — that single crossing is also the sanitising boundary, and
one boundary is auditable where twelve are not.

**13. Honest rendering.** A missing record is named, not omitted. Machine text never reaches a
public page. *Why:* the four-layer sanitiser chain exists because a raw contract token once
reached a reader, and because an omitted row reads as "nothing happened".

## Process

**14. Comments state constraints the code cannot show.** Never narration. A comment that says what
the next line does is noise; a comment that says why the obvious approach was wrong is the only
copy of that knowledge.

**15. Architecture tests for cross-repository invariants.** *Why:* the skills drift test — two
copies of a file that must stay identical will not stay identical unless something fails when they
diverge.

**16. Small commits, one concern each.** Board findings become `- [ ]` tasks in a dated decision
file under `state/decisions/`, and a session ticks them off one commit at a time.

**17. Every repository carries this file.** `CLAUDE.md`, `AGENTS.md` and `CONTRIBUTING.md` point at
it rather than restating it, because a rule stated in four places is four rules that will drift.

## Deployment and Vercel cost control

`site/vercel.json` is the one Vercel project configuration in this repository. Its
`git.deploymentEnabled: false` guard deliberately stops Git pushes and pull requests from creating
deployments. The cron array in the same file still ships with every production deployment and is
not part of this cost-control change. The deployment that first carries the Git guard may be the
last automatic Git deployment.

The release loop is:

```text
Codex makes frequent coherent commits
-> pushes a branch safely
-> GitHub CI validates source changes
-> no automatic Vercel deployment
-> run deploy:check on a coherent release candidate
-> create one explicit preview when needed
-> verify environment-specific behavior
-> create one explicit production deployment
```

### First-time local setup

Use Node 22 or later and pnpm 10.30.0. From the repository root, sign in with the developer's
normal Vercel CLI session and run `pnpm exec vercel link`. Select the existing Quorum project and
team. Confirm in the Vercel project settings that its Root Directory is `site`; do not create a
second project to make the command pass. The CLI is pinned in `devDependencies`, and `.vercel/`,
pulled local environment files and deployment receipts are ignored by Git. A non-interactive
session may provide `VERCEL_TOKEN` through the environment, but the token must never appear in a
command, log, receipt or tracked file.

Vercel's current monorepo guidance says to invoke its CLI from the monorepo root. `vercel pull`
then loads the linked project settings and the selected Preview or Production environment. The
wrapper verifies that pull did not change the linked project before it builds or deploys. See the
[monorepo guide](https://vercel.com/docs/monorepos),
[`vercel pull`](https://vercel.com/docs/cli/pull) and
[`vercel build`](https://vercel.com/docs/cli/build).

### Validate and deploy

Run `pnpm deploy:check` on a clean commit. It performs the frozen install, agent validation, lint,
hook gates, typecheck, tests and one production build. It then starts that built site, waits for
readiness, runs the production route/link smoke and always stops the server. A successful run
writes an ignored `.deploy/validation.json` receipt tied to the exact commit. A different commit
or dirty tree invalidates it.

Run `pnpm deploy:preview` to pull Preview configuration, build `.vercel/output` locally and upload
it once with `vercel deploy --prebuilt`. Verify the returned URL, including server routes,
redirects, protected Admin behavior and cron configuration. This first manual preview is also the
required parity check for the linked monorepo settings and build-time Vercel values.

Production is deliberately more explicit:

```text
pnpm deploy:production -- --confirm-production=<full-commit-sha>
```

It accepts only a clean `main`, fetches `origin/main`, requires both tips to equal the validated
SHA, builds with Production configuration and uploads one prebuilt production deployment. Both
commands print the deployment URL and commit and leave an ignored bounded receipt under
`.deploy/`.

### Prebuilt failure and one remote-build fallback

Do not treat a failed or unclear prebuilt upload as permission to deploy again. If the CLI exits
successfully without a URL, the receipt says `ambiguous`; inspect Vercel before doing anything
else. If the preview proves that the linked monorepo cannot safely produce a complete local
`.vercel/output`, record the exact technical reason and deliberately request one cloud build:

```text
pnpm deploy:preview -- --remote-build --confirm-remote-build
pnpm deploy:production -- --confirm-production=<full-commit-sha> --remote-build --confirm-remote-build
```

The wrapper labels this `manual-remote-build` and warns that it consumes one Vercel build. It never
falls back to it automatically. Return to the default prebuilt path after the documented platform
limitation is removed. See [`vercel deploy`](https://vercel.com/docs/cli/deploy).

### Recovery, rollback and re-enablement

For a failed local build, fix the source and rerun `deploy:check`; nothing was deployed. For an
ambiguous upload, inspect the project activity and deployment list, record the actual outcome and
do not retry merely because the local receipt lacks a URL. Roll production back to a known prior
deployment with the Vercel dashboard or the pinned `vercel rollback` command, following the
[rollback guide](https://vercel.com/docs/cli/rollback). A rollback does not require Git
auto-deployments to be re-enabled.

Re-enable Git deployments only in a reviewed future change that removes or changes
`git.deploymentEnabled` in `site/vercel.json`, updates its architecture test and explains the cost
impact. Do not use a dashboard-only exception or branch rule to bypass the repository guard. The
[Git configuration reference](https://vercel.com/docs/project-configuration/git-configuration)
is the authority for the setting.
