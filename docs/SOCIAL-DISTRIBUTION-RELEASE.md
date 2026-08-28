# Social Distribution staged release and rollback

Version: 2026-08-28

Authority: GitHub #413. This is release evidence, not account, OAuth, connection, provider,
campaign, queue, spend or publishing authority.

## Current posture

- There are zero live connections. Six real venture profiles, six Direct Meta connection bindings,
  all optional providers, all future profiles and every routine scope remain held or draft-only.
- Validation uses no live credentials, no live model/provider calls, no account changes, no social
  engagement, no ads or purchases, and no production deployment.
- Direct Meta is the retained official core. Buffer, Metricool and n8n remain held; Make is disabled
  and Ayrshare rejected. #430 remains held and Contest Radar is outside this release.
- The only outstanding owner setup is `SOCIAL-DISTRIBUTION-CONNECTION-001` in `docs/NEEDED.md`.
  Repository completion does not countersign it on the owner's behalf.

## Staged activation

### Stage 0 — repository release

Run the full release matrix and `pnpm social:release-audit`. Merge only a passing, credential-free
revision. Keep the global kill switch engaged, every connection `held`, every profile non-live and
the routine-scope registry `draft-only`.

### Stage 1 — owner setup

The owner may later provide the exact Meta app/account secret reference values outside git,
complete OAuth/App Review, verify scopes and native account ids, then countersign the one bounded
connection request. Record timestamps and evidence refs only. Do not add values to config, state,
logs, Admin responses, issues or comments.

### Stage 2 — dry verification

Run `pnpm social:publish -- --validate-only --dry-if-disabled` for the exact connection. Require
current capability, provider, credential-reference availability, expiry, policy, queue hash,
accessibility, claim, cadence, budget and kill-switch evidence. A hold, malformed record or missing
value is a successful safe stop, not permission to improvise.

### Stage 3 — one-connection canary

Only after a separate owner activation and exact countersigned routine scope, release one existing
connection for one approved original item. Do not activate another profile/provider, widen scopes,
raise cadence or budget, or reuse the decision for an amplifier. Require two-phase idempotency,
remote verification and immutable canonical/provider receipts. An ambiguous response enters
reconciliation and must not be resent.

### Stage 4 — bounded operation

Review the Prague-day `Today`, `Results`, `Learning`, `Automation health` and `Plan & progress`
surfaces. Preserve `NO_POST`, per-connection failure isolation, frozen policy/privacy gates and the
28-day baseline/two-experiment ceiling. Further connections need their own owner evidence and
canary; no stage activates optional providers or external accounts automatically.

## Rollback

1. Engage the exact connection pause or the global Social kill switch. Do not delete an account,
   queue item, receipt, remote id, failure, learning record or migration source.
2. If delivery is ambiguous, reconcile by idempotency key and read-only remote evidence before any
   resend. Never fail over silently.
3. Restore the previous held Direct Meta binding/config version and revoke only the exact routine
   scope involved. Keep the legacy `QueueItemSchema` and `SocialActivationSchema` readers available.
4. Record the bounded incident in canonical Operations/owner-attention evidence. Recovery is owned
   by #427, costs $0 incrementally and pauses only the failing connection.
5. Re-run the complete validation and release audit. Re-activation requires a new explicit owner
   decision; a rollback is not authority to try another account or provider.
