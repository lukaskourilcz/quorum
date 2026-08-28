# Social Distribution release report

Date: 2026-08-28  
Program: GitHub #403  
Final gate: GitHub #413

This report records repository readiness only. It grants no account, OAuth, credential, provider,
routine-scope, publishing, spend or deployment authority.

## Release scope and architecture

The release completes the mandatory Social Distribution path on the existing Quorum architecture:
versioned Social contracts feed the capability-aware canonical queue, official providers remain
transport-only, append-only observations feed deterministic daily and weekly checkpoints, and the
protected Social Profiles workspace reads sanitized server snapshots. It adds no second publisher,
scheduler, analytics store, progress reader, health controller or recovery controller.

| Area | Owning issues | Release result |
| --- | --- | --- |
| Operating decision and contracts | #405, #406 | Dated platform/provider posture, real-profile topology, versioned contracts and 50 contained simulations |
| Policy, queue and core Admin | #415, #409, #407 | Central amplifier rules, capability-aware/idempotent queue, protected profile workspace |
| Campaigns, providers and runway | #410, #417, #418 | Exact accepted campaigns, held provider registry/reconciliation and cached original inventory |
| Measurement | #412 | Append-only official/manual results, bounded attribution and at most two experiments |
| Daily autonomy | #433 | Prague-day deterministic selection, exact routine scopes and honest `NO_POST` |
| Learning and health | #434 | Sample-aware weekly learning, continuation proposals and canonical Operations handoff |
| Progress and release | #419, #431, #413 | Shared implementation progress reader, Social summary, compatibility audit and final release audit |
| Optional Network | #411 | Implemented as a genuine opt-in, non-outreach domain and kept non-blocking |
| Contest Radar referral | #430 | Explicitly excluded and held; absent from Social release authority |

Permanent capability rules remain structural: Personal Growth and Kvórum cannot source or target
Social Distribution; BOOKSOFHISTORY and Tehdejší svět cannot cross-target; Door Money can enter only
through its exact bounded package; GoVIRAL intelligence can never become final copy or a CTA; and no
generic sister-venture route exists.

## Migration evidence

`pnpm social:migration-audit` completed without writing state:

| Outcome | Count |
| --- | ---: |
| Migrated | 13 |
| Unchanged | 3 |
| Held | 14 |
| Unavailable | 0 |
| Dropped | 0 |
| Malformed | 0 |

The audit retained all four legacy queue sources, their source/resolved hashes, attempts, receipts,
remote/failure evidence and both legacy readers. It mutated no source queue record, invented no
metric or authority, and preserved all future profiles/providers as held. Audit hash:
`6dc8c0a5bcd659d323f288dfa4fad4874646bd4acce5376a303ca996aad48818`.

## Validation evidence

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm agents:validate` | Passed: 49 agents, 12 venture controls, 27 avatars |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 434 files, 3,194 tests |
| `pnpm build` | Passed: optimized site and all workspaces built |
| `pnpm docs:check` | Passed |
| `pnpm social:migration-audit` | Passed with the counts above |
| `pnpm social:release-audit` | Passed: 13/13 checks; 18 privacy files scanned; zero findings |
| Isolated Social dry validation | Passed: `draft_only`; 4 queue items, 0 due/published/ambiguous/skipped; no workspace-state writes |
| Focused Social contract/release suites | Passed |
| Local Playwright launch | Environment-blocked before assertions: pinned Chromium was absent and its CDN returned repeated timeouts/502 responses |
| Complete site E2E | The final `[full-e2e]` push invokes the existing CI release job, which installs pinned Chromium and runs `pnpm -C site test:e2e` |

The production build retained existing broad dynamic-filesystem trace warnings and exited
successfully. They are unrelated to Social Distribution and did not weaken a gate.

The final release audit hash is
`db481f763ccdf176857fa2d51529b227cbd11a290adee04dbbec4adca933f6d0`.

## Live, held and prohibited state

- Live connections: **0**.
- Six real venture-primary profiles remain distinct and non-live.
- Six Direct Meta bindings remain held; Buffer, Metricool and n8n remain optional/held; Make is
  disabled; Ayrshare is rejected.
- All future profiles, routine scopes and publishing paths remain held or draft-only.
- Simulations have no handle, native id, credential, production target or KPI authority.
- There is no account creation/deletion, fake identity, automated like/follow/comment/repost/DM,
  browser/session automation, ad/boost/purchase, silent failover or automatic external retirement.
- Production Social config/state contains no credential values, private messages, audience
  identities or token-shaped values. CLI, connector and Admin errors are redacted.

## Owner action and rollback

The sole later owner setup item is `SOCIAL-DISTRIBUTION-CONNECTION-001` in `docs/NEEDED.md`. The owner
must provide secrets outside git, complete Meta OAuth/App Review, verify exact scopes/native ids and
countersign the bounded request. Repository completion does not complete that action or activate a
connection.

Rollback is defined in `docs/SOCIAL-DISTRIBUTION-RELEASE.md`: pause the exact connection or engage
the global kill switch, preserve queue/receipt/remote/failure evidence, reconcile ambiguity before
resend, restore the prior held binding/config and revoke only the involved exact routine scope.
Reactivation always requires a new explicit owner decision.
