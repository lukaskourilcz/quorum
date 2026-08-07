# BoardlessAI — rules for Claude Code sessions

Autonomous web business built by a 4-agent council (VIZE, FORGE, PULSE, AUDIT).
Council runs via API in `orchestrator/`; you are the human-invoked engineer.

## Map

- `state/` — source of truth: BUSINESS (stage/thesis), OPPORTUNITIES, EVIDENCE,
  EXPERIMENTS, FINANCE, CONTENT_INVENTORY, CLAIMS, BRAND, ROADMAP, INBOX and
  decisions.
- `orchestrator/` — cycle engine + council prompts. `site/` — Next.js app.
- `studio/` — `@boardlessai/carousel-studio`, the deterministic render package. It is
  consumed as TypeScript source, so `site` must run webpack (`next dev --webpack`,
  already in its `dev` script) — Turbopack does not apply the `.js`→`.ts` extension alias
  and every studio import fails under it.
- `config/models.json` — model IDs per role. `.env.example` — required env.

## Two things a session will trip over

- **The home page is one client component.** `site/src/components/office/` holds the
  office walkthrough; `site/src/lib/office-walkthrough.ts` resolves everything it renders
  on the server and hands it across as plain JSON, which is also the sanitising boundary.
  Its layout invariants are load-bearing and were each a real bug: centre an oversized
  backdrop plate with `left/top:50%` plus `translate(-50%,-50%)` and never with grid
  centring; give every decorative layer `pointer-events: none`, because section 05's mood
  tint sits after the content and otherwise swallows every click on the wallboard; keep
  the plates off `will-change`, which exhausted the compositor and painted whole frames
  black; and mark real horizontal scrollers `data-horizontal-scroll` or the containment
  e2e guard reads them as overflow.
- **A delivered article also goes to Carousel Studio.** `storeArticlePackage` and the
  edition outbox write both call `buildCarouselSummary` from `studio/src/summary.ts`, so a
  delivery cannot happen without a summary beside it. The site rebuilds the same summary
  from the package for anything published before that existed, using the same function —
  a recorded summary always wins over a derived one, because it is what was actually sent.

## Golden rules

1. Read the latest `state/decisions/*.md` before implementing anything.
2. Read current stage, active experiment, evidence refs and stop condition. Do
   not build a task that is stale, duplicate, stopped or outside its stage.
3. BoardlessAI corporate positioning and visual system are locked from
   founding. Only the name-clearance field is provisional. Visual changes use
   brand tokens and the approved brand flow; venture pivots never silently
   rebrand the company.
4. Never commit secrets. Never weaken budget, patch, security, evidence, stage,
   finance, content-quality or release guards and their tests. PEOPLE's runtime
   `org_change` exception uses only the dedicated Tier A/B maintenance module;
   an interactive session must not imitate it with direct prompt/config edits.
5. Money, account creation, ads, personal data, credentials, new OAuth scopes
   and enabling a channel's `autopublish` go to `state/INBOX.md` as
   `HUMAN_APPROVAL`. After that one-time approval, the dedicated publisher may
   send validated organic queue items within the exact approved scope; an
   interactive builder never posts directly. All API/media/hosting/tool/ad
   costs share the hard $30/mo all-in operating cap from `budget-2026-08e`
   ($25 model/API share, $1.00 daily pace); council purchases run through
   `state/treasury/ledger.json`, only the human executes payments and resolves
   SPEND items — never mark them yourself.
6. Small commits. Initial implementation uses phase commits; runtime council
   work uses one atomic `cycle(NNN)` commit after all gates.
7. Site must pass the full release gate. No thin/uncited content, fake claims,
   vanity KPI optimization or forced work when NO_ACTION is better.

## Commands

`pnpm install` · `pnpm test` ·
`pnpm cycle -- --phase morning|afternoon|night|founding [--dry]`
`pnpm -C site dev|build|typecheck`

## When asked to "do the tasks"

Use the `builder` subagent on unchecked tasks in the newest decision file, one
task per commit, tick checkboxes, update `state/ROADMAP.md`.


## Shared skills

Four skills in `.claude/skills/` are vendored verbatim from upstream and kept
identical across every repository. Each carries an `UPSTREAM.md` with its
source, pinned commit, and license — re-vendor rather than hand-editing them.

Nineteen skills are mirrored byte-for-byte into `.agents/skills/` for Codex CLI
sessions. Eleven are this repository's own: agent-identity, boardroom-routing,
brand-identity, business-validation, financial-operations,
organization-operations, page-publishing, safe-release, social-operations,
stop-slop and titty-tuesdays-brandbook. Eight are vendored verbatim from
`coreyhaines31/marketingskills` at `7868cb9` (MIT): ai-seo, content-strategy,
copywriting, marketing-ideas, marketing-loops, marketing-psychology,
product-marketing and social. Edit both copies in the same commit;
`orchestrator/tests/architecture.test.ts` fails on any drift, file by file.
`skillRefs` in `config/agents.json` is a declarative registry field for org
review and interactive sessions. Runtime prompts do not load skill files —
GoVIRAL's craft rules are distilled into `orchestrator/prompts/goviral.md`
instead.

The vendored eight are generic advice. **This repository's contracts always
win**: the $30 all-in operating cap, the social triple-lock, the truth gates and
the treasury rules are not negotiable by a skill file. Each carries an
`UPSTREAM.md` recording where it diverges — most importantly `social`, whose
reverse-engineering reference suggests standing up an Apify account that this
system already owns and quota-guards.

- **`task-observer`** — invoke at the **start of every task-oriented session**,
  before producing deliverables. It records corrections and workflow friction in
  an observation log so they can become skill improvements later. Its log lives
  outside the repo; `.claude/observations/` is git-ignored.
- **`stop-slop`** — apply to every piece of prose that ships: documentation,
  `NEEDED.md` entries, UI copy, commit bodies, and pull-request descriptions.
- **`ui-ux-pro-max`** — consult before visual or interaction decisions. Query
  the bundled database with
  `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>`
  (domains: `ux`, `style`, `color`, `typography`, `product`, `chart`, `gsap`).
  It is generic advice. **This repository's own design contract always wins**
  where the two disagree — never let a generic recommendation override a
  documented product invariant.
- **`find-skills`** — use when a capability might already exist as an
  installable skill instead of hand-rolling one. Its `npx skills` commands need
  network access; fall back to working directly when that is unavailable.

## Session routine & markdown conventions

This repo follows a shared markdown contract (see the `session-start`,
`session-end`, and `markdown-checkup` skills under `.claude/skills/`):

- **`NEEDED.md`** — owner/agent action items. Each task:
  `- [ ] **Title** — desc. [imp:1-5] [owner:me|ai] [time:30m] [kind:K]`, where
  `[kind:K]` is one of `setup` `deploy` `legal` `content` `decision`.
- **`about-project.md`** — project summary + the tech stack.
- **`scaling.md`** — cost & scaling only (renamed from `stack-and-scaling.md`).
- **`monetization.md`** — how the project could earn (options table).

At session start, check `NEEDED.md` for `[owner:ai]` tasks that can now be done;
at session end, update `NEEDED.md` (finished + newly-needed owner items).

## Git workflow (every session)

- **Commit frequently** in small, coherent steps — never batch a whole session into one commit.
- **At the end of every session, push and merge to `main`** so the change redeploys immediately (this project auto-deploys from `main` on Vercel).
- **Delete the merged / old branch** (local and remote) after merging, to keep the repo clean. Never leave stale branches behind.
