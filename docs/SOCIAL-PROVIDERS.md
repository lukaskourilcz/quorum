# Social Distribution provider control plane

Status: implemented and held. Authority: GitHub #405, #409 and #417.

The provider control plane transports an exact item that already passed profile, connection,
capability, campaign, approval, policy, cadence, budget and kill-switch gates. It does not choose a
profile, campaign, copy, asset, window or experiment. BoardlessAI remains authoritative for the
queue, campaign, canonical receipt, attribution and learning record.

Own-account insights use the same exact binding resolver with the separate `own-insights`
capability. The current bindings do not carry that capability or the owner-approved insight scopes,
so collection records `missing-permission` and makes no provider request. See
`docs/SOCIAL-RESULTS.md`.

No account, OAuth flow, credential value, provider plan, purchase, live connection or routine
publishing authority is created by the implementation. All six retained Direct Meta bindings in
`config/social-providers.json` remain `held`.

## Contract and state family

| Contract | Purpose | Explicit non-authority |
| --- | --- | --- |
| `social-provider/1` | Dated implementation, capability, limit, risk, cost, exit and verdict record. | Strategy and content-generation authority are always false. |
| `provider-connection-binding/1` | Immutable provider-to-connection handoff, credential reference names, migration state and health. | A binding is not publishing authority. At most one may be active per connection. |
| `provider-delivery-receipt/1` | Bounded attempted, published, ambiguous and reconciled provider evidence linked to the canonical receipt. | Raw provider payloads are excluded and the receipt cannot authorize resend. |
| `provider-health/1` | Deterministic binding health, token/App Review/plan/rate/webhook posture and next safe action. | It does not replace company operations health; #425 consumes it later. |

Provider evidence is written only after an eligible runtime attempt:

- `state/social/provider-receipts/<provider-receipt-id>.json`;
- `state/social/provider-health/<provider-health-id>.json`;
- the canonical `social-post-receipt/1` retains its own truth and references the normalized
  provider receipt.

Credential and native-account values remain server-side environment values. Configuration and
Admin show allowlisted environment reference names only. Sanitized error text is bounded to 500
characters. Raw request/response bodies, authorization headers, cookies and tokens are never
persisted in this domain.

## Provider verdicts

| Provider | Role | Verdict | Release effect |
| --- | --- | --- | --- |
| Direct Meta | Direct official Instagram and Threads transport | Enabled implementation; every connection held | Mandatory core when owner setup and authority exist. No scheduler subscription. |
| Buffer | Managed scheduler | Held optional | A dated verdict is sufficient. No adapter, token, account change or plan upgrade blocks core release. |
| Metricool | Managed scheduler and reporting | Held managed-scale only | Its API plan remains outside the current budget; no adapter or purchase exists. |
| n8n | Notification/webhook boundary | Held peripheral only | Can normalize a committed webhook or notify an incident. Cannot publish or own strategy, calendar, approval, failover or outreach. |
| Make | Notification/webhook prototype | Disabled/deferred | No adapter exists without a new owner decision. |
| Ayrshare | Managed multi-profile scheduler | Rejected | No adapter or profile exists; the dated cost/authority verdict is retained. |

The registry structurally rejects `publish-original` on a notification-only provider. Optional
providers cannot silently become a connection's transport because the publisher requires the
connection's exact provider id/version and one active binding.

## Direct Meta delivery and reconciliation

The retained adapter supports only current verified formats:

- Threads: exact approved text, official publish scopes and live permalink verification;
- Instagram: one to ten approved JPEG, PNG or WebP image assets, caption text, official publish
  scopes and live permalink verification.

The runtime looks for an already known idempotency key before publication, sends at most once, and
may retry the read-only live-verification request twice. A timeout or inconclusive result during
publication becomes `ambiguous`; the queue item becomes `needs_reconciliation`, the exact
connection and source venture pause, and no subsequent run considers that item due. This prevents
an uncertain provider acceptance from becoming a duplicate send.

An ambiguous provider receipt always returns `resendAuthorized: false` and
`automaticFailover: false`. Reconciliation must record remote evidence or an owner-reviewed
failure/correction before a distinct item can be approved. A provider outage preserves the
canonical queue and campaign item.

## Explicit provider migration and rollback

A provider change is an append-only owner-governed handoff:

1. Pause the old binding so it accepts no new sends.
2. Reconcile every publishing, accepted or ambiguous item and record the receipt references.
3. Add a new `draft` or `held` binding with `previousBindingRef`; add the old binding's matching
   `supersedingBindingRef`.
4. Verify provider capability, connection platform, version, credentials, scopes, limits, health
   and owner authority.
5. Activate only the new binding. The registry rejects a second active binding for the same
   connection.
6. Retire the old binding after the observation window; never delete its receipts or binding
   history.

Rollback follows the same direction: pause the new binding, reconcile its in-flight work, create
or restore a held successor record pointing to the retained Direct Meta binding, and require fresh
owner activation. A failed provider never triggers automatic fallback, content mutation, resend,
plan change or purchase.

## Owner-only setup and stop controls

`docs/NEEDED.md` owns the external `SOCIAL-DISTRIBUTION-CONNECTION-001` checklist: verify the real
account and scopes, complete OAuth outside the repository, install credential values, confirm
token renewal and App Review, record provider limits and cancellation, then countersign the exact
routine scope. Until that evidence exists, held/draft behavior is the correct production result.

The protected Social Profiles **Providers & automation health** section shows dated provider
verdicts, versions, revalidation dates, binding/health state, allowlisted credential reference
names, normalized receipts and migration evidence. It cannot finish OAuth, install a secret,
activate a paid provider, switch a plan or purchase anything.

Removing an optional provider means retiring its binding, revoking its narrow credential or
webhook outside the repository, and retaining canonical history. Direct/manual held operation
remains available; it is recommended to the owner but is never executed as silent failover.
