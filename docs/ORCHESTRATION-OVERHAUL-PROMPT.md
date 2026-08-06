# BoardlessAI orchestration overhaul — implementation prompt

You are working across four repositories of one system:

- `quorum` — the BoardlessAI orchestrator (`orchestrator/`), config (`config/`), state (`state/`), and the public corporate site (`site/`). Auto-deploys from `main` on Vercel.
- `aifirst` — the DNESKAi magazine (Czech-only AI daily; venture id `caught-up`; deployed at caughtup-ai.vercel.app). Receives one edition package per day from quorum.
- `mma-files` — the MMA Files magazine (Czech-only; receives article packages and FightAIQ data snapshots from quorum).
- `titty-tuesdays` — a pre-commerce storefront. It receives **no content**; quorum only produces marketing ideas for it into `/admin`.

Every change below has been decided after a full audit of all four repos on 2026-08-06. Implement all of it. Where a section says "verify X first", do the verification and then proceed — do not stop to ask. File paths with line numbers reference the state of the repos on 2026-08-06; re-locate by symbol name if lines have shifted.

---

## 0. Authority, boundaries, and working method

**Authority.** The owner has explicitly authorized every change in this document, including: editing runtime prompts and `config/agents.json`, pausing/retiring agents, changing meeting policy and schedules, loosening named gates, and superseding countersigned decisions. Record structural changes properly (see §0.4) instead of bypassing the record system.

**Never touch, under any circumstance:**
- The money ceilings: $30/mo all-in, $25/mo model share, $1.00/day pace (`budget-2026-08e`). §3.4 changes per-run caps *within* these ceilings, never the ceilings.
- Truth gates: cited/supplied sources, source diversity, signal strength, single-source share, primary sourcing, watchlist support, prompt-injection leak checks, the never-fabricate rules in both magazines.
- The social triple-lock (`SOCIAL_KILL_SWITCH`, per-venture activation counters, missing credentials). Nothing in this prompt enables posting.
- The Czech single-call article design (one Czech write call per article; the translate stage is retired — do not reintroduce it).
- Treasury/payment rules (only the human pays; never resolve SPEND items).
- Sealed package hashes and delivered content bytes. The stable ids stay: venture id `caught-up`, repo names `aifirst`/`mma-files`, Actions variable names.

**0.3 Verification.** After each numbered work package: run `pnpm test` in `quorum/orchestrator`, plus `pnpm -C site test` and `pnpm -C site typecheck` when the site changed. For `aifirst` changes run `pnpm verify`. For `mma-files` run `npm run typecheck && npm run test && npm run build`. Several tests deliberately pin current behavior (they are listed per package below) — update the pinned test in the same commit as the behavior change, never delete a guard test.

**0.4 Recording.** For schedule/venture/roster changes, append one superseding decision record in `quorum/state/decisions/` (append-only, dated, referencing what it supersedes — e.g. D11 for Carousel Studio) noting "owner-directed batch, 2026-08-06". For the roster changes in §8, also write one org-change record via the existing org maintenance conventions; the owner's authorization in this prompt satisfies the human-approval tier. Do not silently edit history.

**0.5 Commits.** Small commits, one per numbered item or tightly-related group. Follow each repo's git convention: quorum merges to `main` at session end (auto-deploy); mma-files pushes to `main` per its commit-discipline; aifirst pushes to `main` (the owner authorizes it here). Update `NEEDS_YOUR_HELP_NOW.md` / `NEEDED.md` at the end (§12).

---

## 1. Current state — trust these facts, do not re-derive or re-do them

- Both magazines are already Czech-only and already write each article in **one native-Czech call** (DNESKAi: STET write in `orchestrator/src/edition/write.ts`; MMA: JAB write in `orchestrator/src/mma-files/live.ts:303-357`). The English-draft+translate stage is gone; measured savings already banked (51% per MMA article, 39% per edition). **Do not rebuild any translation stage.**
- Meetings are single-shot: one guarded JSON call per cast seat, sharing a byte-identical cacheable prompt prefix (`orchestrator/src/portfolio/run.ts:1141-1167`). There is no multi-round dialogue; the public transcript is synthesized from the contributions.
- Measured costs (state/budget/ledger.json, Aug 1–6): total $3.05. `cu-edition` production is **64% of all spend** ($1.99; STET rewrites alone 44%). All deliberation rooms together cost $0.08–0.15/day. A clean edition costs $0.16–0.19; a rewrite day $0.22–0.67. An MMA article costs $0.039–0.049. A held deliberation room costs $0.012–0.056. Image spend is $0.00 ever (no `kind:"image"` ledger entry exists).
- The agenda machinery exists and works end-to-end (queue `state/meeting-agendas/queue.json`, `requestMeetingAgenda`/`dueMeetingAgenda`/`consumeMeetingAgenda` in `orchestrator/src/meetings/agenda.ts`, morning-council `meetingRequest`, chair `followUpRequest`). The problem is supply: 4 agenda-required rooms/day vs at most 1 morning commission + 1 follow-up per held room. 13 of 44 meeting records in August are $0 `PAUSED` "no bounded agenda was due".
- Carousel Studio's meeting has **never held a live session** and has produced zero templates/observations; everything the venture delivers (10 seed templates + 30 generated deck templates, deterministic SVG/PNG renderer in `quorum/studio/`, per-article deck pipeline, /admin preview with a 5-style switcher) is code that runs without the meeting.
- Social channels are locked (no credentials, `channels.json` both `enabledByHumanAt: null`, activation counters below thresholds) for ~1 month.
- The tt-marketing → ideas → `/admin?venture=titty-tuesdays&tab=ideas` flow works end-to-end (7 ideas recorded 2026-08-05). No delivery path to the titty-tuesdays repo exists anywhere; keep it that way.
- FightAIQ has never produced a prediction: zero bouts reach `confirmed` because the second independent source requires `THE_ODDS_API_KEY`, which is not installed (owner item). `state/mma/evaluation/summary.json` reads 0 everywhere; there is no `model-runs/` or `stats/` directory.

---

## 2. Meeting & agenda engine — meetings must always have something to decide

### 2.1 Fix the why-not selection deadlock (bug, live)
`orchestrator/src/priority/queue.ts`: `openPriorityItems` (~lines 146-160) deliberately includes `why-not` items so the board can re-commission them, but `selectPriorityItem` → `transitionPriorityItem` (~line 359) throws for any status other than `open`. Result observed on disk: the 2026-08-06 morning standup's `starvationReview` claims "the agenda queue refused it: Priority item priority-7909b87102cf7c09 is why-not, not open" while the agenda actually sits `pending` in the queue; items can never become `selected`; the queue is 9/10 permanently `why-not`.
- Allow the `why-not → selected` transition in `transitionPriorityItem`.
- In `orchestrator/src/cycle.ts` (~1522-1553), stop letting a `selectPriorityItem` throw overwrite the published commission reason (`schedulerBlockedReason`, ~338-342) with the false "the agenda queue refused it".
- De-duplicate seeded priority items: the seed loop (~cycle.ts:1387-1424) re-creates a growth-objective question while an older generation of the same question is still retained; keep one open generation per venture.
- Add a test: a `why-not` item can be commissioned end-to-end (agenda queued, item `selected`, no false reason).

### 2.2 Raise agenda supply: one commission per agenda venture per morning
Today `resolveMorningCommission` (`cycle.ts:232-269`) accepts only the first seat's request (one commission per day, total), and `maxRequestsPerMeeting` is frozen at `z.literal(1)` (`orchestrator/src/meetings/agenda.ts:31`).
- Loop the commission resolution so **each agenda venture** can get its first valid `meetingRequest` accepted per morning (keep the AUDIT + ≥3-approvals gate per meeting, not per request).
- Relax the schema literal to an int range 1–4 and set `maxRequestsPerMeeting: 2` in `config/meeting-policy.json` (morning may now also carry a second request from a different seat for a different venture; chair follow-ups stay 1 per room).
- Queue caps (`maxPending: 24`, `perVenturePendingCap: 8`) stay.
- Update the morning-council instruction (`orchestrator/src/standup/live.ts` roleSystem) so seats know one commission per venture is available.
- Precedent for policy-class changes: commit `7fe904f` (moved tt-marketing to `standingAgendaPhases` touching config + agenda.ts + run.ts + standup/live.ts + tests in one commit). Follow that shape.

### 2.3 Make room runs idempotent per date (bug, cost)
On 2026-08-05 tt-marketing was billed 6× in ~63 minutes ($0.0725 instead of ~$0.012) because portfolio rooms have no same-date guard; the article slots already have one (`recordClosedArticleSlot` / existing-run check, `orchestrator/src/mma-files/live.ts:58-81`). In `orchestrator/src/portfolio/run.ts` (~852-1091): before calling any seat, check for an existing `state/meetings/<date>-<phase>.json` with a live (non-PAUSED) outcome for that date and return it instead of re-billing. Keep the deliberate exception: a gate-skip/PAUSED record must not block a later firing that finds the gate open.

### 2.4 Decision-shaped agendas
Agenda summaries are model-written and often process-shaped ("Supply fight-week event priority list…"), producing PLAN records that decide nothing. In the morning-council and chair follow-up instructions (`standup/live.ts` roleSystem; `run.ts:1144` system string), require the agenda summary to name the decision the target room must take ("Decide X between A and B" / "Approve or kill Y"). Surface the consumed agenda as the room's mandatory first line (already half-done at `run.ts:1074-1076` and `1148-1153` — make the objective line read "Decide today: <agenda summary>").

### 2.5 Self-feeding desk agendas
With §2.2 in place, instruct chairs to keep their venture's loop alive: CANVAS (mag-editorial) always files a follow-up agenda for mag-desk on a day an article was assigned ("Review today's published article and set tomorrow's angle"); PULSE (tt-marketing) always files tomorrow's focused question (see §9.2). These are prompt-instruction changes only; the queue machinery already delivers them.

### 2.6 Stop paying rooms that restate deterministic pre-steps
- `mma-analysis` (19:00): gate the room on the existence of at least one file in `state/mma/model-runs/` (the deterministic refresh in `run.ts:1031-1043` continues regardless). Until the odds key lands (owner item), the room records a $0 pause with the plain reason "No model run exists to review yet — waiting for the odds data key." Once model runs exist, it opens on agenda as today.
- `mag-desk` (20:00): stays agenda-gated; trim cast in §8. With §2.5 it will convene exactly on days an article shipped.
- `mma-intake`: keep as-is (change-triggered; its casts already thin by weekday). Remove only the Friday REACH push (§8.3).

### 2.7 Honest cu-edition meeting record
`createLiveEditionMeeting` (`orchestrator/src/meetings/record.ts:345-407`) fabricates transcript turns for STET/HACEK/SPARK/AUDIT who made no call. Rewrite it to attribute turns only to what ran: HERALD gavel (curation outcome), STET (write/copy-gate outcome, only when the write stage ran), HACEK (register outcome, only when the Czech register review ran), plus the close turn. Drop SPARK and AUDIT from the cu-edition cast in `config/ventures.json` (they have no function there); cast becomes `[HERALD, STET, HACEK]`. Update the `edition-room` preset in `config/agent-routing.json` in the same commit (ventures.json controls billing; the preset controls what the record claims — keep them aligned). Label the slot for what it is on the site: the calendar/meeting page should call cu-edition "Edition production" rather than implying a five-agent deliberation (see §10).

### 2.8 Every closed room states a plain reason
`recordNoAgendaCycle`/skip writers already record *why*; the wording is jargon ("No bounded agenda was due, so the specialist room did not open and no model was called"). Change the recorded sentences at the source (`run.ts` `shutBy*` builders, `orchestrator/src/meetings/reconcile-cli.ts` NO_RECORD_REASON, skip writers in `cycle.yml` recorders) to plain language, e.g.:
- no agenda → "Nothing was queued for this meeting to decide, so it did not meet and nothing was spent."
- no material change → "Nothing new arrived since the last check, so this meeting was not needed."
- budget stop → "The day's spending limit was reached, so this meeting was postponed."
- failed run → "The run behind this meeting failed before it finished." (no URL — see §10.4)
- never ran → "No run arrived for this slot."

---

## 3. Language and per-meeting cost — the verdict

### 3.1 Decision: deliberation stays in English. Do not switch rooms to Czech.
This is final; record it in the decision file from §0.4 so the question stops resurfacing. The honest numbers:
- All deliberation together costs $0.08–0.15/day. Czech deliberation would *raise* cost: ~+25–35% on output tokens and, if packets/prompts were translated, ~+20–30% on input (input is >90% of seat tokens; e.g. mma-intake 114,874 in vs 8,381 out) — roughly +$0.05–0.09/day for zero reader benefit, because meeting outputs feed the Czech magazines only as language-neutral data (subject refs, slates, evidence ids), and the Czech that readers see is already written natively in one call per article.
- Deliberation seats run the cheapest models (claude-haiku-4.5, gpt-5.6-luna at reasoning effort none) under a strict English JSON contract; Czech instruction-following on these small models raises parse-failure waste (malformed JSON already costs paid seats).
- Czech would break the English-calibrated cost estimator (`estimateTextCall` at chars/3.5 — Czech runs ~2.5–3), the English transcript guards, and the byte-identical cacheable prompt prefix.
- The public transcript site is the English corporate site by locked brand decision. If the owner ever wants Czech meeting pages, the path is translating record-time template strings and the site dictionary — never Czech seats.

### 3.2 Close the one real reader-facing language gap: Czech "why this story"
Every live DNESKAi edition renders an English template sentence under the Czech heading "Proč právě tento příběh" (`articleRationale` in `orchestrator/src/edition/production.ts:181-186, 311-314`; rendered by `aifirst/components/editorial/MakingOf.tsx`). Fix: add an optional `why_this_story` field to the Czech write-call tool schema (`orchestrator/src/edition/write.ts:24-34` / `WRITE_TOOL_INPUT_SCHEMA`), have STET write one Czech sentence in the same call (~+$0.001/edition), thread it through `buildEditionPackage` instead of the English template, and review it with the Czech rules in `orchestrator/src/edition/stet.ts` rather than the English board register. Fallback when absent: a Czech template sentence, not the English one.

### 3.3 Pin Czech tags
Tags flipped language mid-week (Aug 3/5 English, Aug 6 Czech), which resets the repeated-topic freshness window and splits `/topics` on the magazine. In `WRITE_SYSTEM` (`edition/write.ts`), require Czech ASCII slugs for tags; when reading `recentEditionTags` treat the pre-2026-08-06 English-tag window as warm-up (comment + date guard) so `repeatedTopicShare` measures one vocabulary.

### 3.4 Execute the budget revert with the cap corrected (before Sunday 2026-08-09)
The $0.35 per-run edition cap no longer fits the pipeline (source-body fetching made write/rewrite calls $0.10–0.12; curate + write + 2 configured rewrites ≈ $0.38–0.45). Reserve refusals were the single most frequent edition-killer (Aug 1, 2, 4). Do now, in one commit:
- `.github/workflows/cycle.yml`: `DAILY_BUDGET_USD` 2.00→1.00, `MAX_CYCLE_BUDGET_USD` 0.40→0.20, `CU_MEETING_BUDGET_USD` 0.16→0.08, and `EDITION_PRODUCTION_BUDGET_USD` 0.70→**0.50** (not 0.35).
- `config/edition-quality.json` + `orchestrator/src/edition/config.ts`: change the `editionProductionUsd` `z.literal(0.35)` to `z.literal(0.5)` (both together).
- Delete the `temporaryCaps` list in `orchestrator/tests/ci-policy.test.ts` and pin the new values.
- Keep `maximumRegenerationAttemptsPerDate: 2` and keep `EDITORIAL_REVIEW_BLOCKS_PUBLICATION = false` (`orchestrator/src/edition/publication-gate.ts`) — this is now the permanent policy: truth gates still kill; style/freshness verdicts publish with their `unresolvedReview` block recorded. Note it in the decision record; remove the two dated revert items from `NEEDS_YOUR_HELP_NOW.md` (§12).
- Monthly ceilings are untouched.

### 3.5 Add a same-day edition retry slot
Every delivered edition except Aug 6 needed a second run, and every second run that ran succeeded. Add one more cu-edition dispatch at 09:00 Prague (Vercel cron entry + `site/vercel.json` + `site/src/lib/cron-slots.ts` + cycle.yml dispatch path — follow the existing punctual-dispatch pattern). `hasDeliveredPublishedEdition` already makes it a $0 no-op when the 05:00 slot published. Update the cron-pinning tests.

### 3.6 Publish an honest no-edition record every terminal day (bug)
`shouldQueueEditionDelivery` (`orchestrator/src/edition/live.ts:64-68`) queues a public no-edition record only for `budget_exhausted` and `source_gate:*`; `quality_block`, `content_invalid_after_regeneration`, `stet_block_after_rewrite`, `curation_failed`, `production_failed`, `delivery_invalid` stay internal, so a gated $0 day looks identical to a crash on the magazine (Aug 2 has no board JSON at all). Widen it: any run whose final result for the date is no-edition queues the honest no-edition package (the aifirst consumer already supports provisional no-edition boards replaced by later same-day editions).

### 3.7 Fix the silent stale-skip in the outbox (bug)
`orchestrator/src/delivery/outbox.ts:58` skips any stale (date ≠ today) no-edition package **forever** with no receipt, no INBOX item, no deletion — this is what orphaned Aug 2. When skipping a stale no-edition: write a terminal receipt (status `superseded`), remove the package file. Retire the orphaned `state/edition/outbox/2026-08-02-9e5e…json` now (ship it via the existing `delivery_only` dispatch or mark it superseded with a receipt — prefer shipping it so the magazine's Aug 2 gets its honest "no edition" explanation).

### 3.8 Auto-close INBOX delivery items on later success
`CAUGHT-UP-DELIVERY-2026-08-05` is still open although the same package delivered 2 hours later. When `recordDelivery` writes a delivered receipt for a date, tick the matching `CAUGHT-UP-DELIVERY-<date>` INBOX item. Close the 08-05 item now.

### 3.9 Fix the aifirst daily sentinel (bug — false alarms daily)
`aifirst/.github/workflows/daily.yml` (~lines 37-59) still requires `<date>.en.mdx` AND `.cs.mdx`, so every Czech-only good day opens a false "missed-day" issue. Change it to require `.cs.mdx` + board hash match, with `.en.mdx` checked only when the file exists.

### 3.10 Prompt hygiene
Delete the stale sentence in `CURATE_SYSTEM` (`orchestrator/src/edition/curate.ts:19-23`) that warns about "the English writing and the Czech translation" — neither stage exists; name the single Czech write stage instead.

---

## 4. One article per day, per magazine

### 4.1 MMA Files: declare the single daily slot
The pm slot has been killed every single day since launch; make one-a-day the contract:
- `config/ventures.json`: mma-files `productionJobs[0].cadence` → `"daily@10:00"` (the registry schema regex already permits it); envelope stays 0.16 (one slot).
- `orchestrator/src/ventures/registry.ts:73-82` (`resolveProductionClock`): add the `daily@HH:00` branch for `article-production`, mapping to the single phase `article-am` (today it throws on anything but `2x-daily`).
- Regenerate the cycle.yml cron list from `cronPayloads`; drop `article-pm` from the workflow_dispatch phase enum and from `site/vercel.json` / `site/src/lib/cron-slots.ts`.
- **Do not reshape `EditorialSlateSchema`** — keep the two-slot am/pm tuple; the pm slot is structurally `killed` with `killedReason: "single-slot cadence"` from the slate builders (`run.ts:1377-1470`) and `deriveEditorialSlate` (`live.ts:419-506`).
- Update the room objective strings in ventures.json ("Assign or kill both article slots" → one slot; same for mag-desk).
- Update the pinned tests: `orchestrator/tests/portfolio-schedule.test.ts:109`, `vercel-cron.test.ts:96-97`, `cycle.test.ts:194-215`, `meetings.test.ts:401-416`, `mma-files-derived-slot.test.ts`, `scheduled-run-leaves-a-record.test.ts`, `ci-policy.test.ts:51-64`. The calendar drops the slot automatically once the phase leaves the clock.

### 4.2 MMA Files: protect the subject supply
The repeat rule marks every fighter ref ever covered as spent, against a 92-card roster — the single slot will starve within weeks. Introduce a time-boxed repeat window: a fighter becomes eligible again **6 weeks** after last coverage, or immediately after they complete a new bout. The rule is deliberately duplicated in two places — change both together: `orchestrator/src/mma-files/live.ts:430-436` (`deriveEditorialSlate`) and the matching covered-set logic in `orchestrator/src/portfolio/run.ts`. Keep the existing "rescue never repeats a subject" behavior within the window.

### 4.3 mma-files repo: finish the Czech-only cleanup
- `CLAUDE.md`: rewrite the stale rules — it still says "Public bilingual (EN/CS)" and "Every public article needs both an English and a Czech version", and references `src/lib/style-guard.ts` which no longer exists (the style gate lives in quorum's STYLEBOOK review). State the real contract: Czech-only (`LOCALES = ["cs"]`), style gate upstream in quorum, `consume:boardless` is the only write path.
- `src/config/site.ts:19,27`: the taglines still read "Zápasová žurnalistika / Data / Česky + anglicky" and "…česky a anglicky." Drop the English claim.
- `src/i18n/`: remove the dead `en.ts` dictionary and narrow the i18n types to `cs` (LOCALES is already `["cs"]`); update the CLAUDE.md sentence that says the type system enforces both locales.
- `src/components/fightaiq/FightAiQFeed.tsx`: delete the unreachable English copy dict.
- Confirm `NEXT_PUBLIC_DEMO_MODE=false` stays documented as required in production (demo defaults to true when unset — `src/lib/repository.ts:62-66`).

### 4.4 aifirst repo: fix the control document
`aifirst/CLAUDE.md` still describes the retired product: "bilingual, Git-native daily briefing", "English is unprefixed; Czech uses /cs", lib/delivery "validates bilingual parity", media boundary "exactly one dated WebP", brand "Caught Up". The code is right and the doc is wrong (schema requires `cs` only, Czech serves at root, images are per-slug hero+thumb in webp/png/svg with the SVG FRAME fallback as a legitimate delivered state, publication is DNESKAi). Rewrite those sections to the shipped contract so future agent sessions stop being instructed to rebuild the retired one.

### 4.5 FightAIQ: unblock the model chain (owner item + one gate)
The whole chain (odds match → second independent source → bout `confirmed` → `runConfirmedBoutAnalysis` → stats → `/data-desk`) is built and has never fired for want of `THE_ODDS_API_KEY` (and optionally `CITO_API_KEY`). Keep the owner item prominent (§12). In code, do only §2.6's mma-analysis gate; do not build any workaround or new data source.

---

## 5. Images — contextually relevant, illustrative allowed, $0

The free pipeline already exists (keyless Openverse + Wikimedia, optional free-tier Pexels/Pixabay, sharp recompression, deterministic FRAME SVG fallback; strict license allowlists enforced on both ends; measured spend $0). gpt-image-2 has **zero call sites** — keep it that way.

### 5.1 Port the curated-illustrative ladder to DNESKAi
MMA already runs the right design (identity photo from Wikidata P18 → 6 curated Commons sport photos with live license re-check → FRAME SVG). DNESKAi's photo presence currently depends on search luck. Build `orchestrator/src/images/` a curated illustrative set for DNESKAi cloned from `illustrative.ts`: one hand-reviewed Commons scene-photo list per `VISUAL_SUBJECT` concept ("data centre", "semiconductor", "government building", "newsroom", …), keyed by the day's `imageSubjectQuery` concepts, slug-seeded rotation, tried **before** the live Openverse/Wikimedia search; live search stays rung 2; FRAME SVG rung 3. Keep the no-recognizable-face curation rule.

### 5.2 Give event-subject MMA articles the illustrative rung
`articleImageCandidates` (`orchestrator/src/mma-files/live.ts:654-675`) routes event refs to name search only, so previews fall straight to the SVG plate. After the licensed search returns nothing for an event ref, fall back to `illustrativeSportPhoto({seed: refs.join('|')})` before the plate. Never reintroduce name search for people (the politician/operetta-singer incidents are documented in the module comments).

### 5.3 Widen the vocabularies
Extend `VISUAL_SUBJECT` (`orchestrator/src/images/subject-query.ts`) with the tags the desks actually emit (agents, models, startups, funding, openai/anthropic → "technology company office", space → "rocket launch", …), and add 2–4 more curated MMA photos (weigh-in stage, gloves/canvas, arena exterior) under the same review rule.

### 5.4 Fix the DNESKAi alt-text bug (shipped defect)
`orchestrator/src/edition/production.ts:372-378` attaches the writer's *imagined-illustration* alt to real photos (the delivered 2026-08-06 edition describes a schematic that does not exist over a real Flickr photo). Port the MMA fix: prefer `candidate.altCs` (the archive's own description — `heroAltCs` in `orchestrator/src/mma-files/pipeline.ts:36-43` is the pattern), writer alt only as last resort. Then remove `illustration_prompt` from the writer schema and package (`edition/write.ts`, `edition/package.ts`) — nothing generates from it and it wastes tokens and caused the wrong alt; keep the frontmatter field optional on the aifirst read side for legacy MDX.

### 5.5 Clean the FRAME plate (reader-visible plumbing)
`frameSvg` (`orchestrator/src/images/article-image.ts:98-100`) draws `FRAME · <hex-fingerprint>` and raw uppercase ref slugs (`FIGHT-WEEK-PREVIEW AMANDA-LEMOS BILLY-QUARANTILLO`) onto published covers, and still brands DNESKAi plates "CAUGHT UP" (brand literal in `config/edition-quality.json`). Remove the fingerprint text node, render human-readable Czech labels (format name, fighter display names) or just wordmark + date, and change the displayed brand for the caught-up venture to DNESKAi (update the tests that pin the plate; sealed past packages are untouched — only future covers change).

### 5.6 Lock paid generation out
Mark the `IMAGE` role in `config/models.json` as avatar-only (comment) or remove it, keep `AVATAR_IMAGE` for owner-triggered avatar repairs, and add a small test pinning that the budget ledger contains no `kind:"image"` entries from article pipelines. Media caps stay.

---

## 6. KPIs paired with results

### 6.1 Fix the collectors that lie (bugs)
`orchestrator/src/metrics/quarterly-collector.ts`:
- Line ~556: `quarterly_review_consumed_count` is hardcoded `0` while line ~555 computes `consumed` and never uses it (4 consumed agendas exist; target 20 — permanently off-track). Return `consumed.length`.
- Line ~539: `titty-tuesdays#commerce_readiness_dossier_complete` is hardcoded `0` reading nothing. Delete the KPI from `config/kpis/2026-Q1.json` (no dossier is specced).
- Lines ~187/501: the period clamp excludes future bouts, so `mma-files.upcoming-event-coverage`, `fightaiq.event-card-minimum-completeness`, `fightaiq.prediction-coverage` read "unavailable" although 32 announced bouts and 2 event cards exist (real coverage 2/2). Filter event-scoped denominators by the quarter window, not `periodStart..now`.
- Line ~301: `mma-files.complete-article-rate` is `articles.length > 0 ? 1 : null` — a vanity 1.0 whose display name still demands English. Replace with a real predicate over the article packages (localizations.cs present ∧ image present ∧ sources.length ≥ 1) and rename to drop English.
- `caught-up.healthy-sources` counts `enabled:true` config flags; derive it from the latest cu-edition scorecard's `sourceResults` (sources with status success in the most recent run) instead.

### 6.2 Add the KPIs the owner actually manages by (all computable from existing state)
Add to `config/kpis/2026-Q1.json` + collector:
- **Delivery reliability** per magazine: DNESKAi = days with a delivered edition or an explicit delivered no-edition record / elapsed days (`state/edition/deliveries/`); MMA = days with ≥1 published run record / elapsed days (`state/ventures/mma-files/runs/`), denominator 1 slot/day per §4.1.
- **Cost per delivered unit**: cu-edition ledger-phase spend / editions delivered (currently ≈$0.50); MMA (`article-production`+`mag-editorial`+`mag-desk`) / articles delivered (≈$0.29). Direction at-most, pace level.
- **Titty Tuesdays**: marketing ideas recorded per week (`state/ideas/titty-tuesdays/ledger.jsonl` — the parsing code already exists for caught-up at collector lines ~415-423) and ideas advanced past `proposed`. These replace `tuesday-posts`/`followers`.
- **CarouselEngine**: keep `carousel-studio.determinism`; add "released articles with a rendered deck receipt / released articles" once §7.4 writes a render receipt; delete `live-templates` (counts shipped seed code, 10/10 on day one), `passing-proposals`, `observation-brand-coverage`, and the four `easel.*`/`motif.*` registry entries (§7/§8).

### 6.3 Defer the socially-blocked KPIs
Move out of the active Q1 set (keep the definitions parked with their `unavailableReason`): `caught-up.social-posts`, `mma-files.social-posts`, `titty-tuesdays.tuesday-posts`, the three followers KPIs, `caught-up.followers`. At minimum strip `critical: true` from `carousel-studio.engine-post-rate` — a critical KPI whose denominator cannot exist for a month otherwise forces a quarter-end reassessment through no fault of the venture.

### 6.4 Make the all-in cost KPI measurable at zero
`company.monthly-all-in-usd` (critical) reads "unavailable" because `config/fixed-costs.json` has `costs: []`. Add an explicit owner-confirmed flag in that file (e.g. `"confirmedNoFixedCosts": true` — set it, the owner has confirmed) so empty-but-confirmed evaluates as fixed $0 and all-in = API + 0.

### 6.5 Resolve the 77 sourceless registry KPIs
`config/kpis.json` (79 role entries; only ~15 have a wired source). Decision: keep the entries as an **ownership record**, not KPIs — rename the concept in the file (measurement kind stays `none` with reasons), and correct the two prompts that lie about it: `orchestrator/prompts/_shared.md` (claims every owned KPI arrives with an `ok|warn|fail|n-a` status) and `retro.md` (claims tightened targets are written to config/kpis.json). Delete entries owned by retired agents (§8).

### 6.6 Reconcile the finance surfaces
- Regenerate `state/FINANCE.md` from the ledger (it reports $0.52 through 08-01 while the ledger holds $3.05 through 08-06) — or replace its numbers section with an auto-generated block and a note that the ledger is canonical.
- `state/treasury/ledger.json`: `monthlyOperatingCapUsd` 20 → 30 (matches `budget-2026-08e`).
- Delete or auto-generate `state/SCORECARD.md` (hand-written, stale, contradicts `state/kpis/latest.json`).
- Remove the dead `DIGEST_BUDGET_USD` env from cycle.yml (no consumer).

### 6.7 Pair KPIs with days on the site
Extend `/results` (`site/src/lib/daily-results.ts`, `site/src/app/results/page.tsx`): attach the morning snapshot's per-venture KPI statuses (`state/kpis/latest.json`) to each day's table; render a "no digest recorded for this day" row for missing digest dates (08-04, 08-06 are holes today). All render-side; no new writers.

---

## 7. CarouselEngine — demote the venture, keep the engine

**Verdict (final): Carousel Studio stops being a meeting-holding venture.** The room has never held a live session, its only unique capability (agent-authored template proposals) has zero output and zero consumers — the production pipeline selects only the 5 code-generated deck styles. Everything of value is already deterministic code that renders at $0.

### 7.1 Cancel the studio meeting (config + surface sweep)
- `config/ventures.json`: carousel-studio `meetings: []` (schema allows it); venture status stays `operating` (the engine operates); adminTabs stay `[templates, decks, inspiration]` — drop `social-lab` (placeholder).
- `config/meeting-policy.json`: remove `studio` from `agendaRequiredPhases` and from the `transitions` map.
- `.github/workflows/cycle.yml`: remove the studio cron + phase option. `site/vercel.json`: remove the two `/api/cron/studio` entries. `site/src/lib/cron-slots.ts`: remove `studio` from SCHEDULED_PHASES.
- `orchestrator/src/contracts/meeting-agenda.ts:20`: remove `studio` from AgendaPhaseSchema; remove the studio branches / PortfolioPhase member in `orchestrator/src/portfolio/run.ts` (~97, 319, 345, 740, 1131, 1481). Keep the historical `studio` meeting-record kind readable so past records still render.
- `config/agent-routing.json`: delete the `studio-room` preset.
- Supersede decision D11's meeting clause with the §0.4 decision record (the D11 core — deterministic renderer, no model/image-provider calls — stays binding).
- Delete the now-obsolete owner item "Add 3–5 inspiration links for Carousel Studio" from `NEEDS_YOUR_HELP_NOW.md`.
- Update `site/src/components/carousel-studio-venture-page.tsx` and the admin ventures list: present it as an engine ("Deterministic rendering, $0 per deck, no meetings"), not a paused room.
- The clock-pinning tests (`vercel-cron.test.ts`, site cron-slot tests, `ci-policy.test.ts`) enforce consistency — update them in the same commit.

### 7.2 Cap decks at 5–8 slides (owner spec)
`quorum/studio/src/slides.ts:19`: `MAX_SLIDES` 10 → 8 (MIN stays 5). `studio/src/library.ts:456-460`: generated deck template lengths 5..8 (`Array.from({length: 4})`). Check `state/social/packs/` for any stored reference to a `deck-*-9/10` id first; if any exists, keep 9/10 resolvable in `resolveLiveCarouselTemplate` but never selected. Update `studio/tests/slides.test.ts`.

### 7.3 Put the article photo on slide 1 in production (owner spec; currently preview-only)
The templates reserve `ARTICLE_HERO_SLOT` with scrim and the admin preview proves it, but both production renders omit the `images` argument. Wire it exactly like the CLI does (`orchestrator/src/social/deck-cli.ts:98-105`, using `toRenderablePng` — librsvg cannot decode WebP data URIs):
- `orchestrator/src/social/pack.ts:236` (`composeEditionSocialPack`): decode `editionPackage.image?.hero_bytes_base64` → `images: {[ARTICLE_HERO_SLOT]: heroPng}`.
- `orchestrator/src/mma-files/frame.ts:51` / `social.ts`: same for the MMA cover render; render the cover via PNG (`renderCarouselPng`) rather than embedding base64 photos inside stored SVGs.

### 7.4 Clickbait cover headline (owner spec)
The cover currently reuses the article title. The frontmatter schema already carries optional `alternative_headlines` (1–3, `orchestrator/src/contracts/article-frontmatter.ts:43`) with no producer or consumer. Have both Czech writers emit it (add the field to the DNESKAi write tool schema in `edition/write.ts` and the MMA write schema in `mma-files/live.ts` — one punchy Czech headline, factual, no fabrications, style-gate reviewed), and use `alternative_headlines[0]` as the deck cover text at all `buildArticleDeck` call sites (`social/pack.ts`, `site/src/lib/admin-decks.ts`, `deck-cli.ts`, `mma-files/social.ts`), falling back to the title. Write a render receipt per released article (date, slug, templateId, style, slide count, hashes) into venture state — this feeds the §6.2 engine KPI.

### 7.5 Make the /admin template switcher binding (owner spec; currently preview-only)
Add a persisted override store `state/ventures/carousel-studio/deck-style-overrides.json` (`{venture, slug, style, changedAt}`), written by a new admin route modeled on `site/src/app/admin/api/carousel-studio/status/route.ts` + `carousel-studio-admin-store.ts` (local write in dev, GitHub contents API in prod). Consult it before `deckStyleFor` at the three call sites: `social/pack.ts:170`, `mma-files/social.ts:11`, `admin-decks.ts:76` (so the panel shows the effective style). Same text and image, different design — exactly the owner's ask.

### 7.6 Stop committing unusable social inventory while channels are locked
~1.4–2.1 MB of PNG frames per edition day is being committed into `site/public/social/` (plus MMA SVG variants and an English-locale quote card) that no channel can consume and that is deterministically re-buildable from committed packages. Gate `composeEditionSocialPack` (cycle.ts:780) and `composeMmaFilesSocialQueue` on channel enablement (`channels.json` `enabledByHumanAt`) — the admin decks tab already re-renders on request for review. Delete the accumulated `site/public/social/<date>/` directories and `state/ventures/mma-files/media/` variants (regenerable). When channels go live, re-enable composition; fix the quote card's hardcoded `'en'` locale to `cs` at that time (`social/pack.ts:208-215`). Keep queue idempotency/INBOX plumbing intact — gate, don't delete.

---

## 8. Agent roster — fewer, honest seats

40 agents exist, all marked active. Decisions below reduce the working roster to 30. Mechanism notes: `config/venture-agent-controls.json` `disabled` lists are the safe per-venture switch (already filters every cast before billing); `config/agent-routing.json` status changes are currently a trap — `routeBoardroom` (`orchestrator/src/boardroom/router.ts:134-135`) **throws** if a preset-required agent is not `active`.

### 8.1 Make "paused" safe, once
Change `routeBoardroom` to treat a non-active preset-required agent like a disabled one (skip + record in the participants note) instead of throwing, with a test. Record this in the org-change record — it slightly relaxes the "required seat cannot vanish" guarantee in exchange for pausable agents that don't crash rooms.

### 8.2 Retire (status `retired` in `config/agents.json` + `agent-routing.json`; keep profiles/portraits for history; delete their registry KPI entries):
- **SPLIT** — its mission is literally to remain idle; the guard it personifies is enforced deterministically (`METRICS_INGESTION_ENABLED`).
- **EASEL**, **MOTIF** — studio-exclusive; the studio meeting no longer exists (§7.1). Remove all three from `venture-agent-controls.json` lists.

### 8.3 Pause (status `paused`; reactivation is a one-field flip):
- **THREADS**, **INSTAGRAM** — drafting agents for channels that don't exist; already disabled everywhere. Keep their ids (channels.json binds them).
- **RADAR** (SEO) — both magazines are deliberately noindex until they have a body of work; no seat anywhere.
- **LENS** (analytics) — analytics deliberately deferred; no seat anywhere.
- **SCRIBE** — its only seat was the studio room.
- **SCOUT** — its only seats are the incubator rooms, which §8.5 pauses.
- **FUNNEL** — channel/measurement plans are unactionable until ~1 month before social activation; remove from the TT wheel (§9.3); re-activate when credentials are being prepared.

### 8.4 Cast corrections (config honesty; $0 behavior change):
- Remove **REACH** from the mag-desk cast (`config/ventures.json:330`) and delete the Friday REACH push (`run.ts:1070`); it is disabled and filtered every time anyway. Keep it in the disabled list until social unlocks. Update the `mag-desk-room` preset in the same commit.
- Trim **mag-desk** cast to `[CANVAS, PIVOT, AUDIT]` (JAB writes in the morning; the evening review needs the chair, the FightAIQ liaison, and the veto).
- cu-edition cast per §2.7: `[HERALD, STET, HACEK]`.
- Keep mma-intake, mma-analysis, mag-editorial casts otherwise as-is — they serve the daily article path.
- Do not restructure the morning council and do not downgrade VIZE/FORGE from sonnet: it is the agenda-seeding engine (~$0.08/day worst case) that §2 depends on.

### 8.5 Pause the Magazine Incubator venture
No owner goal needs new venture proposals now; the two rooms (scan 07:00, synthesis 21:00) cost up to ~$0.13/day when convened and produce proposals nobody is acting on. Remove both meetings from `config/ventures.json` (the reliable path — the clock is registry-driven) and set the venture status to `paused`; remove `incubator-scan`/`incubator-synthesis` from `meeting-policy.json` phases/transitions, cycle.yml, vercel.json, cron-slots, and the pinned tests. Keep all incubator state and admin tabs for later revival. Record in the §0.4 decision.

### 8.6 Roster arithmetic after this section
Retired 3 (SPLIT, EASEL, MOTIF); paused 7 (THREADS, INSTAGRAM, RADAR, LENS, SCRIBE, SCOUT, FUNNEL); active 30, every one with a real seat, a pipeline stage, or a genuinely pending function. Update `orchestrator/prompts/_shared.md`'s "Thirty-six non-voting specialists" sentence and any roster counts on the site/agents pages.

---

## 9. Titty Tuesdays — fresh daily ideas into /admin, nothing else

The core flow already works (room → ideas ledger → `/admin?venture=titty-tuesdays&tab=ideas` with rating widgets; no delivery path to the repo exists — verified). Fix the repetition problem and the cast.

### 9.1 Give the room memory of its own ideas (bug: 4 of 7 recorded ideas are near-duplicates of one concept)
In `composePortfolioContext`'s tt-marketing branch (`run.ts:767-772`), inject `readIdeaIndexSlice(state, "titty-tuesdays")` — the INDEX.md whose own header says it is "Compact titty-tuesdays meeting context" and which is currently never injected — plus one instruction line: propose nothing whose title or summary restates a current index entry. Keep it inside the shared packet (preserves the cacheable prefix).

### 9.2 Rotating daily focus + self-agenda
- Deterministic floor: derive the day's focus from the season file — `products[dayDistance(startsOn, date) % products.length]` with its campaignArc chapter — and append "Today's focus: <concept name> — <one-line frame>" to the tt-marketing objective (`portfolioIdeaInstruction`, `run.ts:162-167`; season parsing exists in `orchestrator/src/titty-tuesdays/`).
- Adaptive layer: instruct the chair (PULSE) to always file a `followUpRequest` carrying tomorrow's focused question (transitions `tt-marketing → tt-marketing` already allow it).

### 9.3 Fix the weekday wheel (`orchestrator/src/titty-tuesdays/schedule.ts`)
New wheel: **Mon COHORT, Tue STUNT, Wed COHORT, Thu SCENE, Fri —, Sat —, Sun —** (core PULSE/ANGLE/AUDIT daily).
- COHORT twice weekly because audience specs are the binding constraint: the social unlock counts only approved plans with non-empty `audienceRefs`, and ANGLE's plans keep failing without audience input (the 08-05 plan is the code fallback with `audienceRefs: []`).
- Remove SPARK (its mission is DNESKAi growth — wrong venture), PALATE (its distilling already runs as the free pre-step; zero ratings exist), VAULT (its room adjudication is deterministic code), FUNNEL (§8.3).
- Keep STUNT and SCENE — they produce exactly the marketing ideas the owner wants in /admin.
- Delete the dead `captionsNeeded`/QUILL parameter. Update `orchestrator/tests/titty-tuesdays.test.ts`.
- Note in `config/ventures.json` (comment/docs) that the live cast comes from schedule.ts, not the registry cast field.

### 9.4 Plan quality
Require ANGLE's marketingPlan KPIs to reference stored measurements only (ideas rated, Perfect-rated count from `state/ratings/`, approved plans toward the 4-plan unlock) — replace the unmeasurable placeholder sentence in the fallback plan builder (`run.ts:1305-1375`).

### 9.5 Season succession
`season-001.md` ends 2026-10-30 and nothing creates season-002; from 10-31 the room would ideate against an expired season forever. Add an `[owner:me]` NEEDED item ("write season-002 before 2026-10-30"), and log a plain warning line into the room record when the newest season is expired.

### 9.6 Admin hygiene
Drop the permanently-empty `visuals` tab from titty-tuesdays `adminTabs` (`visualCards()` hardcodes caught-up), or extend `visualCards` — dropping is the decision. Owner action to note in §12: rate the existing 7 idea cards so the taste loop stops running blind.

---

## 10. Frontend — the calendar and the meetings are the product

### 10.1 Render live company-meeting discussions (worst gap on the site)
`site/src/app/standups/[date]/room/page.tsx:209-221` renders the message list only for fixtures — every **live** morning/afternoon/night meeting page shows a section titled "Read every message." with **zero messages**, although live standup records contain full turns and `standup-records.ts` parses them. Reuse the exact MessageList block from `site/src/app/meetings/[id]/page.tsx:127-144` for non-fixture records. Also remove the fixture-only furniture that renders on live pages: the hardcoded gates array, "Sample sources / 0 count as real proof" bars (`standups/page.tsx:102-105, 135-137`), and the raw-agent-code replay chapter copy.

### 10.2 Discussion first on the meeting page
`/meetings/[id]` buries the transcript under ~2–3 screens of header/decision/cost tiles/speakers. Reorder: compact one-line header (room name, date, status badge, and — when `agendaRef` is set — "What this meeting was asked to decide: <agenda summary>"), then the MessageList immediately, then Recorded decision / votes / cost tiles / participants collapsed below. Make the back link context-aware (return to the week the reader came from, not always `/#week-board`).

### 10.3 No-meeting cells: the reason and nothing else
- PAUSED records (the 13 "no agenda was due" rows): in `buildPublicCalendarFeed` (`site/src/lib/calendar-feed-model.ts:284-299`), stop emitting `meetingHref` for PAUSED; emit the plain-worded reason as `decisionOneLiner` so the cell renders reason-only exactly like a skip; stop generating public pages for PAUSED ids. Combined with §2.8's plain sentences, a quiet slot shows one human sentence and is not clickable.
- Missed cells ("Did not happen") currently carry no reason: add the copy line "No run arrived for this slot." the same way `LATE_SLOT_REASON` exists.
- Killed article slots keep their one-sentence reason; update `articleRunReasonCopy` (`week-board.tsx:258-265`) wording that still says "slate" → "story meeting".

### 10.4 Purge machine text from public surfaces (defense in depth, three layers)
1. **Write plain at the source** (primary): map every machine failure code to a written sentence before it enters `decision.summary` or a skip reason — the three offending call sites are `orchestrator/src/delivery/validate.ts` (currently ships raw zod/stderr: the 2026-08-05 record renders `/home/runner/work/...` CI paths, a 40-char SHA and `tsx scripts/consume-edition-package.ts` on the homepage), `orchestrator/src/edition/production.ts` (`budget_exhausted`, `stet_block_after_rewrite` codes), and the skip writers (GitHub Actions URLs, `at commit 34aef4b`). Raw detail goes to an internal field/run report, never the public summary.
- 2. **Reject at the parser** (guard): extend `forbiddenPublicText` (`site/src/lib/meeting-record-model.ts:76-77`) to reject `http(s)://`, `/home/` and `/work/` paths, hex strings ≥10 chars, and snake_case/ALL_CAPS code tokens in public fields — a leaking record fails parsing instead of rendering.
- 3. **Demote the regex layer to a safety net**: in `site/src/components/agent-language.ts`, fix what it mangles — apply `publicDecisionLabel` to status tokens **before** the regex chain (stops `NEEDS_RECONCILIATION` → "NEEDS_final checking"), add a `Caught Up → DNESKAi` rule, remove the global em-dash rewrite and the worst clunkers (`bounded`→"clearly limited", `handoff`→"next-step summary"), and stop growing the list — plain-at-source is the standard now.
- Also route the calendar's `decisionOneLiner` (record summaries and skip reasons) through the plain-language path in `calendar-feed-model.ts` — cells, tooltips and aria-labels currently bypass it entirely.

### 10.5 Humanize evidence pills
`publicReferenceLabel` passes raw tokens through (`source:the-odds-api:2026-08-05`, `meeting:2026-08-05-mma-analysis`, `event:ufc:event:…`, `idea-2026-08-05-bbffd7f5`). All live refs follow stable prefixes — write a small parser: `source:<slug>[:date]` → "Source: The Odds API (5 Aug)"; `meeting:<id>` → linked "Meeting notes, 5 Aug"; `event:ufc:event:<slug>` → the event's display name; `idea-<date>-…` → "Idea from 5 Aug". Drop pills that cannot be humanized. Applies on `/meetings/[id]`, decision-replay, and `/standups/[date]`.

### 10.6 The collapsible "See the article that was sent in .json" block (the one allowed tech artifact)
Build one component, `ArticleJsonDisclosure`: a `<details>` inside a MessageBubble; summary text **"See the article that was sent in .json"**; body a `<pre>` with `max-height` (~320px) and inner `overflow-y: auto` scroll. (The `<details>` pattern exists in `council-simulator.tsx` and three admin panels. The transcript parser caps turns at 800 chars — the block must render outside turn text, appended after the delivery/close turn.)
- **MMA Files**: data already on disk — join `state/ventures/mma-files/articles/<date>-<slot>-<slug>.json` (full package) with `state/ventures/mma-files/deliveries/articles/<packageHash>.json` (delivered-at, target commit). Render the block as a synthetic "Delivery coordinator" (RELAY) message on the mag-editorial meeting page of that date, and give the published `article-am` calendar cell a `meetingHref` to it (published article cells are currently dead, unclickable cells).
- **DNESKAi**: the delivered package is currently **deleted** on delivery (`await rm(absolute)`, `orchestrator/src/delivery/outbox.ts:125`). Change delivery to move it to `state/edition/archive/<date>-<hash>.json` instead; then render the same block on the cu-edition meeting page keyed off the record's `editionRef` (equals the package hash in the delivery receipt). Until archives accumulate, fall back to showing the delivery receipt facts.
- Also link each delivered cell/message to the live article: add the public article URL to both delivery receipts at record time (aifirst and mma-files site URLs are known to the delivery step).

### 10.7 Results page speaks plainly
`/results` renders machine slugs and raw digest bullets (`missing_editorial_slate`, `VAULT already hard-stopped idea-…`, the schema_invalid command line). Route kind labels through the week board's label map and bullets/failureReason through the plain-language path; fix `decision-feed.ts:21-29` where five meeting kinds fall through to "Incubator synthesis" in the RSS feed.

### 10.8 Hero, navbar, page cuts
- Hero: keep (it is corporate-and-plain). One wording change: "Fourteen scheduled work slots a day." → "A day of scheduled meetings and article slots." (the count changes with this prompt; don't hardcode a number).
- Navbar (11 items → 6): **Calendar** (`/calendar` — the product finally gets a nav entry; `/` keeps the week board), **Meetings** (`/standups`; absorb `/boardroom`), **Projects** (`/ventures`), **AI team** (`/agents`), **Results** (`/results`; absorb `/metrics` and `/money` as sections), **Company** (`/company`; absorb `/about`, `/governance`, `/disclosure`). Delete the "KPIs" label (the site's own filter bans the word). Keep `/ideas` and `/incubator` routes but out of the nav (linked from venture pages/admin).
- Delete `/boardroom` (duplicate standup archive + fixture theater: hardcoded "Outcome NO_ACTION", `ROOM-20260806-MORNING` ids, CouncilSimulator). Add redirects for the merged/deleted routes.
- Homepage: fix the hardcoded "$0.00" month-to-date (`page.tsx:364-366` — the progress bar beside it already uses the real `monthAllIn`); replace the OperatingTicker's fixture constants ("Real sources 0", "Best idea score 34/50", "Meeting times 06 · 14 · 22") with live values or drop them; replace raw status/agent tokens at `page.tsx:204` and `:236` via `publicDecisionLabel`/`publicAgentTitle`.
- Remove leftover fixture "opportunity" pages from `/ventures/[slug]` `generateStaticParams`; remove the "404 · NO_ACTION" badge on the not-found page; hide commit hashes and raw idea ids on `caught-up-venture-page.tsx` (link the delivered article instead of printing `targetCommit`).
- Gavel aria-labels and meeting copy use role titles, not agent codes.

---

## 11. Rules review — what loosens, what tightens, what stays

**Loosened (by this prompt, record in the decision file):**
- One-specialist-commission-per-day → one per agenda venture per morning (§2.2).
- `NO_EDITION` completion rule → amended: a truth-gate kill is still a successful $0 outcome, but every terminal day must end with either a delivered edition or a **delivered explanation** (§3.6), and one same-day retry slot exists (§3.5). "Never pay to force content" still holds — the retry runs only when nothing published.
- `EDITORIAL_REVIEW_BLOCKS_PUBLICATION` stays `false` permanently (§3.4): style/freshness verdicts publish with the `unresolvedReview` record; truth gates unchanged.
- Edition per-run cap 0.35 → 0.50 (§3.4) so the promised second rewrite is affordable; within unchanged daily/monthly ceilings.
- `assertSuppliedLinks` (`edition/write.ts`): a **single bare-domain homepage citation** becomes a drop-the-link ContractRepair instead of discarding the whole billed call; two or more unsupplied links, or any fabricated deep link, still kill the call. (Owner sign-off: granted here.)
- Fighter repeat rule → 6-week window (§4.2).
- Router hard-throw on non-active preset agents → skip-and-record (§8.1).

**Tightened:**
- Public records reject URLs/paths/hashes/code tokens at parse time (§10.4).
- Portfolio rooms are idempotent per date (§2.3).
- Stale outbox packages get terminal receipts, never silent skips (§3.7).
- `critical: true` allowed only on measurable KPIs (§6.3).
- Social composition gated on channel enablement — no more unusable committed inventory (§7.6).

**Kept, deliberately:** the $30/$25/$1 ceilings; all truth gates; the social triple-lock; treasury/human-payment rules; append-only decisions; the PEOPLE org-change flow (this batch goes through it as one owner-approved record); Czech single-call writing; D11's no-model renderer rule; the agenda-gating principle (a room without a reason to meet costs $0 — supply was the problem, not the gate).

**Config hygiene:** remove the no-op `timezone:` keys under `on.schedule` in `health.yml`/`social-publisher.yml` and adjust the `ci-policy.test.ts` assertion (GitHub reads cron as UTC; the key does nothing); optionally pause the hourly `social-publisher.yml` cron until channels exist (Actions minutes only).

---

## 12. Owner checklist updates (rewrite `NEEDS_YOUR_HELP_NOW.md` accordingly)

Remove as done/obsolete: the two Sunday revert items (§3.4 implements them), the Carousel Studio inspiration-links item (§7.1), and any item this prompt completes. Keep/add, in priority order:
1. `THE_ODDS_API_KEY` (+ optional `CITO_API_KEY`) — the single unblock for all FightAIQ output (§4.5).
2. `PEXELS_API_KEY` / `PIXABAY_API_KEY` — free-tier, widens both magazines' photo pool (§5).
3. Rate the 7 Titty Tuesdays idea cards in `/admin` (starts the taste loop, §9.6).
4. `/admin` credentials in Vercel production (unchanged item).
5. Rename the DNESKAi Vercel project / choose a domain (unchanged item).
6. Enter fixed monthly costs in `/admin` — or leave the new `confirmedNoFixedCosts` flag as the answer (§6.4).
7. Write season-002 before 2026-10-30 (§9.5).
8. Social credentials table — unchanged, ~1 month out.

---

## 13. Acceptance — the definition of done

1. A full day's clock is: 05:00 edition production (+09:00 retry), 06:00 board, 08:00 MMA data check, 09:00 story meeting, 10:00 article production, 11:00 TT marketing, 14:00 checkpoint, 19:00 model check (gated on model runs), 20:00 desk review (agenda-fed), 22:00 checkpoint. No studio, no incubator, no article-pm. Typical measured day ≈ $0.36; worst case ≤ ~$1.00.
2. Every calendar day, both magazines end with either a delivered Czech article/edition or a delivered plain-language explanation; no silent holes (the Aug-2 class of failure is impossible).
3. Every meeting that convenes has a decision-shaped agenda visible at the top of its page; every room that doesn't convene shows one plain sentence and nothing else; no meeting page shows manufactured dialogue.
4. No public surface (calendar cells, tooltips, meeting pages, results, venture pages, hero images) renders URLs, file paths, commit hashes, snake_case/ALL_CAPS codes, or raw ref tokens — verified by the parser guard tests. The single exception: the collapsible "See the article that was sent in .json" block, present on both magazines' delivery days, max-height with inner scroll.
5. Live standup pages show their full message list.
6. Every active KPI has a wired collector reading real state; delivery-reliability and cost-per-unit KPIs exist per magazine; TT counts ideas; no critical KPI depends on a channel that doesn't exist.
7. Every released article renders a 5–8 slide deck: slide 1 = Czech clickbait headline over the article's photo, remaining slides text-only, with a render receipt; the /admin switcher changes the shipped design.
8. Roster: 30 active agents, each with a real function; retired/paused agents crash nothing.
9. All repo gates green: quorum `pnpm test` + site tests/typecheck/build, aifirst `pnpm verify`, mma-files typecheck/test/build. All pinned tests updated with their behavior changes, none deleted.
10. `NEEDS_YOUR_HELP_NOW.md`, both magazine CLAUDE.md files, and the §0.4 decision records reflect reality.

Work through the sections in order §2 → §3 → §4 → §5 → §6 → §7 → §8 → §9 → §10 → §11 → §12; the early sections unblock the later ones. Where a file has drifted from the line numbers given, locate by symbol name and the described behavior — every claim in this document was verified against the repos on 2026-08-06.
