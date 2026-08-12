# DOOR MONEY — Codex build prompt

You are implementing a new BoardlessAI venture in this repository (`lukaskourilcz/quorum`).
This document is the owner's commission for the build. Per house convention it is
scaffolding: it is deleted in the final commit of the program, and what outlives it is the
countersigned founding decision you will write in `state/decisions/`, the design record
`docs/DOOR-MONEY-VENTURE-DESIGN.md`, and the code. Where this prompt, that design document
and the founding decision disagree, the decision wins, then the design document, then this
prompt. This commission authorizes edits outside the `AGENTS.md` standing write allowlist
for the files this program names — that allowlist governs unattended sessions, not
owner-issued builds.

## What you are building, in one paragraph

**Door Money** (venture id `door-money`): a drafts-only English-language venture that
markets the owner's book *Rapovej deník* by telling its stories. A one-time, owner-triggered
ingestion reads the full English manuscript from a **private** source, chunks it
deterministically, annotates and scores every chunk on fifteen marketing axes with a
budget-capped Haiku pass, synthesizes a versioned writing-style profile, and builds an
embedding index — full text and embeddings stay in the private store; only derivatives
(scores, summaries, the profile, excerpts capped at 600 characters) enter this public
repository. Then, daily at 15:00 Prague, code selects 1–2 passages by score, cooldown and
seeded rotation, and one model call (a new agent, GHOST, writing in the author's recorded
voice) drafts recommendation packages — format, platform, adapted copy, hook, rationale,
source-passage link. On Thursdays at 16:00 a growth room (a second new agent, BOOKER)
works a rotating research agenda and produces action packets: concrete owner tasks with
prepared templates. Approved packages render in the Design Lab under a new `door-money`
brand (the first English-locale venture there) and are posted by hand by the owner.
Nothing in this build posts, creates an account, or moves the manuscript into public view.
Read `docs/DOOR-MONEY-VENTURE-DESIGN.md` in full before writing code.

## Phase 0 — audit before you build (mandatory, no code yet)

Verify every assumption against the live tree; where reality has drifted, follow reality
and record the divergence in the founding decision.

Read, at minimum:

1. `CLAUDE.md`, `docs/ENGINEERING.md` (all 17 rules bind), `GOVERNANCE.md`,
   `docs/ECOSYSTEM.md`, the newest `state/decisions/*` (budget, social, venture,
   operations), and the founding precedents `2026-08-06-goviral-founding.md` and
   `2026-08-07-marketingshark-founding.md`.
2. Venture machinery: `config/ventures.json`,
   `orchestrator/src/contracts/venture-registry.ts`, `orchestrator/src/ventures/registry.ts`
   (slot spacing ≥60 min, cron math), `orchestrator/src/ventures/marketingshark/run.ts`
   (your runner's shape), `orchestrator/src/cycle.ts`, `orchestrator/src/types.ts`,
   `orchestrator/src/contracts/meeting-record.ts`, `config/meeting-policy.json` — and the
   GoVIRAL Monday gate in `orchestrator/src/portfolio/run.ts`, which is the precedent for
   the Thursday gate (`daily@HH:00` is the only cadence form; weekday behaviour is code
   plus $0 no-op records on off days).
3. The money funnel: `orchestrator/src/llm/call.ts` (`guardedJsonCall`),
   `orchestrator/src/budget.ts` (note `perTextCallUsd: 0.1` — it shapes the ingestion's
   map-reduce), `orchestrator/src/portfolio/schedule.ts` + `limits.ts`,
   `config/models.json` (`DIGEST` is the closest existing role to your ingestion role).
4. Security and network: `orchestrator/src/security/url.ts` (`safeFetch`),
   `config/network-allowlist.json` (check whether `api.github.com` is present for
   runtime; if not, adding it is part of KV/DM source work and is named in the approval),
   the presentation barrier in `orchestrator/src/security/`.
5. Admin patterns: `site/src/app/admin/page.tsx` (`Promise.all`, `tabView`
   `{node,count}`), `site/src/lib/admin-portfolio.ts`, a `persist()`-ladder store
   (`site/src/lib/caught-up-events-store.ts`), an API route
   (`site/src/app/admin/api/caught-up/events/route.ts`), `site/src/proxy.ts`,
   `site/src/components/admin/titty-tuesdays-proposals-panel.tsx` (a good card-review
   precedent).
6. Studio extension points: `studio/src/schema.ts` (`BrandTokensSchema`),
   `studio/src/library.ts` (`CAROUSEL_BRANDS`), `studio/src/summary.ts` — note
   `locale: "cs"` is currently pinned; this venture is the first English one, so the
   summary contract grows a per-venture locale. Find every consumer of `locale` before
   changing it, and keep existing ventures byte-identical (the determinism tests are the
   proof).
7. The tests that police you: `orchestrator/tests/architecture.test.ts`
   (`expectedPrompts`, agents/routing parity), `system-audit.test.ts` (envelopes inside
   the $1.00 pace), `vercel-cron.test.ts`, `contracts.test.ts` (published contracts +
   the Czech-required/English-optional rule — your English-first contract shapes must
   fit or extend it honestly), `ci-policy.test.ts`.
8. `docs/NEEDED.md`, `state/INBOX.md` — current owner state.

Also check whether the sibling program (`docs/KVORUM-CODEX-BUILD-PROMPT.md`) has landed:
if `contracts/venture-recommendation.schema.json`, the owner-results contract or the
performance-weights module already exist, extend and reuse them — do not duplicate. The
two ventures share one recommendation contract with a discriminated `evidence` union;
yours is `kind: "book-passage"`.

## Non-negotiables

- **The manuscript never enters this repository.** `lukaskourilcz/quorum` is public. Full
  text, full-text chunks and their embeddings live only in the private source (§Private
  store). Committed derivatives cap every excerpt at 600 characters and the style
  profile's exemplars at 40 × 280 characters; a test enforces both caps against the
  actual state files. If you find yourself about to commit book text beyond a cap, stop —
  that is the one irreversible mistake this program can make.
- The `budget-2026-08e` ceilings: $30 all-in, $25 model share, $1.00 daily pace. Room
  envelopes: `dm-desk` $0.08, `dm-growth` $0.06. Ingestion runs under a $0.80/day
  sub-envelope with a resumable cursor so the pace holds; total ingestion envelope $3.00.
  `system-audit.test.ts` proves the day's arithmetic.
- Every paid call through `guardedJsonCall` (or the embeddings wrapper you build to the
  same reserve-before/record-after contract); every call under the $0.10 per-call cap —
  the style synthesis is map-reduce for exactly this reason.
- The social triple-lock, treasury rules, `METRICS_INGESTION_ENABLED=false`, magazines'
  gates, append-only decisions: untouched. The publisher refuses `door-money` by name.
  No accounts, no channels, no outreach sent by the system — BOOKER drafts, the owner
  sends.
- Engineering contract throughout (contracts + fixtures, parse-or-drop, recorded-not-
  re-derived — the style profile and every score is written once and versioned, never
  silently regenerated — one writer per path, failure posture, `null` ≠ `0`, ~400-line
  cap, small commits).
- Dry runs are $0 end-to-end on fixtures, including a fixture manuscript.

## The private store

A private GitHub repository the owner creates (working name
`lukaskourilcz/rapovej-denik-source`), holding `manuscript/` (the English source text)
and `kb/` (`chunks/`, `annotations.jsonl`, `embeddings.json` — written by ingestion).
Access: a fine-grained read-only token `BOOK_SOURCE_TOKEN` (Actions secret + local env),
contents-only, that single repository — the same bounded-access shape the delivery App
uses in the other direction. Local runs may instead read a gitignored path
(`state/ventures/door-money/manuscript/` added to `.gitignore` in this program) so the
owner can ingest without pushing the manuscript anywhere. The runtime fetch of selected
chunks goes through `safeFetch` with the host allowlisted. All of this fails closed until
**BOOK-SOURCE-001** is countersigned: without the token, the desk runs its fixture path
and says so.

## The build, in phases

Full gate green at each phase end (`pnpm agents:validate && pnpm lint && pnpm typecheck
&& pnpm test && pnpm build`, site e2e where touched); one commit per task; task ids
`DM-01`… as checkboxes in the founding decision.

### Phase A — founding records and registration (dry rooms hold, $0)

- **DM-01** `state/decisions/<today>-door-money-founding.md` in the house shape
  (decision id, pending countersignature, extends the GoVIRAL/marketingShark precedent,
  ceilings/gates/triple-lock/treasury untouched paragraph, DM checkbox list, honest-gaps
  section, "What this does not touch").
- **DM-02** Registry entry: id `door-money`, name `Door Money`, `status: "operating"`,
  `taste: true`, ledgerNamespace `door-money`, growth_objective per design §13
  (components: `package-cadence` reused + new `action-completion` — extend the closed
  enum, both fixtures, and the KPI evaluator honestly), adminTabs
  `["recommendations","actions","knowledge"]` (extend the enum), two meetings:
  `dm-desk` `daily@15:00` cast `["GHOST","AUDIT"]` envelope 0.08, `dm-growth`
  `daily@16:00` cast `["BOOKER","PULSE","AUDIT"]` envelope 0.06, packets per design §6
  with `topicType:"social"` / `"growth"` and presets `dm-desk-room` / `dm-growth-room`.
  15:00 and 16:00 are free and clear the ≥60-minute spacing; verify against the live
  registry.
- **DM-03** Phase plumbing: both kinds into the phase schemas, meeting-record enum,
  `meeting-policy.json` (both standing; the Thursday gate lives in the runner and writes
  "$0 — this room meets on Thursdays" records on off days), `cycle.yml` dispatch choices
  + mode gates, `site/vercel.json` two DST variants per slot and nothing else.
- **DM-04** Agents: GHOST (Anthropic, `ventures:["door-money"]`, mission per design §5 —
  cannot select passages, cannot invent book facts, cannot post) and BOOKER (OpenAI,
  rides `OPENAI_SPECIALIST`, cannot contact anyone, cannot spend, cannot claim
  unentered results) in `config/agents.json` + `agent-routing.json` (capabilities +
  both presets) + `venture-agent-controls.json` + `FoundingAgentSchema` + prompts
  `orchestrator/prompts/door-money/{ghost,booker,craft}.md` + `expectedPrompts`.
  `config/models.json`: `GHOST` (`claude-sonnet-5`, ~8000/2500), `BOOK_INGEST`
  (`claude-haiku-4-5-20251001`, ~12000/3000), `BOOK_STYLE` (`claude-sonnet-5`,
  map-reduce-sized caps).
- **DM-05** Scaffold + surfaces of record: venture `README.md` (drafts-only posture,
  private-store pointer), `.gitignore` line for the local manuscript path,
  venture-brand hue, `VENTURE_LABEL`, KPI seeds, degradation-ladder position
  (`dm-growth` drops first of all rooms, `dm-desk` second, both before `gv-brief`) with
  its test.

Acceptance: both dry rooms hold honest $0 records; architecture tests green.

### Phase B — ingestion (fixture manuscript first, real one only after approvals)

- **DM-06** Contracts: `book-kb-index/1` (public derivative: manuscript hash, model
  versions, chunk ids + offsets, summaries, entities, themes, story-type, era,
  per-axis scores with one-line justifications, usage history) and `style-profile/1`
  (versioned fingerprint + capped exemplar bank) with valid + poison fixtures; the
  excerpt-cap test (no committed string of book text over 600 chars; exemplars ≤ 40 ×
  280 chars).
- **DM-07** Deterministic chunker: chapter/scene-aware structural parse, 900–1200-token
  targets, hard paragraph boundaries, stable ids (`ch07-s02-c041`) with byte offsets,
  overlap as explicit context fields. Pure, exhaustively tested on a fixture manuscript
  you write for the purpose (a few thousand words of invented diary prose — do not use
  real book text in fixtures).
- **DM-08** Annotation + scoring pass: one `BOOK_INGEST` call per chunk (annotation and
  all fifteen axes in a single call — entertainment, emotional impact, shock, humor,
  relatability, hip-hop relevance, storytelling strength, controversy, shareability,
  educational value, quote, carousel, short-video, thread, book-curiosity), validated
  against the contract, cursor-checkpointed after every chunk, resumable after any stop
  (budget, network, kill). Rollups (chapter summaries, entity/theme indexes) as
  map-reduce Haiku calls.
- **DM-09** Style profile: per-chapter style notes (Haiku) reduced by one `BOOK_STYLE`
  synthesis (Sonnet) into `style-profile/1` — rhythm stats, vocabulary signature,
  humor mechanics, storytelling patterns, negative space ("what the author never
  does"), per-format adaptation notes, exemplar bank chosen from top quote-scoring
  chunks. Every call inside the $0.10 per-call cap by construction.
- **DM-10** Embeddings: a small guarded wrapper for `text-embedding-3-small` on the
  existing OpenAI key with reserve-before/record-after into the budget ledger — extend
  the ledger's `kind` enum with `"embedding"` (schema, fixtures, and every reader that
  switches on `kind`) rather than mislabeling it text; if the audit shows that enum is
  load-bearing beyond reasonable reach, record the fallback (kind `"text"` with the
  embedding model id) as an adapted divergence in the founding decision. Vectors write
  to the private store, never here.
- **DM-11** `pnpm book:ingest` CLI: reads manuscript (local path or private repo),
  runs chunk → annotate/score → rollups → style → embeddings under the $0.80/day
  sub-envelope and $3.00 program envelope, writes private artifacts to a local clone
  path the owner provides and public derivatives to `state/ventures/door-money/
  knowledge/`, prints an honest cost and coverage report, and is idempotent per
  manuscript hash (a changed manuscript is a new KB version; the old one is superseded,
  never mutated).

Acceptance: full ingestion of the fixture manuscript runs in dry/test mode at $0 with
deterministic outputs; resumability proven by a test that kills the cursor mid-run.

### Phase C — the daily desk

- **DM-12** `venture-recommendation/1` — create or extend (see Phase 0): this venture's
  `evidence.kind: "book-passage"` carries chunk refs, scores at selection time, the
  capped excerpt, and the private-store link. Status flow and owner fields as in the
  design.
- **DM-13** `orchestrator/src/ventures/door-money/select.ts`: deterministic selection —
  score threshold per format, per-theme/per-chapter cooldowns (`max(2× last interval,
  21 days)`), arc-repeat guard, performance-weight blend, seeded rotation (date +
  venture) so a rebuild picks the same passages; quiet-day outcome when nothing is
  eligible.
- **DM-14** `run.ts` — dispatched from `cycle.ts` for both phases: desk path assembles
  the packet (selected chunks fetched from the private store via `kb.ts`, ±1 neighbor,
  style profile, 3–5 embedding-matched exemplars for the target format, 14-day
  recommendation history, weights, format menu), makes one GHOST `guardedJsonCall`,
  parses packages. Fixture path end-to-end in dry mode and whenever the token or KB is
  absent, recorded honestly.
- **DM-15** `gates.ts`: schema; every book-fact claim resolves to chunk refs; verbatim
  quotes are exact substrings of the source chunk; excerpt caps; voice lint (banned
  generic-AI constructions + stop-slop patterns + profile-derived checks, deterministic);
  duplicate check against prior packages at the social-policy threshold; CTA-frequency
  rule (explicit buy-the-book CTA at most once a week); living-person rule (no factual
  claims about named people that the manuscript itself does not make). Store as drafts,
  idempotent per (date, chunk set).

### Phase D — admin and Design Lab

- **DM-16** Studio: `door-money` into `BrandTokensSchema.id` + `CAROUSEL_BRANDS` (token
  set per design §2), `CarouselSummaryVenture` gains `door-money` **with locale `en`** —
  introduce the per-venture locale in `carousel-summary/1` and its consumers with
  existing ventures byte-identical (determinism tests before and after; the
  Czech-required/English-optional contract rule respected). `pnpm -C studio build`
  before anything that resolves the package.
- **DM-17** Approval write path `POST /admin/api/door-money/recommendations` on the
  standard ladder; approve → recorded summary under
  `state/ventures/carousel-studio/summaries/door-money/…` (the package appears in the
  studio rail; single-image formats are one-slide decks), edit-then-approve preserves
  the original, reject needs a reason, posted records the URL.
- **DM-18** Loaders + panels: `admin-door-money.ts` (server-only, parse-or-drop),
  `door-money-recommendations-panel.tsx` (card: hook, format/platform chips, adapted
  copy, linked source passage — capped excerpt inline + private-store link — rationale,
  gates, RatingWidget), `door-money-actions-panel.tsx` (action packets with templates,
  checkable with outcome fields, playbooks read-only), `door-money-knowledge-panel.tsx`
  (chapters, score bars, style profile, usage history, ingestion status line;
  read-only — re-ingestion is a CLI act). Wire through `Promise.all` + `tabView`,
  register tabs, e2e entries.

### Phase E — the growth room and the loop

- **DM-19** `dm-growth`: the Thursday gate; the rotating agenda wheel (deterministic,
  ISO-week-seeded, the eight topics from design §6); `action-packet/1` contract +
  fixtures (tasks with prepared templates, effort, expected impact, completion +
  outcome fields); playbook files under `state/ventures/door-money/playbooks/` written
  only by this room, every revision citing result or completion ids; BOOKER's
  `guardedJsonCall` on the packet of accumulated playbooks + entered results + GoVIRAL's
  latest brief when present; honest `NO_ACTION` when research yields nothing
  executable. Admin: action check-off and outcome entry via
  `POST /admin/api/door-money/actions`.
- **DM-20** Owner results + weights: `owner-result-entry/1` (shared), results store and
  card surfacing, `performance-weights.json` adjusted only by the weekly room's
  recorded proposal with floors, read by `select.ts`. Owner-entered only; no automated
  collection.

### Phase F — close out

- **DM-21** Documentation truth (`docs/ECOSYSTEM.md` curated layer, `docs/PORTFOLIO.md`,
  `README.md`, `about-project.md`, `scaling.md` cost lines), INBOX items filed (below),
  `docs/NEEDED.md` owner items appended, founding decision's honest-gaps section
  written, every DM checkbox ticked, this prompt deleted in the final commit with the
  deletion noted in the decision.

## Approvals to file in `state/INBOX.md` (house shape)

- **BOOK-SOURCE-001** — the private manuscript repository, the `BOOK_SOURCE_TOKEN`
  fine-grained read-only secret (Actions + Vercel is *not* needed — admin shows capped
  excerpts from committed state; only the orchestrator fetches chunks), the local
  gitignored path, and the public/private split with its caps.
- **BOOK-INGEST-002** — the one-time ingestion spend: ≤ $3.00 program envelope,
  ≤ $0.80/day, the `BOOK_INGEST`/`BOOK_STYLE` roles and the embeddings wrapper, the
  ledger `kind` extension.
- **DM-ACCOUNTS-003** — future social accounts (IG/TikTok/X/Threads/YouTube at the
  owner's choice) and handle/name clearance for "Door Money"; drafts-only until signed.
- **DM-RESULTS-004** — owner-entered per-post results as the venture's only
  measurement, explicitly inside the D9 hold.

## Cost declaration (goes in the founding decision)

One-time ingestion ≈ $1.10–1.50 (envelope $3.00). Daily GHOST ≈ $0.05–0.07 →
≈ $1.80–2.10/month; weekly BOOKER ≈ $0.35/month; embeddings < $0.01 one-time. Venture
total ≈ $2.50/month inside the $25 share; $0 cash anywhere. All through
reserve-before/record-after; ledger attribution by `ventureId` is automatic once
registered.

## What is explicitly out of scope

Account creation, posting, channels, publisher changes, autopublish counters, outreach
sending, paid ads or giveaways, fine-tuning of any model, metrics ingestion, newsletter
assembly and the series planner (phase-2 designs → honest-gaps section), and any commit
of manuscript text beyond the stated caps.

## Definition of done

Every DM task ticked; full gate green plus site e2e; `pnpm cycle -- --phase dm-desk
--dry` and `--phase dm-growth --dry` recording honest $0 rooms (growth off-days say so);
fixture-manuscript ingestion proven resumable and deterministic; the excerpt-cap test
guarding the public/private boundary; the founding decision awaiting countersignature
with a handoff note listing the owner's next steps (sign, create the private repo, place
the manuscript, mint the token, run `pnpm book:ingest`, then the first live desk).
