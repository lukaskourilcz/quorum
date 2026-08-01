# Human approval queue

<!-- The orchestrator appends stable, deduplicated items. The human resolves
items in place. Lack of response never authorizes an action. -->

## Pending

None.

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

- [ ] **CAUGHT-UP-DELIVERY-2026-08-01** — hash_conflict: > aifirst@0.1.0 consume:edition /home/runner/work/_temp/aifirst-delivery-1 > tsx scripts/consume-edition-package.ts /home/runner/work/quorum/quorum/state/edition/outbox/2026-08-01-ac4a08fea9cc69b219a48ae2421e8eccc0fa35d1ea14ef58165e86529c323315.json /home/runner/work/_temp/aifirst-delivery-1 [delive.
  RELAY marked the delivery `needs_reconciliation`; same-date content must not be overwritten automatically.
  [imp:5] [owner:me] [time:20m] [kind:deploy]
