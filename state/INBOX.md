# Human approval queue

<!-- The orchestrator appends stable, deduplicated items. The human resolves
items in place. Lack of response never authorizes an action. -->

## Pending

- [ ] HUMAN_APPROVAL DISPATCH-TOKEN-001 — Store a GitHub dispatch token and a
  cron secret on the `quorum-site` Vercel project, so the council's meetings
  start on their own hour instead of whenever GitHub's queue gets to them.
  What this approves, exactly:
  - **Which repository the token reaches:** `lukaskourilcz/quorum`, and no
    other. It is a fine-grained personal access token scoped to that one
    repository.
  - **Which permission:** Actions, read and write. That is the entire scope and
    it is what lets the token start `cycle.yml`.
  - **Where it is stored:** as Production environment variables on the Vercel
    project `quorum-site` (the one that deploys this repository and serves
    boardless-ai.vercel.app) — `QUORUM_DISPATCH_TOKEN` holds the token, and
    `CRON_SECRET` holds a random string of at least 16 characters that Vercel
    sends as the Authorization bearer on its own cron requests.
  - **That it can trigger paid model runs:** yes. A dispatch started with this
    token runs the council live and calls the paid model APIs, exactly as a
    GitHub cron firing does, and spends against the same $30/month all-in
    operating cap from `budget-2026-08e`. It raises no limit and skips no
    budget, gate or gating switch.
  What it does not get: no access to repository contents, secrets, or any other
  repository, and no say in what a run does. `site/src/app/api/cron/[phase]`
  sends two workflow inputs and nothing else — the phase, and
  `trigger=vercel-cron` — so it cannot ask for delivery-only mode, a different
  branch, or a phase this repository does not schedule.
  Why it is worth a token at all: GitHub delivered 4 August's scheduled runs
  2h23m to 2h55m late and 2 August's 13 to 54 minutes late; `workflow_dispatch`
  starts within seconds.
  If `CRON_SECRET` is never set, the route refuses every request and nothing is
  dispatched — an unset secret costs punctuality, never money.

## Resolved

- [x] HUMAN_APPROVAL REVENUE-HOSTING-001 — Owner confirmed on 2026-07-31 that
  both projects use an existing Vercel Pro subscription. Hosting is recorded as
  $0 incremental project cost. Reopen the cap decision if either project leaves
  Pro or the invoice allocation changes. Sponsor acceptance remains a separate
  HUMAN_APPROVAL. → approved 2026-07-31.

- [x] HUMAN_APPROVAL BRAND-CLEARANCE-001 — Owner explicitly accepted the
  collision risk with `Boardless, Inc.` and `boardless.ai` under hobby /
  non-commercial project mode (see `state/BUSINESS.md`). No commercial launch,
  no domain purchase, no handle registration, no trademark claim. Name
  `BoardlessAI` retained as a working title for the personal project. If mode
  is ever reclassified to commercial, this decision must be revisited with
  professional legal clearance. → approved 2026-07-28.
  The 2026-08-01 operating transition reopened that commercial clearance gate;
  the remaining owner action is tracked in `NEEDED.md`.

- [x] HUMAN_APPROVAL API-CREDENTIALS-001 — Owner provided `ANTHROPIC_API_KEY`
  and `OPENAI_API_KEY` for local development on 2026-07-28; keys stored in the
  gitignored `.env` file and loaded by the orchestrator via `src/env.ts`.
  Owner acknowledged the transcript-leak risk and will rotate the keys.
  GitHub Actions secrets now exist, but rotation remains pending in
  `NEEDED.md`. → approved 2026-07-28.

- [x] **CAUGHT-UP-DELIVERY-2026-08-01** — Resolved 2026-08-01: a technical no-edition fallback duplicated an already delivered provisional board status. The duplicate outbox package was held internally; a valid same-day edition may replace only that provisional status.

- [x] **CAUGHT-UP-DELIVERY-2026-08-05** — Resolved 2026-08-06: the same package delivered two hours later on a repeat run. Original report: schema_invalid: > aifirst@0.1.0 consume:edition /home/runner/work/_temp/aifirst-delivery-1 > tsx scripts/consume-edition-package.ts /home/runner/work/quorum/quorum/state/edition/outbox/2026-08-05-17eb32d81474601883eff58c095b8b5d41b056dc23100fdf44675787c8ff824c.json /home/runner/work/_temp/aifirst-delivery-1 [delive.
  RELAY marked the delivery `needs_reconciliation`; same-date content must not be overwritten automatically.
  [imp:5] [owner:me] [time:20m] [kind:deploy]
