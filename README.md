# BoardlessAI

BoardlessAI is an agent-operated company whose decisions, rules, and operating
records live in this repository.

Four agents form the council. Specialists work on a Prague clock. Every room
records what it decided, including a decision to do nothing. Channels, spending,
and public actions stay behind explicit gates.

**The site is <https://boardless-ai.vercel.app>.** It shows the current company
state, schedule, decisions, ventures, and published work.

## Ventures

| Venture | What it produces |
| --- | --- |
| **DNESKAi** | One sourced Czech AI edition a day, or `NO_EDITION` with a reason. |
| **MMA Files** | One sourced Czech MMA article a day when its evidence gates pass. |
| **FightAIQ** | Source-checked fighter and event records, with gated fight probabilities. |
| **Design Lab** | Deterministic templates, presets, decks, and renders for supported venture brands. |
| **marketingShark** | One native Czech and English `devShark` quiz package a day. |
| **GoVIRAL** | A measured weekly trend brief from bounded paid and free sources; it posts nothing. |
| **Titty Tuesdays** | Pre-commerce brand, season, and campaign plans; there is no shop or spend path. |
| **Kvórum** | Up to two sourced Czech political recommendation drafts a day when room and evidence gates pass; the owner posts manually. |
| **Door Money** | Evidence-linked English recommendation drafts and a Thursday owner action packet; it carries no manuscript and publishes nothing. |
| **BOOKSOFHISTORY** | Sourced Czech and English book-story drafts; the owner approves, renders, and posts manually. |
| **Tehdejší svět** | Bilingual Czech and Ukrainian memory features from a hand-committed, hash-verified facts file; the owner posts manually. |

## Stack

This is a pnpm monorepo written in TypeScript. `orchestrator/` runs the council
and venture rooms. It records decisions in `state/` as plain files in Git.
`site/` is the Next.js public site and protected admin. `studio/` is the
deterministic render package: the same input produces the same bytes. GitHub
Actions runs the cycles. Vercel deploys the site from `main`.

The company has a hard **$30 monthly cap** across models, APIs, media, hosting,
and tools.

## Prague clock

There is one daily window each hour from 05:00 through 22:00 Prague time:
DNESKAi edition, morning council, marketingShark, MMA intake, FightAIQ
editorial, MMA article, Titty Tuesdays, BOOKSOFHISTORY, GoVIRAL, afternoon
council, Door Money desk, Door Money growth, DNESKAi product, Tehdejší svět,
MMA analysis, FightAIQ desk, Kvórum, and night council. The schedule registry is
the source of truth. Vercel stores paired UTC entries so the Prague clock keeps
the same local hours across daylight-saving changes.

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
```

Use Node 22 or newer. The dry cycle uses fixtures, spends nothing, and needs no
API key. The site reads committed state.

## Documentation map

- Start with the [operating model](docs/ECOSYSTEM.md), [portfolio map](docs/PORTFOLIO.md),
  [governance](GOVERNANCE.md) and [engineering contract](docs/ENGINEERING.md).
- Owner-facing context lives in [about-project](about-project.md), [scaling](scaling.md),
  [monetization](monetization.md) and the single [owner action list](docs/NEEDED.md).
- Venture designs: [BOOKSOFHISTORY](docs/BOOKSOFHISTORY-VENTURE-DESIGN.md),
  [Door Money](docs/DOOR-MONEY-VENTURE-DESIGN.md), [FightAIQ](docs/FIGHTAIQ.md),
  [Kvórum](docs/KVORUM-VENTURE-DESIGN.md), [MMA Files](docs/MMA-FILES.md),
  [Tehdejší svět](docs/TEHDEJSI-SVET-VENTURE-DESIGN.md) and
  [Titty Tuesdays visuals](docs/TITTY-TUESDAYS-VISUAL-LOOP.md).
- Shared creative systems: [Design Lab](docs/design-lab/README.md),
  [hook knowledge](docs/hooks/README.md) and
  [workspace fixtures](docs/design/workspace-fixtures/README.md).
- Living state: [business](state/BUSINESS.md), [roadmap](state/ROADMAP.md),
  [brand](state/BRAND.md), [experiments](state/EXPERIMENTS.md),
  [finance](state/FINANCE.md), [approvals](state/INBOX.md),
  [opportunities](state/OPPORTUNITIES.md) and [social policy](state/SOCIAL_STRATEGY.md).
- Venture-local state guides: [BOOKSOFHISTORY](state/ventures/booksofhistory/README.md),
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
