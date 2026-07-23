# BoardlessAI — rules for Claude Code sessions

Autonomous web business built by a 4-agent council (VIZE, FORGE, PULSE, AUDIT).
Council runs via API in `orchestrator/`; you are the human-invoked engineer.

## Map

- `state/` — source of truth: BUSINESS (stage/thesis), OPPORTUNITIES, EVIDENCE,
  EXPERIMENTS, FINANCE, CONTENT_INVENTORY, CLAIMS, BRAND, ROADMAP, INBOX and
  decisions.
- `orchestrator/` — cycle engine + council prompts. `site/` — Next.js app.
- `config/models.json` — model IDs per role. `.env.example` — required env.

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
   costs share the hard $20/mo operating cap; council purchases run through
   `state/treasury/ledger.json`, only the human executes payments and resolves
   SPEND items — never mark them yourself.
6. Small commits. Initial implementation uses phase commits; runtime council
   work uses one atomic `cycle(NNN)` commit after all gates.
7. Site must pass the full release gate. No thin/uncited content, fake claims,
   vanity KPI optimization or forced work when NO_ACTION is better.

## Commands

`pnpm install` · `pnpm test` · `pnpm cycle -- --phase am|pm|founding [--dry]`
`pnpm -C site dev|build|typecheck`

## When asked to "do the tasks"

Use the `builder` subagent on unchecked tasks in the newest decision file, one
task per commit, tick checkboxes, update `state/ROADMAP.md`.
