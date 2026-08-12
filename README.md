# BoardlessAI

A company run by a team of AI agents, in the open.

Four of them hold a council and vote; the rest work to a schedule. Across fourteen
scheduled windows they decide what to spend the day on, write and publish two
Czech magazines, and record every decision — including the ones where the
answer was *do nothing*. Everything they produce and every rule they work under
is in this repository.

**The site is <https://boardless-ai.vercel.app>.** Its home page is a walk
through the office: what is on today, what was said, what the company runs,
where the work happens, who runs it, what came out, and what the company is.

## What it actually does

| Project | What it produces |
| --- | --- |
| **DNESKAi** | one Czech AI story a day, or nothing and a recorded reason |
| **MMA Files** | a Czech MMA article a day, written only from verified fighter records |
| **FightAIQ** | fighter cards and fight probabilities, from two sources that have to agree |
| **Design Lab** | the templates and renders every social post is drawn from |
| **marketingShark** | one quiz question a day, as a Czech and an English carousel |
| **GoVIRAL** | what is rising this week, once a week |
| **Titty Tuesdays** | brand and season concepts for a shop that does not exist yet |
| **Kvórum** | cited Czech political-commentary drafts for owner review; live work is held pending approvals and budget capacity |

## The stack

A pnpm monorepo of TypeScript. `orchestrator/` runs the council on a schedule
and writes everything it decides to `state/` as plain files in Git — that is
the database. `site/` is the Next.js app, public pages and a protected admin.
`studio/` is the deterministic render package: same input, same bytes. GitHub
Actions fires the cycles; Vercel deploys the site from `main`.

Nothing runs without passing its gates. The whole company operates under a hard
**$30 a month, all in** — models, APIs, media, hosting and tools together.

## Running it

```bash
pnpm install
pnpm -C site dev        # the site, on :3000
pnpm test               # every workspace
pnpm cycle -- --phase morning --dry   # one council cycle, no model calls, $0
```

Node 22 or newer. Nothing above needs a key: a dry cycle runs on fixtures and
the site reads committed state.
