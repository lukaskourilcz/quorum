# NEEDED — owner setup index

The complete, deduplicated checklist is [`NEEDS_YOUR_HELP_NOW.md`](NEEDS_YOUR_HELP_NOW.md).
Use that file as the source of truth; this compatibility file exists because older
runbooks and admin links still point to `NEEDED.md`.

## 0. Repository variables — everything below is inert until these are set

No cycle does live work without these. They are GitHub **repository variables**
(Settings → Secrets and variables → Actions → Variables), not secrets, and they are read
by `.github/workflows/cycle.yml` and re-checked in `orchestrator/src/cycle.ts:847` and
`orchestrator/src/portfolio/run.ts:467`. A missing variable is not an error: the run
records a deterministic skip and costs $0, which is why a misconfigured repo looks
healthy and still produces nothing.

| Variable | Set to | Unlocks |
| --- | --- | --- |
| `AUTONOMY_KILL_SWITCH` | anything except `true` | every scheduled cycle; `true` halts all of them |
| `PORTFOLIO_LIVE_ENABLED` | `true` | the global board and every venture room |
| `CAUGHT_UP_LIVE_ENABLED` | `true` | `cu-edition`, `morning`, `cu-product` |
| `MMA_FILES_LIVE_ENABLED` | `true` | `mag-editorial`, `mag-desk`, `article-am`, `article-pm`, MMA delivery |
| `FIGHTAIQ_LIVE_ENABLED` | `true` | FightAIQ intake |
| `FIGHTAIQ_ANALYSIS_ENABLED` | `true` | FightAIQ D8 analysis |

MMA Files needs **both** `PORTFOLIO_LIVE_ENABLED` and `MMA_FILES_LIVE_ENABLED`; either
one alone still skips. Leave `SOCIAL_KILL_SWITCH` as it is — it beats every per-channel
unlock and nothing here asks you to change it.

Required secrets for any model call: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. Publishing
additionally needs `DELIVERY_APP_ID` and `DELIVERY_APP_PRIVATE_KEY`.

- [ ] **Set the six repository variables** — table above; nothing runs live without them. [imp:5] [owner:me] [time:15m] [kind:setup]
- [ ] **Confirm both model API keys are present** — every room call fails closed without them. [imp:5] [owner:me] [time:5m] [kind:setup]

## 1. Seed the founding gate — no agent can write the file it scores

The DISCOVERY gate reads `state/OPPORTUNITIES.json` (`orchestrator/src/cycle.ts:973`),
but the task allowlist (`orchestrator/src/patch.ts:17`) lets a `research` task write only
`state/OPPORTUNITIES.md` and `state/EVIDENCE.jsonl`. No task type can write the `.json`
the gate reads, so no agent can pass it and the board returns the same `NO_ACTION` every
cycle. Do not widen the allowlist to fix this — the narrow write scope is a guard.

- [ ] **Add the first opportunity record to `state/OPPORTUNITIES.json`** — needs score ≥35/50, no dimension below 2, and ≥3 independent non-fixture evidence refs in `state/EVIDENCE.jsonl`. [imp:5] [owner:me] [time:60m] [kind:decision]
- [ ] **Record in `state/BUSINESS.md` that the DISCOVERY gate is owner-seeded by design** — otherwise this reads as a bug at every re-audit. [imp:3] [owner:ai] [time:10m] [kind:decision]

## 2. Unblock the specialist rooms

Six phases need a due agenda, agendas need an open priority item, and the only producer
is the quarter-end protocol, which throws until 2026-10-31
(`orchestrator/src/metrics/quarterly.ts:231`). Four daily windows stay parked until then.
The control to add an item already ships and is documented nowhere:
`site/src/app/admin/api/priorities/route.ts` appends one with a seven-day expiry.

- [ ] **Add a priority item through `/admin` to open a specialist room before Q1 closes** — the control exists; no code change needed. [imp:4] [owner:me] [time:10m] [kind:setup]

## 3. Then, in order

1. verify the delivery App covers Caught Up and MMA Files;
2. verify the three Vercel production domains/settings;
3. verify the two allowed FightAIQ free-tier keys;
4. enter real fixed costs and review Q1 seeds;
5. add the three brands' Instagram/Threads tokens and IDs only before social posting;
6. keep analytics deferred until the owner chooses a provider and lawful plan.

Optional Pexels/Pixabay keys are not blockers. GNews, Guardian and NYTimes keys are
not used. Carousel Studio needs no credential, account or separate deployment.

Exact workflow order and proof locations are in [`MANUAL STEPS.md`](MANUAL%20STEPS.md).

## Recently finished

- The 40 agent personas now load into live rooms, and `system` is byte-identical per
  room so the room prompt and shared packet form one cacheable prefix.
- Caught Up rewrites receive the specific validator rejection instead of a generic line.
- `CLAUDE.md` carries the countersigned $50 cap; `STYLEBOOK.md` states the em-dash and
  recap rules that `style.ts` enforces literally; `mma.md` states the D8 gate as
  independent sources.
- `.nvmrc` pins Node 22, without which the test suite cannot run at all.
