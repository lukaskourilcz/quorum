# BoardlessAI

BoardlessAI is an agent-operated company whose decisions, rules, and operating
records live in this repository.

Four agents form the council. Specialists work on a Prague clock. Every room
records what it decided, including a decision to do nothing. Channels, spending,
and public actions stay behind explicit gates.

**The site is <https://boardless-ai.vercel.app>.** It shows the current company
state, schedule, decisions, ventures, and published work.

## Ventures

Since `operations-2026-09b` (2026-09-25) five ventures run. `config/ventures.json` is the source
of truth; a paused venture keeps its code and state, holds no slot on the clock and is listed in
the admin's Settings rather than its navigation.

| Running | What it produces |
| --- | --- |
| **DNESKAi** | One sourced Czech AI edition a day, or `NO_EDITION` with a reason, and its social pack. |
| **marketingShark** | One English `devShark` post each weekday, its kind set by the weekday, drafted into the Queue for the owner's approval. |
| **GoVIRAL** | A measured weekly trend brief for DNESKAi and devShark from bounded paid and free sources; it posts nothing. |
| **Design Lab** | Deterministic templates, presets, decks, and renders for the running brands. |
| **WebDev Signal** | A $0 pre-step of the DNESKAi day; its editions are held. |

| Paused | What it produced |
| --- | --- |
| **MMA Files** | One sourced Czech MMA article a day when its evidence gates pass. |
| **FightAIQ** | Source-checked fighter and event records, with gated fight probabilities. |
| **Titty Tuesdays** | Pre-commerce brand, season, and campaign plans; there is no shop or spend path. |
| **Kvórum** | Up to two sourced Czech political recommendation drafts a day; the owner posts manually. |
| **Door Money** | Evidence-linked English recommendation drafts and a Thursday owner action packet. |
| **BOOKSOFHISTORY** | Sourced Czech and English book-story drafts; the owner approves, renders, and posts manually. |
| **Tehdejší svět** | Bilingual Czech and Ukrainian memory features from a hash-verified facts file. |
| **Personal Growth** | The owner-only desk for the book and audiobook promotion. |

## Stack

This is a pnpm monorepo written in TypeScript. `orchestrator/` runs the council
and venture rooms. It records decisions in `state/` as plain files in Git.
`site/` is the Next.js public site and protected admin. `studio/` is the
deterministic render package: the same input produces the same bytes. GitHub
Actions runs the cycles. Merging to `main` does not deploy the site: `site/vercel.json` turns Git
deployments off, and a release is `pnpm deploy:check` followed by `pnpm deploy:production`.

The company has a hard **$50 monthly cap** across models, APIs, media, hosting,
and tools. Personal Growth has a nested $20 cap inside it and remains owner-only.

## Prague clock

The running rooms: the DNESKAi day at 05:00, the morning council at 06:00, marketingShark at
07:00, the DNESKAi retry at 09:00 and GoVIRAL at 13:00 (its room meets on Mondays). Three
backstop sweeps a day catch a slot the cron missed. The registry is the source of truth:
`site/vercel.json` and the sweeps derive from it, so a paused venture's rooms drop off the clock.
Vercel stores paired UTC entries so the Prague hours hold across daylight-saving changes.

## Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm cycle -- --phase morning --dry
pnpm agents:validate
pnpm docs:check
pnpm --filter @boardlessai/orchestrator operations:release-audit
```

Use Node 22 or newer. The dry cycle uses fixtures, spends nothing, and needs no
API key. The site reads committed state.

## Documentation map

- Start with the [operating model](docs/ECOSYSTEM.md), [portfolio map](docs/PORTFOLIO.md),
  [governance](GOVERNANCE.md), [autonomous operations](docs/AUTONOMOUS-OPERATIONS.md)
  and [engineering contract](docs/ENGINEERING.md).
- Owner-facing context lives in [about-project](about-project.md), [scaling](scaling.md),
  [monetization](monetization.md) and the single [owner action list](docs/NEEDED.md).
- Paused ventures' designs: [BOOKSOFHISTORY](docs/BOOKSOFHISTORY-VENTURE-DESIGN.md),
  [Door Money](docs/DOOR-MONEY-VENTURE-DESIGN.md), [FightAIQ](docs/FIGHTAIQ.md),
  [Kvórum](docs/KVORUM-VENTURE-DESIGN.md), [MMA Files](docs/MMA-FILES.md),
  [Tehdejší svět](docs/TEHDEJSI-SVET-VENTURE-DESIGN.md) and
  [Titty Tuesdays visuals](docs/TITTY-TUESDAYS-VISUAL-LOOP.md).
- DNESKAi's run history: [yield report](docs/reports/dneskai-yield-2026-09-25.md), rebuilt with
  `pnpm edition:yield -- --since <date>`.
- Shared creative systems: [Design Lab](docs/design-lab/README.md),
  [hook knowledge](docs/hooks/README.md) and
  [workspace fixtures](docs/design/workspace-fixtures/README.md).
- Living state: [business](state/BUSINESS.md), [roadmap](state/ROADMAP.md),
  [brand](state/BRAND.md), [experiments](state/EXPERIMENTS.md),
  [finance](state/FINANCE.md), [approvals](state/INBOX.md),
  [opportunities](state/OPPORTUNITIES.md) and [social policy](state/SOCIAL_STRATEGY.md).
- Venture-local state guides (most for paused ventures): [BOOKSOFHISTORY](state/ventures/booksofhistory/README.md),
  [Door Money](state/ventures/door-money/README.md),
  [FightAIQ](state/ventures/fightaiq/README.md), [GoVIRAL profile](state/ventures/goviral/profile.md),
  [Kvórum](state/ventures/kvorum/README.md),
  [Tehdejší svět](state/ventures/tehdejsi-svet/README.md) and
  [the MMA bridge](state/mma/BRIDGE.md).

Contributors read [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md) and
[CONTRIBUTING.md](CONTRIBUTING.md). Runtime prompts, `.claude/agents`, `.claude/commands`,
`.agents/product-marketing-*`, decision records, state indexes and mirrored skills are reached by
their registries and directory conventions; they are operational inputs, not standalone
documentation pages. `.agents/ENGINEERING.md` is the byte-tested mirror of the linked engineering
contract above.
