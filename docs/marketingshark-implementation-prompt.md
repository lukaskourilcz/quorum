# marketingShark — implementation prompt for Opus 5

Authored 2026-08-07 by the architect session. You are the implementer. This prompt is
self-contained: it carries the roster additions, the adapted marketing instruction files,
the hook library, every schema, the meeting flow, the cost budget, acceptance criteria and
the commit plan. Where it says "verbatim", copy the block exactly. Where it says
"discover", read the repository and follow the existing pattern rather than inventing one.

## Objective

Fold **devShark** (repo `lukaskourilcz/react-express-app`, a finished, functioning
developer-learning game — do not rebuild or refactor it) into the BoardlessAI venture
family, and found **marketingShark**, a seventh BoardlessAI project that acts as the agent
marketing agency behind it. marketingShark runs one daily meeting that turns one quiz
question into one Czech and one English five-slide carousel per active brand, rendered by
the existing Carousel Studio engine, stored as draft social packages behind the approval
queue. Phase 1 ships the devShark brand live and the geoShark brand present but disabled;
Phase 2 is a config flip. marketingShark also delivers one static devShark banner to the
DNESKAi site (repo `lukaskourilcz/aifirst`) through the existing GitHub App channel.
Nothing posts to any social network.

Work in:

- `lukaskourilcz/quorum` on branch `claude/marketingshark-venture-arch-cqvniv` — all code.
- `lukaskourilcz/react-express-app` on branch `claude/marketingshark-venture-arch-cqvniv`
  — documentation only. No code changes there.
- `lukaskourilcz/aifirst` — never push directly. The banner reaches it only through the
  existing delivery App channel, with a receipt.

## Ground rules (non-negotiable)

1. Read `CLAUDE.md`, `docs/ECOSYSTEM.md`, `docs/PORTFOLIO.md`, `GOVERNANCE.md` and the
   newest `state/decisions/*.md` before writing anything. The golden rules there bind you.
2. Never weaken budget, patch, security, evidence, stage, finance, content-quality or
   release guards or their tests. Never touch `SOCIAL_KILL_SWITCH` handling except to
   respect it. The publisher, treasury and INBOX flows stay exactly as they are.
3. **Budget truth.** The docs disagree with each other. `about-project.md` and
   `NEEDS_YOUR_HELP_NOW.md` say the countersigned `budget-2026-08e` sets $30 all-in /
   $25 model share / $1.00 daily pace and supersedes `budget-2026-08d` (50 / 42 / 2.20);
   the generated block in `docs/ECOSYSTEM.md` still showed the 08d numbers on 2026-08-06.
   Read the budget resolver config and the newest countersigned decision and treat that as
   truth. Do not raise any cap. This venture is designed to fit under the stricter $30/08e
   numbers (see the cost section), so the discrepancy never blocks you — but if the
   resolver and the decisions genuinely conflict, record that in
   `NEEDS_YOUR_HELP_NOW.md` for the owner instead of picking a side. During the closing
   markdown walk, align every stale prose mention with the resolver truth.
4. **Founding precedent.** GoVIRAL was founded on 2026-08-06 by a direct registry entry
   (see `state/decisions/` and `NEEDS_YOUR_HELP_NOW.md` "What already works"). Found
   marketingShark the same way: registry entry, one room, prompts, decision record. The
   owner commissioned this venture by issuing this prompt; record that in the founding
   decision file. The Magazine Incubator is closed — do not resurrect any incubator path.
5. **Agent names.** The registry holds 40 entries. All of these codenames are taken:
   VIZE, FORGE, PULSE, AUDIT, SCOUT, SCRIBE, LENS, QUILL, RADAR, KEEPER, THREADS,
   INSTAGRAM, PEOPLE, LEDGER, HERALD, STET, HACEK, SPARK, VAULT, FRAME, RELAY, ANGLE,
   COHORT, FUNNEL, PALATE, SCENE, STUNT, CORNER, SPOTTER, TAPE, SIGMA, VIG, SONAR,
   CANVAS, JAB, REACH, SPLIT, EASEL, MOTIF, PIVOT. The two new agents are **MAKO** and
   **CHUM** — verified free as of 2026-08-07. If either collides by the time you
   implement, keep the role specs and substitute, in order of preference: MAKO → FINLEY →
   PELAGIC; CHUM → BAITLINE → LURE.
6. Small phase commits (this is initial implementation, not runtime council work). Apply
   the `stop-slop` skill to every piece of prose you ship, and `page-publishing` for the
   site page. `.claude/skills` and `.agents/skills` stay byte-identical —
   `orchestrator/tests/architecture.test.ts` enforces the mirror, and this task adds **no
   new skill directories**, so that test must pass untouched.
7. The site consumes `studio/` as TypeScript source; `site` must run webpack (`next dev
   --webpack`), never Turbopack. Do not touch the office walkthrough invariants.

---

## 1. What exists that you build on (verified 2026-08-07)

- **Venture registry**: `config/ventures.json` defines each project's meetings,
  participating roles, cost envelope, idea namespaces and admin tabs;
  `config/venture-agent-controls.json` holds optional agent switches. Internal contracts
  say `venture`, visitor-facing text says `project`.
- **Clock**: twelve Prague slots — 05:00, 06:00, 08:00, 09:00, 10:00, 11:00, 13:00 (Mon),
  14:00, 17:00, 19:00, 20:00, 22:00. The 07:00, 18:00 and 21:00 slots were freed when the
  incubator closed. A Vercel cron dispatches each slot and **names the meeting itself**
  (the dispatcher-names-the-phase fix from early August — wall-clock inference is dead);
  GitHub `on.schedule` runs three backstop sweeps. Every firing pre-checks committed
  records before `pnpm install`. Skipped slots write `state/meetings/skips/<date>-<phase>.json`.
  Schedule validation rejects collisions under 60 minutes.
- **Roster**: 40 entries, ~31 active, enforced by a frozen tuple plus zod `superRefine`,
  validated by `pnpm agents:validate`. Model routing lives in `config/models.json` and
  `config/agent-routing.json`. Council judgment uses Claude Sonnet 5 or GPT-5.6 Luna;
  narrow specialists generally use Claude Haiku 4.5 or GPT-5.6 Luna. Deterministic roles
  make no provider calls.
- **Meetings**: agenda queue in `state/meeting-agendas/queue.json` under
  `meeting-agenda/1`, allowlisted request transitions, queues capped at 24 total and 8 per
  project, three-day expiry, consumed-once semantics. Titty Tuesdays is the precedent for
  a **standing daily agenda** room. The 06:00 morning board may commission or focus one
  specialist agenda.
- **Carousel Studio**: `@boardlessai/carousel-studio` in `studio/`, the only render path.
  `carousel-template/1` records define safe areas, slides, text slots, fit rules and
  semantic versions; the pure pipeline is template + payload + brand tokens → SVG → PNG
  with stable hashes. Thirteen live templates (the seed set includes quote, steps,
  statistic, before/after, headline+bullets, timeline, comparison, cover/CTA,
  **five-slide story**, minimal poster). Every social producer must return a live
  `template_id`, semantic `version` and bounded `content` payload; FRAME resolves and
  renders; schema validation rejects non-live references. There is no freeform image path.
- **Social**: `SOCIAL_KILL_SWITCH=true` is the supreme stop; each project additionally has
  proof counters, credentials and safety gates. REACH's Czech A/B draft contract already
  uses live Carousel Studio templates — mirror its shape for A/B records. SPLIT (the
  split-testing agent) is retired and measurement is disabled
  (`METRICS_INGESTION_ENABLED=false`); you record variants in SPLIT-compatible form, you
  do not revive SPLIT and you optimize nothing.
- **Delivery**: RELAY delivers hash-checked packages through a Contents-only GitHub App
  installed on `lukaskourilcz/aifirst` (DNESKAi) and `lukaskourilcz/mma-files`, with
  post-deploy verification, one retry, then revert-and-pause. Receipts are recorded.
- **KPIs**: 90-day quarter Q1 began 2026-08-03; seeds in `config/kpis/2026-Q1.json`;
  daily $0 evaluator labels targets on-track / at-risk / off-track / unavailable; missing
  measurement is never rendered as zero.
- **Money**: `/results#money` reads `state/money/public.json`; owner fixed costs in
  `config/fixed-costs.json`; `monetization.md` (Czech) holds the options table.
- **devShark question bank** (react-express-app, recorded by the architect — verify paths
  before coding against them):
  - Canonical types in `lib/quiz-data.ts`: `Question { id, tags[], introduction,
    question, options[], correctAnswer (index), category, explanation, difficulty:
    1|2|3|4|5, importance?: 1–10 }` and `QuestionTranslation { introduction?, question?,
    options? (parallel array), explanation? }`. English is the source language; Czech
    lives in per-subject translation maps keyed by question id.
  - Loader map in `lib/question-bank-loader.ts`: subject `webdev` = `lib/quiz-data.ts`
    `questions` plus `lib/roadmap-questions-fix-the-test.ts`; Czech from
    `lib/quiz-data.cs.ts` (`questionTranslationsCs`) plus the fix-the-test `.cs` map.
    Subject `geography` = `lib/roadmap-questions.geography.ts`
    (`allRoadmapGeographyQuestions`) and `lib/roadmap-questions.geography.cs.ts`
    (`geographyTranslationsCs`).
  - devShark categories include: `javascript, typescript, react, nextjs, nodejs, html,
    css, git, dsa, algorithms, databases, system-design, testing, devops, security,
    internet, ai, abbreviations, general, rhf-zod, cool-stuff, dev-world, code-snippets`.
    geoShark (geography) categories include: `continents, capitals, flags, landforms,
    climate, population, political, economic, cartography, earth, geomorphology,
    oceanography, biogeography, geopolitics, gis`. About 3,633 webdev and 1,000 geography
    questions exist. Question text may embed fenced code blocks.
  - **The `lukaskourilcz/geoshark` repository is a stale precursor** (its README describes
    the old webdev quiz under a GeoShark title). Ignore it. Both brands' banks live in
    `react-express-app`.

---

## 2. File-by-file plan

### quorum — created

| Path | What it is |
| --- | --- |
| `config/marketingshark.json` | The venture's brand + hook configuration. Full instance in §4. The single file whose one-line change enables geoShark. |
| `orchestrator/prompts/marketingshark/craft.md` | CHUM's daily instructions, injected into the one model call. Verbatim in §6. |
| `orchestrator/prompts/marketingshark/strategy.md` | MAKO's weekly review instructions. Verbatim in §7. |
| `orchestrator/src/ventures/marketingshark/` | The room engine: bank loading, deterministic selection, hook assignment, the CHUM call, truth gates, packaging, render, queue write. Mirror the module layout of an existing venture (GoVIRAL is the smallest precedent). |
| `scripts/marketingshark-import-bank.ts` (wired as `pnpm marketingshark:import-bank -- --brand <id> --source <path-to-clone>`) | Reads the react-express-app bank via the loader entry points above, normalizes to `NormalizedQuestion` (§5), writes the snapshot with provenance. Run at implementation time from a local clone; re-runnable any time. The daily room never fetches anything. |
| `state/marketingshark/question-banks/devshark.json` | Imported snapshot (Phase 1). `geoshark.json` arrives with Phase 2. |
| `state/marketingshark/ledger.json` | The dedupe ledger (§5). |
| `state/ventures/marketingshark/packages/<date>/<brand>/package.json` | Daily output packages (§8), plus the carousel summaries/renders beside them, following how existing ventures store artifacts next to their packages. |
| `state/decisions/2026-08-NN-marketingshark-founding.md` | Founding decision record: owner-commissioned via this prompt; scope; the two agents; the 07:00 slot; the $0-checkpoint design; devShark folded in as a portfolio product; geoShark disabled. Append-only style like the existing decisions. |
| `.github/workflows` + Vercel cron config | The `ms-daily` slot (§9). Extend `cycle.yml` and the dispatcher exactly like the other slots — same pre-check, same fail-closed guards, SHA-pinned actions, timeouts, concurrency guards. |
| Site venture page + `/admin` tab | Follow `page-publishing` and the existing venture page pattern; add the marketingShark admin tab via `config/ventures.json` `adminTabs` like the others: package preview (render the day's SVGs), approval queue items, ledger/epoch state, hook rotation view. Admin stays noindex/no-store. |
| Tests | See §12. New test files live beside the existing orchestrator tests. |

### quorum — modified

`config/ventures.json` (register the venture: cadence, roles, envelope, idea namespace,
admin tab), `config/agents.json` (+MAKO, +CHUM with `skillRefs`), the frozen roster tuple
and its zod schema, `config/models.json` + `config/agent-routing.json` (routes, §3),
the agenda-policy allowlist config (the task brief calls it `config/meeting-policy.json`;
use whatever file actually holds the allowlisted transitions), the calendar/window table
(twelve slots become thirteen), `config/kpis/2026-Q1.json` (§10), `state/ROADMAP.md`,
`monetization.md`, `state/money` earning-method registration (§10), and every doc the
closing walk touches.

### react-express-app — modified (docs only)

One short section in `README.md` (and `about-project.md` if it exists there): devShark is
marketed by BoardlessAI's marketingShark venture; the question bank is consumed read-only
as a pinned snapshot (source commit recorded in quorum); one question per day is published
with its answer as a carousel, and quorum's ledger (`state/marketingshark/ledger.json`)
records which. No code changes. Do not touch handlers, catalogs or the client.

### aifirst — via the delivery channel only

Read the banner slot config if Prompt 1 of this series already landed it (search the repo
for a banner/slot config under `config/`; as of 2026-08-07 `config/` held only
`board-changelog.json` and `topics.yml`, so expect to supply the fallback spec in §11).
Stage the asset and contract in quorum; deliver through the existing App channel with a
hash and receipt; verify post-deploy like an edition. If the channel needs an owner
trigger for a new content type, stage everything, add one `HUMAN_APPROVAL` item to
`state/INBOX.md` and one owner item to `NEEDS_YOUR_HELP_NOW.md`, and stop there.

---

## 3. Roster additions and model routing

Registry grows 40 → 42 entries (active count +2). Update the frozen tuple, the zod
`superRefine`, `config/agents.json`, and every count assertion `pnpm agents:validate` and
the docs carry. Both new roles use neutral name-based placeholder portraits per D12 (the
`agent-identity` skill governs the placeholder format). Neither is a social production
role; neither touches the publisher.

| Agent | One responsibility | Boundary |
| --- | --- | --- |
| MAKO | marketingShark direction: brand configs, weekly package review, hook-library proposals, KPI honesty | cannot post, cannot edit the hook library silently (proposals only), cannot invent metrics |
| CHUM | one bilingual quiz-carousel copy pass per brand per day | writes copy only; selection, templates, rendering, publishing and the slide-5 line are code and config; cannot exceed its one call + one retry |

`skillRefs` for both: `copywriting`, `social`, `marketing-psychology`,
`product-marketing` (all four already vendored in `.claude/skills`). Runtime prompts do
not load skill files — the distilled craft/strategy files in §6–7 are the runtime text,
exactly like `orchestrator/prompts/goviral.md`.

Routing (add entries in the existing `config/models.json` shape; reuse the existing route
ids where the model matches rather than minting duplicates):

- **CHUM → Claude Sonnet 5** (`claude-sonnet-5`, the existing Sonnet council route).
  Justification: this is the venture's only quality-critical call — native-register Czech
  plus English creative in one pass. Haiku-class output in Czech is not acceptable for a
  public brand voice, and the call is small enough (~$0.05, see §13) that the quality tier
  costs almost nothing. Pricing at sticker $3/$15 per MTok; an introductory $2/$10 applies
  through 2026-08-31.
- **MAKO → Claude Sonnet 5** (same route). Weekly judgment work, four to five calls a
  month.
- No third route. Variant assignment, selection, validation and rendering are code.

Do not evaluate or switch models on your own; a future Haiku trial for CHUM would go
through PEOPLE's process, not this implementation.

---

## 4. Venture configuration — `config/marketingshark.json`

Validate with this zod schema (place it in the marketingShark module; export the type):

```ts
import { z } from "zod";

export const HookPattern = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  cooldownDays: z.number().int().min(1).max(30),
  // Deterministic predicate over NormalizedQuestion, evaluated in code:
  //  always                     — no condition
  //  difficultyAtLeast:N        — question.difficulty >= N
  //  optionsAtLeast:N           — question.en.options.length >= N
  //  hasCode                    — question.hasCode === true
  //  categoryIn:<listKey>       — question.category ∈ brand.categoryLists[listKey]
  //  questionStartsWith:<word>  — EN question text starts with <word>
  truthRequires: z.array(z.string()).min(1),
  variants: z.record(
    z.enum(["dev", "geo"]),
    z.object({
      en: z.string().min(1),   // may contain {topic} / {category} slots
      cs: z.string().min(1),
    }),
  ),
});

export const Brand = z.object({
  id: z.enum(["devshark", "geoshark"]),
  enabled: z.boolean(),
  displayName: z.string(),
  productUrl: z.string().url(),
  tone: z.enum(["dev", "geo"]),
  questionBank: z.object({
    snapshotPath: z.string(),            // state/marketingshark/question-banks/<id>.json
    sourceRepo: z.string(),              // lukaskourilcz/react-express-app
    sourceSubject: z.string(),           // loader subject id: webdev | geography
  }),
  categoryLists: z.record(z.string(), z.array(z.string())),
  slide5: z.object({ en: z.string(), cs: z.string() }),
  templateMap: z.object({
    hook: z.string(), context: z.string(), reveal: z.string(),
    why: z.string(), footer: z.string(),
  }),                                    // live Carousel Studio template ids per slide role
  hashtags: z.object({
    instagram: z.object({ en: z.array(z.string()).max(4), cs: z.array(z.string()).max(4) }),
    threadsTopic: z.object({ en: z.string(), cs: z.string() }),
  }),
  banner: z.boolean(),
});

export const MarketingSharkConfig = z.object({
  schemaVersion: z.literal("marketingshark-config/1"),
  meetingPhase: z.literal("ms-daily"),
  pragueHour: z.literal(7),
  abVariants: z.literal(2),
  minEligibleBeforeRelax: z.literal(2),
  brands: z.array(Brand).min(1),
  hookLibrary: z.array(HookPattern).min(15).max(20),
}).superRefine((cfg, ctx) => {
  if (cfg.brands.some(b => b.id === "geoshark" && b.banner))
    ctx.addIssue({ code: "custom", message: "geoShark never gets a banner" });
});
```

Ship this instance (adjust only `templateMap` ids to real live template ids after the
inventory in §8, and hashtag casing to taste):

```json
{
  "schemaVersion": "marketingshark-config/1",
  "meetingPhase": "ms-daily",
  "pragueHour": 7,
  "abVariants": 2,
  "minEligibleBeforeRelax": 2,
  "brands": [
    {
      "id": "devshark",
      "enabled": true,
      "displayName": "devShark",
      "productUrl": "https://devshark.app",
      "tone": "dev",
      "questionBank": {
        "snapshotPath": "state/marketingshark/question-banks/devshark.json",
        "sourceRepo": "lukaskourilcz/react-express-app",
        "sourceSubject": "webdev"
      },
      "categoryLists": {
        "commonUse": ["javascript", "typescript", "git", "css", "html", "react", "nodejs"],
        "interview": ["dsa", "algorithms", "system-design", "databases", "javascript", "typescript"],
        "core": ["internet", "git", "security", "databases", "testing"]
      },
      "slide5": {
        "en": "One question from devShark — the game that makes you a better developer. devshark.app",
        "cs": "Jedna otázka z devSharku — hry, se kterou budeš lepší vývojář. devshark.app"
      },
      "templateMap": {
        "hook": "REPLACE-live-template-id",
        "context": "REPLACE-live-template-id",
        "reveal": "REPLACE-live-template-id",
        "why": "REPLACE-live-template-id",
        "footer": "REPLACE-live-template-id"
      },
      "hashtags": {
        "instagram": {
          "en": ["#webdev", "#programming", "#codingquiz"],
          "cs": ["#programovani", "#webdev", "#vyvojar"]
        },
        "threadsTopic": { "en": "webdev", "cs": "programování" }
      },
      "banner": true
    },
    {
      "id": "geoshark",
      "enabled": false,
      "displayName": "geoShark",
      "productUrl": "https://studyshark-app.vercel.app",
      "tone": "geo",
      "questionBank": {
        "snapshotPath": "state/marketingshark/question-banks/geoshark.json",
        "sourceRepo": "lukaskourilcz/react-express-app",
        "sourceSubject": "geography"
      },
      "categoryLists": {
        "commonUse": ["capitals", "flags", "continents", "earth"],
        "interview": ["capitals", "flags", "political", "geopolitics"],
        "core": ["cartography", "earth", "climate", "landforms"]
      },
      "slide5": {
        "en": "One question from geoShark — for people who love geography. studyshark-app.vercel.app",
        "cs": "Jedna otázka z geoSharku — pro lidi, které baví zeměpis. studyshark-app.vercel.app"
      },
      "templateMap": {
        "hook": "REPLACE-live-template-id",
        "context": "REPLACE-live-template-id",
        "reveal": "REPLACE-live-template-id",
        "why": "REPLACE-live-template-id",
        "footer": "REPLACE-live-template-id"
      },
      "hashtags": {
        "instagram": {
          "en": ["#geography", "#maps", "#quiz"],
          "cs": ["#zemepis", "#mapy", "#kviz"]
        },
        "threadsTopic": { "en": "geography", "cs": "zeměpis" }
      },
      "banner": false
    }
  ],
  "hookLibrary": [
    { "id": "speed-run", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
      "dev": { "en": "You have 10 seconds. Go.", "cs": "Máš 10 vteřin. Teď." },
      "geo": { "en": "You have 10 seconds. Go.", "cs": "Máš 10 vteřin. Teď." } } },
    { "id": "no-google", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
      "dev": { "en": "No googling. That is the whole point.", "cs": "Negoogli. O tom to celé je." },
      "geo": { "en": "No maps, no googling.", "cs": "Bez mapy, bez googlení." } } },
    { "id": "bet-on-it", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
      "dev": { "en": "Would you bet a code review on this?", "cs": "Vsadil bys na to code review?" },
      "geo": { "en": "Would you bet your passport on this?", "cs": "Vsadil bys na to svůj pas?" } } },
    { "id": "two-look-right", "cooldownDays": 10, "truthRequires": ["optionsAtLeast:4", "difficultyAtLeast:2"], "variants": {
      "dev": { "en": "Two answers look right. One is.", "cs": "Dvě odpovědi vypadají správně. Jedna je." },
      "geo": { "en": "Two answers look right. One is.", "cs": "Dvě odpovědi vypadají správně. Jedna je." } } },
    { "id": "seniors-know", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:3"], "variants": {
      "dev": { "en": "Juniors know the rule. Seniors know the exception.", "cs": "Junioři znají pravidlo. Senioři znají výjimku." },
      "geo": { "en": "Tourists know the name. Travelers know the reason.", "cs": "Turisté znají jméno. Cestovatelé znají důvod." } } },
    { "id": "everyday-blindspot", "cooldownDays": 10, "truthRequires": ["categoryIn:commonUse"], "variants": {
      "dev": { "en": "You use {topic} every day. Can you explain it?", "cs": "Používáš {topic} každý den. Umíš to vysvětlit?" },
      "geo": { "en": "It is on every map. Have you ever noticed it?", "cs": "Je to na každé mapě. Všiml sis toho někdy?" } } },
    { "id": "interview-favorite", "cooldownDays": 10, "truthRequires": ["categoryIn:interview"], "variants": {
      "dev": { "en": "This one shows up in interviews.", "cs": "Tahle se objevuje na pohovorech." },
      "geo": { "en": "This one shows up in every quiz night.", "cs": "Tahle padá na každém kvízu." } } },
    { "id": "looks-easy", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:3"], "variants": {
      "dev": { "en": "Looks easy. Take the bait.", "cs": "Vypadá to jednoduše. Chyť se." },
      "geo": { "en": "Looks easy. Take the bait.", "cs": "Vypadá to jednoduše. Chyť se." } } },
    { "id": "one-detail", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:2"], "variants": {
      "dev": { "en": "One detail changes the whole answer.", "cs": "Jeden detail mění celou odpověď." },
      "geo": { "en": "One detail changes the whole answer.", "cs": "Jeden detail mění celou odpověď." } } },
    { "id": "streak-breaker", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:4"], "variants": {
      "dev": { "en": "Questions like this end streaks.", "cs": "Otázky jako tahle ukončují streaky." },
      "geo": { "en": "Questions like this end streaks.", "cs": "Otázky jako tahle ukončují streaky." } } },
    { "id": "explain-it", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
      "dev": { "en": "Could you explain this to a junior?", "cs": "Vysvětlil bys to juniorovi?" },
      "geo": { "en": "Could you explain this to a tourist?", "cs": "Vysvětlil bys to turistovi?" } } },
    { "id": "hard-mode", "cooldownDays": 10, "truthRequires": ["difficultyAtLeast:4"], "variants": {
      "dev": { "en": "Hard mode: no hints, no docs.", "cs": "Hard mode: bez nápovědy, bez dokumentace." },
      "geo": { "en": "Hard mode: no atlas.", "cs": "Hard mode: bez atlasu." } } },
    { "id": "depends-on-it", "cooldownDays": 10, "truthRequires": ["categoryIn:core"], "variants": {
      "dev": { "en": "You have shipped code that depends on this.", "cs": "Už jsi nasadil kód, který na tomhle stojí." },
      "geo": { "en": "Every map you have read leans on this.", "cs": "Každá mapa, kterou jsi kdy četl, na tomhle stojí." } } },
    { "id": "know-why", "cooldownDays": 10, "truthRequires": ["questionStartsWith:Why"], "variants": {
      "dev": { "en": "You know the what. This asks the why.", "cs": "Víš co. Tohle se ptá proč." },
      "geo": { "en": "You know the what. This asks the why.", "cs": "Víš co. Tohle se ptá proč." } } },
    { "id": "spot-it", "cooldownDays": 10, "truthRequires": ["hasCode"], "variants": {
      "dev": { "en": "Spot it before the compiler does.", "cs": "Najdi to dřív než kompilátor." },
      "geo": { "en": "Spot the odd one out.", "cs": "Najdi, co sem nepatří." } } },
    { "id": "daily-rep", "cooldownDays": 10, "truthRequires": ["always"], "variants": {
      "dev": { "en": "One question a day keeps the rust away.", "cs": "Jedna otázka denně a nezreziviš." },
      "geo": { "en": "One question a day keeps the world close.", "cs": "Jedna otázka denně a svět zůstane blízko." } } }
  ]
}
```

Notes: `spot-it`'s geo variant is only eligible when its truth condition passes — for geo
that predicate cannot be `hasCode`, so implement per-tone truth overrides simply: when a
pattern's `truthRequires` contains `hasCode` and the brand tone is `geo`, substitute
`optionsAtLeast:4`. That is the only override. Sixteen patterns with six always-true means
eligibility never starves under the 10-day cooldown.

---

## 5. Question snapshots, deterministic selection, dedupe ledger

**NormalizedQuestion** (schema for the snapshot files; zod it):

```json
{
  "id": "string — source question id",
  "category": "string",
  "difficulty": 1,
  "importance": 7,
  "hasCode": false,
  "correctIndex": 1,
  "en": { "introduction": "", "question": "…", "options": ["…"], "explanation": "…" },
  "cs": { "question": "…", "options": ["…"], "explanation": "…" }
}
```

`cs` is optional and partial (the source stores Czech as overrides that fall back to
English; preserve exactly what exists — CHUM writes native Czech either way and uses `cs`
as reference when present). `hasCode` = the EN question or introduction contains a fenced
code block. Snapshot envelope: `{ schemaVersion: "marketingshark-bank/1", brandId,
sourceRepo, sourceCommit, sourceSubject, importedAt, contentHash, questions: [...] }`
where `contentHash` is the sha256 of the canonical (sorted-key) JSON of `questions`.
Snapshots are committed; the daily room reads only the local file. Answers already sit in
a public repository, so committing them leaks nothing new.

**Ledger** — `state/marketingshark/ledger.json`:

```json
{
  "schemaVersion": "marketingshark-ledger/1",
  "brands": {
    "devshark": {
      "epoch": 1,
      "orderSeed": "sha256(epoch + ':' + contentHash)",
      "served": [
        { "date": "2026-08-08", "questionId": "…", "hookA": "looks-easy",
          "hookB": "no-google", "package": "state/ventures/marketingshark/packages/2026-08-08/devshark/package.json" }
      ],
      "reshuffles": [ { "epoch": 2, "date": "…", "reason": "bank exhausted" } ]
    }
  }
}
```

Selection algorithm (pure, $0, unit-tested):

1. Per brand, derive the epoch order: stable-sort question ids, then Fisher–Yates with a
   PRNG seeded by `orderSeed`. Same epoch + same bank hash → same order, forever.
2. If `served` already has an entry for today's Prague date, return it unchanged
   (idempotency — reruns and backstop sweeps must not double-serve).
3. Otherwise serve the first id in epoch order not present in `served` for the current
   epoch. If none remain, increment `epoch`, record the reshuffle, reseed, serve the
   first id of the new order. A question repeats only after every other question in the
   bank has been served once.
4. Hook assignment: `eligible` = patterns whose `truthRequires` all pass for the served
   question and which this brand has not used within `cooldownDays` (from `served`).
   If `eligible.length < minEligibleBeforeRelax`, relax the cooldown by dropping the
   oldest-used patterns back in, deterministically, until two are eligible; note the
   relaxation in the day's run record. Pick A = `sha256(date + brandId + questionId)`
   mod `eligible.length`; B = the next eligible index. A fronts the carousel; B is
   recorded as the alternate.

A re-import that changes `contentHash` does not disturb `served` history; unserved new
questions simply join the current epoch's order tail (order = existing epoch order for
surviving ids, then new ids in seeded order). Record the new hash beside the epoch.

---

## 6. `orchestrator/prompts/marketingshark/craft.md` — verbatim

This is the runtime instruction text for CHUM's daily call. It is the adaptation of the
selected marketing skills (audit in Appendix A) into text this repository owns. Keep it
byte-for-byte; it is sized to stay near 1,600 tokens of paid input.

```markdown
# marketingShark craft rules (CHUM)

You turn one quiz question into one Czech and one English five-slide carousel for one
brand, plus platform descriptions, hashtags and alt text. You write copy only. Question
choice, hook-pattern choice, template choice, rendering and publishing are code — never
change or second-guess them. Return JSON matching the schema you were given, nothing else.

## Voice

- Clear over clever. Specific over vague. Active voice. No exclamation marks, no
  buzzwords, no filler.
- Simple words: "use", not "utilize". Numbers and proper nouns from the question stay.
- Never invent a statistic, user count, or claim. Honest beats sensational, every time.
- Czech is written, not translated: natural register, the way a Czech developer or
  geography fan actually talks. Dev jargon that Czech developers keep in English
  (commit, deploy, code review, streak) stays in English inside Czech copy.
- Brand tone comes with the input: `dev` = one developer to another, dry humor allowed;
  `geo` = curious and concrete, wonder without kitsch. Insider language is welcome;
  gatekeeping is not.

## The five slides (fixed, per language)

1. **hook** — the assigned pattern, filled for this question. Headline ≤ 80 characters.
   It must work alone in a feed, and it must be literally true of this question. If the
   filled slot would overstate, fill it plainer.
2. **context** — the question itself. Compress lightly if needed; never change meaning.
   Code blocks are copied exactly, character for character. Include the answer options
   when they fit the slide; label them A–D.
3. **reveal** — the correct answer, stated first and plainly. No drum roll.
4. **why** — the explanation compressed to ≤ 40 words. Keep the concrete detail (the
   flag, the port, the strait, the flag of the CLI). Cut hedges.
5. **footer** — the brand's slide-5 line, provided in the input. Copy it verbatim. No
   added call to action, no "follow", no "buy".

One idea per slide. Slide 1 opens a loop; slide 3 closes it. The curiosity is the real
gap between "I should know this" and the answer — never withheld information, never a
fabricated stake. At most one slide may use loss framing.

## Descriptions

- **Instagram** (per language): first line is a fresh hook in your own words, not slide 1
  repeated. One or two lines of context. Say the answer is in the carousel. End with the
  footer line and product URL. ≤ 500 characters before hashtags. Then hashtags: the base
  set from the input plus up to two topical tags from this question's category — total
  three to five.
- **Threads** (per language): ≤ 300 characters, conversational, question-forward, no
  hashtag pile — the single topic tag comes from the input. Link allowed.

## Alt text

One sentence per slide, per language: what the slide shows and says ("Slide 3: answer
reveal — B, the .git directory"). ≤ 200 characters each. Czech alt for the Czech
carousel.

## A/B hook

You also receive an alternate pattern B. Write its filled hook line (both languages),
same truth rule. It is recorded for later comparison; nothing is measured yet, so do not
optimize toward either — write both as well as you can.

## Final sweep before returning

Clarity: a stranger parses each slide in three seconds. So-what: slide 4 answers "why
should I care". Specificity: names and numbers survived. Truth: nothing claimed beyond
the question and its explanation. Limits: 80 / 40-word / 500 / 300 / 200 caps hold in
both languages. Parallel meaning across CS and EN without literal translation.
```

---

## 7. `orchestrator/prompts/marketingshark/strategy.md` — verbatim

MAKO's weekly instruction file (one bounded call per week, scheduled inside the existing
weekly rhythm the way other ventures do reviews, or as MAKO's contribution when the
morning board focuses marketingShark — pick whichever wiring the codebase makes cheaper;
one call per week either way).

```markdown
# marketingShark strategy review (MAKO)

Once a week you review what shipped and keep the venture honest. You direct; you do not
rewrite packages, post, or touch code.

Positioning, fixed: devShark is a free quiz game that makes working developers better —
the carousel gives real value (a real question, the real answer) and mentions the product
once, quietly. geoShark, when enabled, speaks to people who love geography. The audience
is the reader who wants the answer, not a lead to capture.

Review, against the craft rules and the recorded packages of the last seven days:
1. Truth: any hook that overpromised its question. Name the date and slide.
2. Voice: Czech that reads translated, English that reads generic. Quote the line.
3. Rotation: which hook patterns ran, which starved; whether the cooldown relaxation
   fired. Coverage matters more than your favorites.
4. A/B: variants are recorded, not measured. Say only whether both variants met the truth
   rule. Never rank them — there is no data.
5. KPIs: read the venture's KPI state; if a value is unavailable, it stays unavailable.
   Never estimate a metric.

Output: one bounded review note (≤ 300 words) for the meeting record, plus, at most, one
of: a hook-library change proposal (add / retire / re-word a pattern, with the reason),
or one allowlisted agenda request. Proposals change nothing until a human or the normal
config path applies them.
```

---

## 8. Carousel Studio integration — reuse first

marketingShark renders through the existing engine and nothing else.

1. **Inventory first.** List the live templates (the seed set names thirteen, including a
   five-slide story) via the studio checks/admin data. Map the five slide roles onto live
   templates in each brand's `templateMap`. The five-slide story family is the natural
   host; single-slide layouts (headline+bullets, quote, minimal poster, cover) are
   acceptable per-role hosts if the story template's slots don't fit.
2. **Only if no live template can carry a monospaced code block** for slide 2, add
   exactly one template family through the normal lifecycle (proposal → schema, contrast,
   safe-area, token, overflow, determinism checks → promotion): **`quiz-code-context/1`**
   — a context slide with a monospace block slot, brand-token driven like every other
   template. Do not add anything else. Design ownership stays with the studio; the
   marketingShark module only references live ids.
3. Renders follow the producer contract: live `template_id` + semantic `version` +
   bounded `content`; FRAME's render path validates and produces SVG/PNG with stable
   hashes; the carousel summary artifact is written beside the package the same way
   delivered articles get summaries. The admin package preview serves the checked SVGs.

---

## 9. The daily meeting — `ms-daily`, 07:00 Prague

**Why 07:00**: it is a free hour (07:00, 12:00, 15:00, 16:00, 21:00, 23:00 are open;
07:00 was the incubator's old slot, so the calendar plumbing has hosted that hour
before). It sits after the 05:00 edition and 06:00 board (settled state, and the board
can focus the room same-morning), clear of the 08:00 FightAIQ intake, and the day's
package is drafted before the owner's morning review — the whole pipeline is draft-only,
so same-morning human review is the throughput that matters.

Wire it like every other slot: Vercel cron dispatch that names the phase `ms-daily`,
GitHub backstop sweeps cover it, both UTC expressions for Prague summer/winter time,
pre-check before install, `AUTONOMY_KILL_SWITCH` job guard, `PORTFOLIO_LIVE_ENABLED`
gating like the other venture rooms, `state/PAUSED` respected. Calendar table gains the
thirteenth window with a small paid envelope (below); the collision validator and the
public calendar pick it up from the same source.

**Meeting flow — ordered, each step testable, everything but step 6 costs $0:**

| # | Step | Failure behavior |
| --- | --- | --- |
| 0 | Dispatch fires `ms-daily`; pre-check reads committed records; if today's record already exists, exit (≈1 min, $0) | — |
| 1 | Gates: kill switch, `state/PAUSED`, live switch, budget daily pace, monthly caps. Any closed gate → write `state/meetings/skips/<date>-ms-daily.json` with the named gate | skip recorded, $0 |
| 2 | Load + zod-validate `config/marketingshark.json` and the enabled brands' snapshots (hash check against envelope) | abort, record `config-invalid`, $0 |
| 3 | Per enabled brand: ledger selection (§5) — idempotent question pick | abort that brand, record reason, $0 |
| 4 | Hook A/B assignment with truth predicates (§5) | abort brand, $0 |
| 5 | Assemble the CHUM packet: craft.md + brand block + NormalizedQuestion + patterns A/B + output JSON schema. Token/turn caps and the room envelope apply before the call | — |
| 6 | **The one model call per brand** (Claude Sonnet 5). Validate output against the package schema. On invalid: one retry with the validation errors appended. Second failure → abort brand, record `model-output-invalid`, no partial package | bounded: ≤ 2 calls/brand |
| 7 | Deterministic truth gates: hook lines still satisfy the pattern's `truthRequires` fill rules (slot filled, no added numerals absent from the question, length caps, slide-5 verbatim, hashtag counts ≤ limits, code blocks byte-identical to source) | abort brand, $0 |
| 8 | Render both carousels through Carousel Studio; write summary artifacts beside the package | abort brand on render/check failure, $0 model cost |
| 9 | Write `package.json` (§10 schema), status `draft`; enqueue in the existing social approval queue, draft-locked while `SOCIAL_KILL_SWITCH=true`; nothing auto-posts, ever | — |
| 10 | Update ledger, write the meeting record (sanitized, like other rooms), spend to the budget ledger, run-record under `state/ventures/marketingshark/` | — |
| 11 | Commit per the runtime convention for scheduled work (atomic, gates first) | — |

Kill conditions: any failure leaves no partial artifacts (package + ledger + queue entry
are written together or not at all), aborts are $0 beyond any already-spent call, the
room never exceeds two model calls per brand per day, and a failed day surfaces as a
Skipped/failed slot on the calendar, not silence.

Agenda policy: register `ms-daily` as a **standing daily** window (Titty Tuesdays
precedent — it opens without a due agenda). Add exactly two allowlisted transitions:
the morning board may place a focusing agenda for `ms-daily` (e.g. "prefer category X
this week"), and `ms-daily` may request at most MAKO's weekly review room, nothing else.
Envelopes: `ms-daily` $0.10 per enabled brand; MAKO weekly $0.06.

---

## 10. Output package, KPIs, Money

**Package schema** (zod in the module; one file per brand per day):

```ts
export const SlideCopy = z.object({
  role: z.enum(["hook", "context", "reveal", "why", "footer"]),
  templateId: z.string(),
  headline: z.string().max(120),
  body: z.string().max(600).optional(),
  alt: z.string().max(200),
});

export const CarouselCopy = z.object({ slides: z.array(SlideCopy).length(5) });

export const MarketingSharkPackage = z.object({
  schemaVersion: z.literal("marketingshark-package/1"),
  date: z.string(),                       // Prague date
  brandId: z.string(),
  question: z.object({ id: z.string(), category: z.string(), difficulty: z.number() }),
  hooks: z.object({
    a: z.object({ patternId: z.string(), en: z.string(), cs: z.string() }),
    b: z.object({ patternId: z.string(), en: z.string(), cs: z.string() }),
  }),
  carousels: z.object({ cs: CarouselCopy, en: CarouselCopy }),
  descriptions: z.object({
    instagram: z.object({ cs: z.string().max(2200), en: z.string().max(2200) }),
    threads: z.object({ cs: z.string().max(500), en: z.string().max(500) }),
  }),
  hashtags: z.object({
    instagram: z.object({ cs: z.array(z.string()).min(3).max(5), en: z.array(z.string()).min(3).max(5) }),
    threads: z.object({ cs: z.array(z.string()).length(1), en: z.array(z.string()).length(1) }),
  }),
  render: z.object({ engineVersion: z.string(), summaryPaths: z.array(z.string()) }),
  status: z.literal("draft"),
  abRecord: z.object({ measured: z.literal(false), note: z.string() }), // SPLIT-compatible; no metrics exist
  spendUsd: z.number(),
});
```

The queue entry reuses the existing social queue schema (REACH's A/B draft contract is
the closest precedent); the package path is its payload. Draft-locked while the kill
switch is up; after any future unlock the per-brand credential/proof gates still apply —
you build none of that now.

**KPIs** — add to `config/kpis/2026-Q1.json`, mid-quarter activation with the standard
14-day ramp, honest `unavailable` where no data exists yet:

| Target id | Definition | Target | Critical |
| --- | --- | --- | --- |
| `marketingshark.daily-package-rate` | packages produced ÷ scheduled brand-days after ramp | ≥ 0.9 | no |
| `marketingshark.package-completeness` | packages passing full schema + render checks | 1.0 | yes |
| `marketingshark.truth-gate-violations` | step-7 failures that reached a committed package | 0 | yes |
| `marketingshark.hook-rotation-coverage` | distinct patterns used per brand per 30 days | ≥ 10 | no |
| `marketingshark.cost-per-package` | model spend ÷ packages | ≤ $0.08 | no |
| `marketingshark.owner-review-rate` | reviewed queue items ÷ queued | unavailable until reviews exist | no |

No reach, follower or engagement KPIs: measurement is disabled by design and rule 7
forbids vanity KPI optimization.

**Money.** Register marketingShark in the earning-method state as a **locked hypothesis**
(internal service; recognized revenue $0; activation owner-only), and add rows to
`monetization.md` in its existing Czech table style:

| Možnost | Pravděpodobnost příjmu | Možný výdělek | Výhody | Nevýhody |
| --- | --- | --- | --- | --- |
| **marketingShark jako interní agentura** | n/a (interní služba) | unavailable | Denní obsah pro rodinu Shark produktů za ~$1,60/měs; deterministický pipeline | Nevydělává; hodnota se projeví až v růstu produktů |
| **devShark (portfolio produkt)** | Mimo účetnictví BoardlessAI | unavailable | Hotový produkt, marketing řeší marketingShark | Případné příjmy produktu se neúčtují zde, dokud majitel nerozhodne |

Operating cost line for the venture: ≈ $1.60/month Phase 1, ≈ $3.30/month Phase 2, $0
fixed costs, $0 cash purchases (no treasury items — rendering is free and the model spend
rides the existing API ledger).

---

## 11. The devShark banner (DNESKAi / aifirst)

Scope: devShark only. geoShark never gets a banner anywhere — that is pinned by config
schema (§4) and by test.

1. **Slot.** Prompt 1 of this series reserves a config-driven banner slot in
   `lukaskourilcz/aifirst`; its dimensions and position are decided there. At
   implementation time, read that repo's banner config and use its values. If the slot is
   absent (as of 2026-08-07 it was), deliver this fallback spec as part of the banner
   package — a config plus a component, consistent with DNESKAi's existing config-driven
   style: `config/banner.json` `{ "enabled": false, "slotId": "house-banner",
   "position": "below-article-footer", "maxWidth": "720px", "height": { "desktop": 120,
   "mobile": 90 }, "href": "https://devshark.app?utm_source=dneskai&utm_medium=banner&utm_campaign=devshark-house",
   "asset": "public/banners/devshark.svg", "alt": "devShark — kvízová hra pro vývojáře",
   "label": "vlastní projekt" }` and a component that renders nothing when the file is
   missing or `enabled` is false. The honest "vlastní projekt" label stays — DNESKAi
   must not look like it sells ads.
2. **Creative.** One static SVG, self-contained: no scripts, no external fonts or
   requests (system font stack or text outlined to paths), CSP-safe, self-hosted under
   the target repo's `public/`. Use devShark's real identity — read the Deep End tokens
   in `react-express-app` (`client/src/styles/astryx-theme.css`, product catalog in
   `client/product-catalog.ts`) for the ocean-ink palette and canonical name/URL. Czech
   copy, written under the craft voice rules and stop-slop, truthful (no user counts):
   the devShark wordmark, one line in the spirit of "Kvízová hra, se kterou budeš lepší
   vývojář.", and `devshark.app`. Final wording is yours; keep it a footer-register note,
   not an ad shout.
3. **Delivery.** Stage the asset + banner config as a bounded delivery contract in quorum
   (define `marketingshark-banner/1` beside the existing contracts), hash the payload,
   send through the existing App channel (aifirst is already on the allowlist — DNESKAi
   editions travel it daily), verify post-deploy like an edition, record the receipt
   under `state/ventures/marketingshark/banner/`. Because a house banner on the reader
   site is a new outward-facing surface, gate the first delivery behind one
   `HUMAN_APPROVAL` item in `state/INBOX.md` ("place devShark house banner on DNESKAi");
   after that one approval the delivery runs within its recorded scope. If the channel
   cannot run from your session, staging + the INBOX item + a
   `NEEDS_YOUR_HELP_NOW.md` entry is the correct final state.

---

## 12. geoShark — Phase 2 is a config flip

Everything is built brand-generic from day one. Enabling geoShark is:

1. Run the importer once: `pnpm marketingshark:import-bank -- --brand geoshark --source
   <path-to-react-express-app-clone>` (writes
   `state/marketingshark/question-banks/geoshark.json` from the `geography` subject).
2. **The one-file change**: in `config/marketingshark.json`, set the geoshark brand's
   `"enabled": false` → `"enabled": true`.

Nothing else: the ledger creates the brand node on first run, the room loops enabled
brands, hooks carry `geo` variants, the queue and admin are brand-keyed, and `banner`
stays `false`. Add a dry-run test that proves an enabled geoshark config produces a
second selection + packet without any code change.

**Adapter interface** (implement now; the importer for react-express-app is its first
implementation — any equivalent JSON bank maps through the same seam):

```ts
export interface QuestionBankAdapter {
  /** Stable id, recorded in provenance. */
  readonly sourceId: string;
  /** Load and normalize the full bank; must be deterministic for a given source commit. */
  load(source: { repo: string; commit: string; subject: string; localPath: string }):
    Promise<NormalizedQuestion[]>;
}
```

---

## 13. Cost budget (fits the countersigned caps with two orders of magnitude to spare)

Model: Claude Sonnet 5 at $3 in / $15 out per MTok (intro $2/$10 through 2026-08-31).
Estimates use sticker prices.

| Item | Tokens (in/out) | Per run | Monthly |
| --- | --- | --- | --- |
| CHUM daily, one brand (Phase 1) | ~4,000 / ~2,400 | ~$0.048 | ~$1.50 (31 days, ~5% retry allowance) |
| MAKO weekly review | ~6,000 / ~1,200 | ~$0.036 | ~$0.16 |
| **Phase 1 total** | | | **≈ $1.66/month, ≤ $0.06 typical day** |
| Phase 2 (two brands: second CHUM call) | ×2 daily | ~$0.10/day | **≈ $3.15/month** |

Envelopes: `ms-daily` $0.10 per enabled brand per day (covers the retry), MAKO $0.06.
Against `budget-2026-08e` ($30 all-in, $25 model share, $1.00 daily pace) this adds
6–10¢ to a day that currently runs ~$0.36–0.41 — comfortable. Against the older 08d
numbers it is trivial. Do not raise any cap; do not add treasury items.

$0 deterministic checkpoints, stated as such in code and docs: question selection and
ledger, hook assignment and truth predicates, config/schema validation, output truth
gates, Carousel Studio rendering and checks, packaging, queue writes, KPI evaluation,
the calendar/pre-check path, and both abort paths. The only paid step in the venture is
step 6, plus one weekly MAKO call.

---

## 14. Acceptance criteria — all of these, demonstrated, none reported without running

1. `pnpm agents:validate` passes with the extended registry (42 entries), and the roster
   zod tests pass; the counts shown in docs match.
2. Schedule validation passes with the thirteenth window at 07:00 Prague; a collision
   test proves no window sits within 60 minutes of another; both DST cron expressions
   resolve to 07:00 Prague and the dispatcher names `ms-daily`.
3. Ledger unit tests: same date+bank → same question (idempotent rerun); no repeat before
   exhaustion; recorded epoch reshuffle on exhaustion; re-import with new questions
   preserves served history; hook cooldown and deterministic relaxation.
4. **A live test run**: first `pnpm cycle -- --phase ms-daily --dry` (fixture-labeled, no
   provider call), then one real run (model keys were confirmed present in Actions on
   2026-08-02 — use a manual workflow dispatch, or run locally if the owner's `.env` is
   available). The real run must leave: a visible meeting record (site/admin, sanitized
   like other rooms), one complete devShark package with CS and EN carousels rendered to
   checked SVG/PNG, descriptions, hashtags, alt text and the A/B record, a ledger entry,
   a queue item in `draft`, and the spend in the budget ledger. If no key is reachable
   from your session, the dry run plus a `NEEDS_YOUR_HELP_NOW.md` item asking the owner
   to fire the first live dispatch is the honest fallback — say so, do not fake it.
5. Nothing posted anywhere: `SOCIAL_KILL_SWITCH` stays `true`, the publisher is
   untouched, packages carry `status: "draft"`, and a test asserts the queue item cannot
   reach the publisher while the switch is up.
6. geoShark present and disabled; the Phase 2 dry test from §12 passes; a schema test
   rejects any config giving geoshark a banner.
7. Banner: asset + contract staged and schema-validated; delivered with receipt through
   the channel, or staged with the `HUMAN_APPROVAL` INBOX item if the first placement
   needs the owner. No direct push to aifirst from the session.
8. Full gates green: `pnpm lint`, `pnpm typecheck`, `pnpm test` (including
   `architecture.test.ts` untouched-skill mirror), `pnpm build`, and the site e2e suite.
9. `pnpm docs:refresh` run so the generated ECOSYSTEM block reflects the new venture.

---

## 15. Commit and PR plan

Branch `claude/marketingshark-venture-arch-cqvniv` in both repos; push with
`git push -u origin <branch>` (retry up to 4 times with 2/4/8/16s backoff on network
failure only). Frequent, coherent phase commits in quorum, roughly:

1. `marketingshark: founding decision + venture registry entry`
2. `marketingshark: roster +MAKO +CHUM, routing, agent validation`
3. `marketingshark: venture config, hook library, schemas`
4. `marketingshark: question bank importer + devshark snapshot`
5. `marketingshark: ledger + deterministic selection with tests`
6. `marketingshark: ms-daily room engine, craft/strategy prompts, truth gates`
7. `marketingshark: carousel render integration (+quiz-code-context if needed)`
8. `marketingshark: packages, approval queue, admin tab, site page`
9. `marketingshark: ms-daily schedule wiring + calendar + KPIs + money`
10. `marketingshark: devshark banner asset, contract, delivery/staging`
11. `docs: portfolio-wide markdown walk` (the closing instruction below)

react-express-app gets one docs commit on its branch. Open one PR per repo against the
default branch (check for a PR template first and mirror its sections if one exists),
with a body that lists what changed, the live-run evidence, and what stayed locked.
Merging to `main` is the owner's call — both repos auto-deploy from `main`.

---

## 16. Closing instruction — run after implementation, not optional

After the implementation commits, run a **full-portfolio review**: walk every `.md` file
in every repo you touched (quorum, react-express-app; aifirst only through the delivered
package) and update each to match reality — the seventh venture, the two agents, the
thirteenth clock slot, the KPI additions, the Money rows, the social plan (drafts only,
everything locked), and the budget-cap prose corrected to the resolver truth from ground
rule 3. Refresh the master document: update the curated sections of `docs/ECOSYSTEM.md`
(projects, roster table, clock table, decision map — the founding decision gets its
letter/number per the existing series) and run `pnpm docs:refresh` for the generated
block; update `docs/PORTFOLIO.md`, `README.md`, `about-project.md`, `scaling.md`,
`monetization.md`, `GOVERNANCE.md` if counts appear there, `NEEDED.md`'s reference
tables, and `MANUAL STEPS.md` if any owner step changed. Keep every historical decision
append-only.

Then reconcile `NEEDS_YOUR_HELP_NOW.md`: add exact, actionable owner items for anything
only the owner can do — the banner `HUMAN_APPROVAL` (if staged), the first live `ms-daily`
dispatch (if you could not run it), future shark-brand social credentials (explicitly
"later; drafts work without them"), and the budget-cap discrepancy only if you found the
resolver and decisions in real conflict. If nothing owner-blocking remains, say so in
that file's style — its absence of new items is the all-clear signal.

---

## Appendix A — marketing-skills audit (upstream `coreyhaines31/marketingskills` @ `7868cb9`, 49 skills)

The craft and strategy files in §6–7 are adaptations of the six selected skills; the text
is owned by this repository and no runtime dependency on the upstream repo exists. Four
of the six are already vendored in `.claude/skills` (unchanged by this task); the other
two are adapted by distillation only — do **not** vendor new skill directories, which
would disturb the mirrored-skills architecture test.

**Selected (6):**

| Skill | Why it measurably helps |
| --- | --- |
| copywriting | Slide and description craft: clarity-over-cleverness, specificity, CTA restraint — the backbone of §6's voice rules. |
| social | Carousel structure (slide-1-is-the-thumbnail, one template per carousel, caption-as-own-hook) and platform limits (IG 3–5 hashtags, Threads single topic tag ≤500 chars) — §6's slide and description contracts. |
| marketing-psychology | The honest subset (open loop between slides 1→3, unity/insider voice, bounded loss framing) plus the explicit no-invented-statistics rule. |
| product-marketing | Positioning and audience framing in §7 (MAKO), and the slide-5/banner register: value first, product mention as a footer note. |
| ab-testing | Variant discipline for the A/B hook record: one variable (the hook pattern), recorded hypothesis-style, explicitly unmeasured until metrics exist. |
| copy-editing | The "final sweep" in §6 (clarity, so-what, specificity, truth, limits) distilled from its seven-sweeps method. |

**Rejected (43):** ab/ads/paid: `ads`, `ad-creative` (ad-format voice contradicts the
footer-note contract; hook craft already covered), `attribution`, `analytics` (measurement
is disabled by design); SEO/site: `ai-seo`, `seo-audit`, `programmatic-seo`, `schema`,
`site-architecture` (no search surface in scope); lifecycle/CRM: `emails`, `cold-email`,
`sms`, `churn-prevention`, `onboarding`, `signup`, `forms`, `popups`, `paywalls`,
`lead-magnets`, `referrals`, `revops`, `sales-enablement`, `prospecting` (no accounts, no
funnels, no outbound — all outside the social-draft scope and several would violate the
consent gates); strategy/ops: `content-strategy`, `marketing-plan`, `marketing-ideas`,
`marketing-loops`, `marketing-council` (cadence, format and governance are fixed by this
design and by the council itself); market/competition: `competitors`,
`competitor-profiling`, `customer-research`, `positioning-adjacent` extras like `offers`
and `pricing` (nothing is sold), `free-tools`, `launch`, `aso` (no app-store work),
`co-marketing`, `community-marketing`, `influencer-marketing`, `public-relations`,
`directory-submissions` (all involve external outreach, accounts or spend — human-only
surfaces); media: `image`, `video` (Carousel Studio is the only render path; no video
production exists); `cro` (no conversion surface to optimize).

## Appendix B — facts you can trust without re-deriving

- Free Prague hours: 07:00, 12:00, 15:00, 16:00, 21:00, 23:00 (and the small hours).
- Existing phase names follow `cu-edition` / `tt-marketing` / `mag-desk` style → `ms-daily`.
- Threads: one topic tag max, 500-char cap. Instagram: 3–5 hashtags total, caption cap
  2,200, ~125 chars visible before the fold — front-load the hook.
- Sonnet 5 = `claude-sonnet-5`; Haiku 4.5 = `claude-haiku-4-5`. Never invent other ids.
- devShark production URL `https://devshark.app`; StudyShark (geoShark's home)
  `https://studyshark-app.vercel.app`; verify both against `client/product-catalog.ts`
  when you write slide-5 and banner copy.
- The vendored marketing skills' `UPSTREAM.md` files record divergences; the `social`
  skill's Apify note is already handled portfolio-wide — do not stand up any new account.
