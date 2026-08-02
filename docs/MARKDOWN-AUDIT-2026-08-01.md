# Markdown audit — 2026-08-01

> Historical pre-Carousel-Studio audit. The closing six-project audit is
> [`docs/AUDIT-2026-08-02.md`](AUDIT-2026-08-02.md), and the current standing brief is
> [`docs/ECOSYSTEM.md`](ECOSYSTEM.md).

Scope: all 180 Markdown files tracked after the Autonomy Build. Ignored dry-run files
under `tmp/` were checked only as
generated fixture output; they are not documentation and are not committed.
Relative-link validation found no broken repository links.

Verdicts mean:

- **Updated** — active wording was obsolete, contradictory or too vague and changed.
- **Current** — still matches code and current decisions.
- **Historical** — intentionally preserved as an append-only decision/proof snapshot.
- **Mirrored** — current operational instruction whose `.claude`/`.agents` copies must
  remain byte-identical where both exist.
- **Reference** — vendored/upstream skill material, not product-state documentation.

## Active root documents

| File | Verdict | Note |
| --- | --- | --- |
| `AGENTS.md` | Current | Repository-wide agent instructions remain applicable. |
| `CLAUDE.md` | Current | Local operating instructions match the current repository. |
| `GOVERNANCE.md` | Updated | Records the signed `$50` limit and bounded specialist-agenda authority. |
| `MANUAL STEPS.md` | Updated | Now covers account plumbing and automatic proof; no owner content-approval gate remains. |
| `NEEDED.md` | Updated | Reduced to social accounts, optional image keys, MMA App/Vercel confirmation and exact failed-closed secrets. |
| `NEEDS_YOUR_HELP_NOW.md` | Updated | Matches the four owner-plumbing items required by the Autonomy Build. |
| `README.md` | Updated | Added agent-owned release, proof, licensed images, priority queue, template founding, project social gates and show barrier. |
| `about-project.md` | Updated | Plain Czech explanation now includes automatic proof, template founding, deterministic portraits and no reader metrics. |
| `monetization.md` | Current | Clearly labels every revenue path as a hypothesis and keeps recognized revenue at zero. |
| `scaling.md` | Updated | Clarifies that social captions reuse article calls and licensed-image processing adds no image-model charge. |

## Product and architecture documents

| File | Verdict | Note |
| --- | --- | --- |
| `docs/FIGHTAIQ.md` | Current | UFC/Oktagon-only data and analysis boundary remains accurate. |
| `docs/LIVE-PROOF.md` | Updated historical | Old fixture proof is labelled historical and links use the current BoardlessAI domain. |
| `docs/MMA-FILES.md` | Updated | Adds licensed images, post-deploy proof, automatic social gate and the Phase 3 measurement ban. |
| `docs/PORTFOLIO.md` | Updated | Adds priority/starvation policy, template founding, automatic proof, social counters and the metrics gate. |
| `docs/REVIEW-2026-08.md` | Historical | Added a prominent snapshot banner; original findings remain unchanged for provenance. |
| `docs/FABLE-ECOSYSTEM-GUIDE.md` | Updated current | Detailed end-to-end reference now includes every Phase 1/2 Autonomy Build behavior. |
| `docs/MARKDOWN-AUDIT-2026-08-01.md` | Updated current | This 180-file audit trail. |

## Active state documents

| File | Verdict | Note |
| --- | --- | --- |
| `state/BRAND.md` | Current | Brand risks and required clearance remain unresolved and correctly visible. |
| `state/BUSINESS.md` | Updated | Removed the obsolete unsigned `$20` constraint; describes signed budget and public delivery boundaries. |
| `state/EXPERIMENTS.md` | Current | Correctly reports no eligible active experiment. |
| `state/FINANCE.md` | Current | Matches the countersigned limit and recorded `$0.52` API use. |
| `state/INBOX.md` | Current | Canonical runtime inbox, not explanatory copy. |
| `state/OPPORTUNITIES.md` | Current | No unsupported opportunity was promoted. |
| `state/ROADMAP.md` | Updated | Marks release proof, image contracts, queue/founding, social gates and the Phase 3 hold complete. |
| `state/SCORECARD.md` | Current | Warm-up/unavailable metrics remain honestly labelled. |
| `state/SOCIAL_STRATEGY.md` | Updated | Replaces manual approval/results with per-project activation, post proof and no engagement collection. |
| `state/brand-clearance/2026-07-23.md` | Historical | Original clearance observation preserved. |
| `state/brand-clearance/2026-07-28.md` | Historical | Follow-up clearance snapshot preserved. |
| `state/brand-clearance/2026-08-01-revisit.md` | Historical/current gate | Latest recorded review remains an owner action, not a code task. |
| `state/ideas/global/INDEX.md` | Current generated index | Compact meeting context; raw history is intentionally excluded. |
| `state/ideas/incubator/INDEX.md` | Current generated index | Project-isolated compact context. |
| `state/ideas/titty-tuesdays/INDEX.md` | Current generated index | Project-isolated compact context. |
| `state/social/assets/README.md` | Current | Deterministic asset storage contract. |
| `state/social/packs/README.md` | Current capability note | Describes stored package shape; production switches still govern use. |
| `state/social/posts/README.md` | Current | Publication records remain gated and empty unless authorized. |
| `state/social/queue/README.md` | Current | Draft queue contract remains valid under the posting kill switch. |
| `state/taste/fightaiq/TASTE.md` | Current | Project-specific owner-taste memory, not evidence. |
| `state/taste/incubator/TASTE.md` | Current | Project-specific owner-taste memory, not a founding signal. |
| `state/taste/mma-files/TASTE.md` | Current | Project-specific editorial preference memory. |
| `state/taste/titty-tuesdays/TASTE.md` | Current | Project-specific brand preference memory. |
| `state/ventures/fightaiq/BACKTEST.md` | Current | Test/evidence limitations remain explicit. |
| `state/ventures/fightaiq/DOCTRINE.md` | Current | Data-only, uncertainty and no-bet rules remain aligned. |
| `state/ventures/fightaiq/README.md` | Current | UFC/Oktagon source and storage map remains accurate. |
| `state/ventures/incubator/niche-proposals/README.md` | Current | Research-only proposal contract. |
| `state/ventures/mma-files/STYLEBOOK.md` | Current | English/Czech structural learnings without copied prose. |
| `state/ventures/mma-files/social/ASSIGNMENT.md` | Updated | Documents deterministic A/B assignment, automatic gated posting and the no-metrics rule. |
| `state/ventures/titty-tuesdays/BRAND.md` | Current | Pre-commerce brand boundary. |
| `state/ventures/titty-tuesdays/PLATFORM_RISK.md` | Current | Relevant KEEPER safety input for guarded Tuesday posting. |
| `state/ventures/titty-tuesdays/season-001.md` | Current | Active season and planning inputs; no commerce claim. |

## Historical decisions

All files in this section are append-only. Several contain older schedules, pending
budgets or superseded directions. Those statements are not active instructions and
must not be edited to make the historical record look current.

| File | Verdict |
| --- | --- |
| `state/decisions/2026-07-30-boardroom-archive-message-time.md` | Historical |
| `state/decisions/2026-07-30-claude-design-handoff-council-simulator.md` | Historical |
| `state/decisions/2026-07-30-claude-design-handoff-spectator-toolkit.md` | Historical |
| `state/decisions/2026-07-30-homepage-standup-countdown.md` | Historical |
| `state/decisions/2026-07-30-sims-inspired-council-simulator.md` | Historical |
| `state/decisions/2026-07-30-spectator-decision-replay.md` | Historical |
| `state/decisions/2026-07-30-spectator-toolkit.md` | Historical |
| `state/decisions/2026-07-30-three-shift-cadence-handoff.md` | Historical, superseded by agenda policy |
| `state/decisions/2026-07-30-three-shift-runtime-sitcom-direction.md` | Historical, superseded by agenda policy |
| `state/decisions/2026-07-30-threejs-agent-reactor-handoff.md` | Historical |
| `state/decisions/2026-07-31-caught-up-language-desks.md` | Historical/current foundation |
| `state/decisions/2026-07-31-live-shift-record-projection.md` | Historical/current foundation |
| `state/decisions/2026-08-01-autonomy-content-release.md` | Historical/current agent-owned release decision |
| `state/decisions/2026-08-01-autonomy-licensed-images.md` | Historical/current licensed-image decision |
| `state/decisions/2026-08-01-autonomy-metrics-deferred.md` | Historical/current Phase 3 hold |
| `state/decisions/2026-08-01-autonomy-sitcom-skin.md` | Historical/current presentation-only decision |
| `state/decisions/2026-08-01-autonomy-social-activation.md` | Historical/current automatic social-gate decision |
| `state/decisions/2026-08-01-autonomy-template-founding.md` | Historical/current fenced founding decision |
| `state/decisions/2026-08-01-autonomy-unchanged-gates.md` | Historical/current human-only boundary decision |
| `state/decisions/2026-08-01-budget-raise.md` | Historical, superseded budget shape |
| `state/decisions/2026-08-01-caughtup-adoption.md` | Historical/current approval |
| `state/decisions/2026-08-01-fightaiq-mma-files-scope.md` | Historical/current scope foundation |
| `state/decisions/2026-08-01-mma-files-public-delivery.md` | Historical/current approval |
| `state/decisions/2026-08-01-titty-tuesdays-founding.md` | Historical/current approval |
| `state/decisions/2026-08-02-budget-mma.md` | Historical, superseded budget shape |
| `state/decisions/2026-08-02-fightaiq-founding.md` | Historical/current approval |
| `state/decisions/2026-08-04-budget-fifty.md` | Historical/current effective budget |

## Runtime prompts

Every prompt was checked against registry scope, current project boundaries,
UFC/Oktagon-only coverage, public MMA delivery, the shared agenda system and the
Phase 3 measurement hold.

| Files | Verdict | Note |
| --- | --- | --- |
| `_shared.md`, `audit.md`, `forge.md`, `pulse.md`, `vize.md` | Current | Council and shared truth/safety rules. |
| `founding.md`, `scout.md`, `angle.md`, `cohort.md`, `incubator.md` | Current | Evidence and research-only boundaries. |
| `herald.md`, `quill.md`, `stet.md`, `hacek.md`, `magazine.md`, `jab.md`, `canvas.md` | Updated/current | Editorial roles are separated by selection, structure, surface quality, language and publication; CANVAS wording now reflects the public delivery model. |
| `spark.md`, `vault.md`, `palate.md` | Current | Idea proposal, memory and taste remain distinct. |
| `corner.md`, `spotter.md`, `tape.md`, `sigma.md`, `vig.md`, `sonar.md`, `pivot.md`, `mma.md` | Current | UFC/Oktagon data, deterministic analysis, newsroom bridge and no betting automation. |
| `scene.md`, `stunt.md`, `funnel.md` | Current | TT research/campaign expertise without production, ads or commerce. |
| `threads.md`, `instagram.md`, `frame.md`, `reach.md`, `split.md`, `channel-agent-template.md` | Updated/current | Production work is bounded by project activation; SPLIT alone remains idle and refuses measurement. |
| `ledger.md`, `lens.md`, `keeper.md`, `people.md`, `radar.md`, `relay.md`, `scribe.md`, `digest.md`, `retro.md` | Current | Shared finance, measurement, compliance, organization, delivery and summary methods. |

Exact runtime prompt files checked:

`_shared.md`, `angle.md`, `audit.md`, `canvas.md`, `channel-agent-template.md`,
`cohort.md`, `corner.md`, `digest.md`, `forge.md`, `founding.md`, `frame.md`,
`funnel.md`, `hacek.md`, `herald.md`, `incubator.md`, `instagram.md`, `jab.md`,
`keeper.md`, `ledger.md`, `lens.md`, `magazine.md`, `mma.md`, `palate.md`,
`people.md`, `pivot.md`, `pulse.md`, `quill.md`, `radar.md`, `reach.md`, `relay.md`,
`retro.md`, `scene.md`, `scout.md`, `scribe.md`, `sigma.md`, `sonar.md`, `spark.md`,
`split.md`, `spotter.md`, `stet.md`, `stunt.md`, `tape.md`, `threads.md`, `vault.md`,
`vig.md` and `vize.md`.

## Local agent, command and skill instructions

The 58 tracked files under `.claude/` and `.agents/` were reviewed as operational
instructions rather than product copy.

### Local agents and commands

| Files | Verdict |
| --- | --- |
| `.claude/agents/brand-guardian.md`, `builder.md`, `copywriter.md`, `market-validator.md`, `release-auditor.md` | Current |
| `.claude/commands/brand-check.md`, `build-tasks.md`, `council.md`, `status.md` | Current |

### Mirrored skills

The following skill pairs are current and must remain identical across `.claude` and
`.agents`: `agent-identity`, `boardroom-routing`, `brand-identity`,
`business-validation`, `financial-operations`, `organization-operations`,
`page-publishing`, `safe-release`, `social-operations`, `stop-slop`, and
`titty-tuesdays-brandbook`. The financial pair was already updated to the signed
`$50`/`$42` truth. Stop-slop and Titty Tuesdays reference files were also checked.

Exact mirrored/reference paths reviewed:

- `.agents/skills/agent-identity/SKILL.md`
- `.agents/skills/boardroom-routing/SKILL.md`
- `.agents/skills/brand-identity/SKILL.md`
- `.agents/skills/business-validation/SKILL.md`
- `.agents/skills/financial-operations/SKILL.md`
- `.agents/skills/organization-operations/SKILL.md`
- `.agents/skills/page-publishing/SKILL.md`
- `.agents/skills/safe-release/SKILL.md`
- `.agents/skills/social-operations/SKILL.md`
- `.agents/skills/stop-slop/SKILL.md`, `UPSTREAM.md`, and its four reference files
- `.agents/skills/titty-tuesdays-brandbook/SKILL.md` and `references/platform-policy.md`
- the corresponding `.claude/skills/` copies of every mirrored file above

### Claude-only workflow/reference skills

| Files | Verdict |
| --- | --- |
| `.claude/skills/find-skills/SKILL.md`, `UPSTREAM.md` | Reference/current |
| `.claude/skills/markdown-checkup/SKILL.md` | Current; used for this audit |
| `.claude/skills/preview-video/SKILL.md` | Current optional tool instruction |
| `.claude/skills/session-start/SKILL.md`, `session-end/SKILL.md` | Current workflow instruction |
| `.claude/skills/task-observer/SKILL.md`, `UPSTREAM.md`, three reference files | Current; observation recorded during this redesign |
| `.claude/skills/ui-ux-pro-max/SKILL.md`, `UPSTREAM.md`, two reference files | Reference/current |

## Obsolete claims removed from active documentation

- old `quorum-site-chi.vercel.app` links;
- MMA Files described as private or as a future public project;
- `$50` described as pending and `$20` as the active fallback;
- three paid full-council shifts per day;
- 28 overlapping cron declarations;
- every specialist room described as automatically daily;
- admin described as raw Basic Auth rather than a signed session;
- completed key rotation and countersignature work listed as still pending;
- Caught Up social production described as active;
- FightAIQ analysis enablement conflated with its already-approved data-only intake.
- owner review of the first delivery/three editions described as a publication gate;
- MMA Files manual social-result entry and SPLIT learning;
- incubator founding described as always owner-blocked;
- social posting described as permanently manual or draft-only;
- missing MMA portraits described as an image-generation task;
- deterministic SVG described as the only article hero instead of the licensed-photo
  preference and safe fallback.

## Findings about agent scope

No new permanent agent was added. The current 38 roles cover the needed expertise,
and phase-specific packets already make apparently broad roles narrower at runtime.
The safe improvement was to route work through agendas, keep source/taste data
project-isolated, and share infrastructure/review methods. New identities should wait
for repeated, categorized output failures that prove a missing specialty.

The full reasoning, role map, meeting lifecycle and next improvement candidates are in
`docs/FABLE-ECOSYSTEM-GUIDE.md`.
